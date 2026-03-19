"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : ml/predict.py
Purpose : Inference engine — loads trained artifacts and predicts wildfire
          severity for a single incident input dict.
          Also acts as a CLI smoke-test when run directly.
Usage   : python ml/predict.py
API use : from ml.predict import WildfirePredictor
"""

from __future__ import annotations

import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT  = Path(__file__).resolve().parent.parent
MODELS_DIR    = PROJECT_ROOT / "models"
MODEL_PATH    = MODELS_DIR / "best_model.pkl"
SCALER_PATH   = MODELS_DIR / "scaler.pkl"
ENCODER_PATH  = MODELS_DIR / "label_encoder.pkl"
REPORT_PATH   = MODELS_DIR / "model_report.json"

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature order — must exactly match train.py FEATURE_COLS
# ---------------------------------------------------------------------------
FEATURE_COLS = [
    "County",
    "Latitude",
    "Longitude",
    "PercentContained",
    "PersonnelInvolved",
    "Engines",
    "Helicopters",
    "Dozers",
    "WaterTenders",
    "MajorIncident",
    "resource_intensity",
    "suppression_power",
    "containment_efficiency",
]

# ---------------------------------------------------------------------------
# Severity → acres-burned estimate mapping
# (approximate mid-points of each bin for display in the UI)
# ---------------------------------------------------------------------------
SEVERITY_ACRES: dict[str, dict] = {
    "LOW": {
        "label":       "LOW",
        "acres_est":   500,          # representative mid-point 0–1,000
        "acres_range": "< 1,000",
        "color":       "#27ae60",
        "alert":       False,
        "message":     "Situation manageable with current resources.",
    },
    "MEDIUM": {
        "label":       "MEDIUM",
        "acres_est":   5_000,        # mid-point 1,000–10,000
        "acres_range": "1,000 – 10,000",
        "color":       "#e67e22",
        "alert":       False,
        "message":     "Significant fire — scale up resources and monitor closely.",
    },
    "HIGH": {
        "label":       "HIGH",
        "acres_est":   50_000,       # representative value > 10,000
        "acres_range": "> 10,000",
        "color":       "#c0392b",
        "alert":       True,
        "message":     "CRITICAL — deploy maximum resources and initiate evacuation.",
    },
}


# ---------------------------------------------------------------------------
# Prediction result dataclass
# ---------------------------------------------------------------------------
@dataclass
class PredictionResult:
    risk_level:    str           # LOW | MEDIUM | HIGH
    acres_est:     int           # representative acres estimate
    acres_range:   str           # human-readable range string
    confidence:    float         # probability of predicted class (0–1)
    probabilities: dict          # {LOW: p, MEDIUM: p, HIGH: p}
    alert:         bool          # True when risk_level == HIGH
    color:         str           # hex colour for UI
    message:       str           # human-readable action message
    model_name:    str           # which model made the prediction
    input_features: dict         # echoes back the processed input

    def to_dict(self) -> dict:
        return {
            "risk_level":    self.risk_level,
            "acres_est":     self.acres_est,
            "acres_range":   self.acres_range,
            "confidence":    round(self.confidence, 4),
            "probabilities": {k: round(v, 4) for k, v in self.probabilities.items()},
            "alert":         self.alert,
            "color":         self.color,
            "message":       self.message,
            "model_name":    self.model_name,
            "input_features": self.input_features,
        }


# ---------------------------------------------------------------------------
# WildfirePredictor — main class
# ---------------------------------------------------------------------------
class WildfirePredictor:
    """
    Loads trained artifacts once and exposes a `predict()` method.
    Designed to be imported by FastAPI and instantiated at startup.

    Example
    -------
    predictor = WildfirePredictor()
    result    = predictor.predict({
        "County": 10, "Latitude": 37.5, "Longitude": -120.5,
        "PercentContained": 20.0, "PersonnelInvolved": 300,
        "Engines": 40, "Helicopters": 8, "Dozers": 5,
        "WaterTenders": 10, "MajorIncident": 1,
    })
    print(result.to_dict())
    """

    def __init__(self) -> None:
        self._model      = None
        self._scaler     = None
        self._encoder    = None
        self._report     = None
        self._model_name = "Unknown"
        self._load_artifacts()

    # ------------------------------------------------------------------
    # Load
    # ------------------------------------------------------------------
    def _load_artifacts(self) -> None:
        """Load model, scaler, label encoder, and report from disk."""
        missing = [p for p in (MODEL_PATH, SCALER_PATH, ENCODER_PATH) if not p.exists()]
        if missing:
            raise FileNotFoundError(
                f"Missing model artifacts: {missing}\n"
                "Run  python ml/train.py  first."
            )

        self._model   = joblib.load(MODEL_PATH)
        self._scaler  = joblib.load(SCALER_PATH)
        self._encoder = joblib.load(ENCODER_PATH)

        if REPORT_PATH.exists():
            with open(REPORT_PATH) as f:
                self._report = json.load(f)
            self._model_name = self._report.get("best_model", "Unknown")

        log.info("Predictor loaded  : %s", self._model_name)
        log.info("Model path        : %s", MODEL_PATH)

    # ------------------------------------------------------------------
    # Feature engineering (mirrors preprocessing.py)
    # ------------------------------------------------------------------
    @staticmethod
    def _engineer_features(raw: dict) -> dict:
        """Add the three engineered features to the raw input dict."""
        personnel  = float(raw.get("PersonnelInvolved", 0))
        engines    = float(raw.get("Engines",           0))
        helicopters = float(raw.get("Helicopters",      0))
        dozers     = float(raw.get("Dozers",            0))
        contained  = float(raw.get("PercentContained",  0))

        raw["resource_intensity"]     = personnel / (engines + 1)
        raw["suppression_power"]      = helicopters + dozers
        raw["containment_efficiency"] = contained  / (personnel + 1)
        return raw

    # ------------------------------------------------------------------
    # Validate + coerce input
    # ------------------------------------------------------------------
    @staticmethod
    def _validate_input(raw: dict) -> dict:
        """
        Ensure all required base fields exist and are numeric.
        Fills missing fields with safe defaults and logs warnings.
        """
        base_defaults = {
            "County":           0,
            "Latitude":         37.0,
            "Longitude":        -120.0,
            "PercentContained": 0.0,
            "PersonnelInvolved": 0,
            "Engines":          0,
            "Helicopters":      0,
            "Dozers":           0,
            "WaterTenders":     0,
            "MajorIncident":    0,
        }
        cleaned = {}
        for field, default in base_defaults.items():
            val = raw.get(field, default)
            try:
                cleaned[field] = float(val)
            except (TypeError, ValueError):
                log.warning("Invalid value for '%s' (%s) — using default %s",
                            field, val, default)
                cleaned[field] = float(default)

        # Clamp PercentContained to [0, 100]
        cleaned["PercentContained"] = float(
            np.clip(cleaned["PercentContained"], 0.0, 100.0)
        )
        return cleaned

    # ------------------------------------------------------------------
    # Core predict
    # ------------------------------------------------------------------
    def predict(self, raw_input: dict[str, Any]) -> PredictionResult:
        """
        Run inference on a single raw input dict.

        Parameters
        ----------
        raw_input : dict
            Keys: County, Latitude, Longitude, PercentContained,
                  PersonnelInvolved, Engines, Helicopters, Dozers,
                  WaterTenders, MajorIncident

        Returns
        -------
        PredictionResult dataclass
        """
        # 1. Validate and clean
        cleaned = self._validate_input(raw_input)

        # 2. Engineer features (same logic as preprocessing.py)
        enriched = self._engineer_features(cleaned.copy())

        # 3. Build DataFrame in exact feature order
        df = pd.DataFrame([enriched])[FEATURE_COLS]

        # 4. Scale
        X_scaled = self._scaler.transform(df)

        # 5. Predict class + probabilities
        # GradientBoosting and RF return string labels directly;
        # XGBoost was trained with integer labels → decode back.
        raw_pred = self._model.predict(X_scaled)[0]

        if hasattr(self._model, "classes_") and np.issubdtype(
            type(raw_pred), np.integer
        ):
            risk_level = self._encoder.inverse_transform([int(raw_pred)])[0]
        else:
            risk_level = str(raw_pred)

        # 6. Class probabilities → map to string labels
        proba_arr   = self._model.predict_proba(X_scaled)[0]
        class_order = [str(c) for c in self._model.classes_]

        # If classes are integers (XGBoost path), decode them
        if class_order and class_order[0].lstrip("-").isdigit():
            class_order = [
                str(self._encoder.inverse_transform([int(c)])[0])
                for c in class_order
            ]

        probabilities = {
            cls: float(p) for cls, p in zip(class_order, proba_arr)
        }
        # Ensure all three keys are always present
        for key in ("LOW", "MEDIUM", "HIGH"):
            probabilities.setdefault(key, 0.0)

        confidence = probabilities.get(risk_level, 0.0)

        # 7. Build result
        meta = SEVERITY_ACRES[risk_level]
        return PredictionResult(
            risk_level=risk_level,
            acres_est=meta["acres_est"],
            acres_range=meta["acres_range"],
            confidence=confidence,
            probabilities=probabilities,
            alert=meta["alert"],
            color=meta["color"],
            message=meta["message"],
            model_name=self._model_name,
            input_features=enriched,
        )

    # ------------------------------------------------------------------
    # Model info (used by FastAPI /model-info endpoint)
    # ------------------------------------------------------------------
    def get_model_info(self) -> dict:
        """Return a JSON-serialisable summary of the trained model."""
        if not self._report:
            return {"model_name": self._model_name}

        best = self._report["models"].get(self._model_name, {})
        return {
            "best_model":   self._model_name,
            "accuracy":     best.get("accuracy"),
            "f1_weighted":  best.get("f1_weighted"),
            "f1_macro":     best.get("f1_macro"),
            "cv_mean":      best.get("cv_mean"),
            "cv_std":       best.get("cv_std"),
            "feature_cols": FEATURE_COLS,
            "severity_bins": self._report.get("severity_bins", {}),
            "all_models": {
                name: {
                    "accuracy":    m.get("accuracy"),
                    "f1_weighted": m.get("f1_weighted"),
                    "cv_mean":     m.get("cv_mean"),
                }
                for name, m in self._report.get("models", {}).items()
            },
        }


# ---------------------------------------------------------------------------
# CLI smoke-test
# ---------------------------------------------------------------------------
def run_smoke_test(predictor: WildfirePredictor) -> None:
    """Run 4 built-in scenarios and print results to stdout."""
    scenarios = [
        {
            "name": "Minor brush fire",
            "input": {
                "County": 15, "Latitude": 38.5, "Longitude": -121.5,
                "PercentContained": 75.0, "PersonnelInvolved": 25,
                "Engines": 5, "Helicopters": 1, "Dozers": 0,
                "WaterTenders": 1, "MajorIncident": 0,
            },
        },
        {
            "name": "Growing moderate fire",
            "input": {
                "County": 25, "Latitude": 36.5, "Longitude": -119.5,
                "PercentContained": 30.0, "PersonnelInvolved": 150,
                "Engines": 25, "Helicopters": 5, "Dozers": 3,
                "WaterTenders": 8, "MajorIncident": 1,
            },
        },
        {
            "name": "Critical major incident",
            "input": {
                "County": 35, "Latitude": 39.0, "Longitude": -122.0,
                "PercentContained": 5.0, "PersonnelInvolved": 800,
                "Engines": 100, "Helicopters": 20, "Dozers": 15,
                "WaterTenders": 25, "MajorIncident": 1,
            },
        },
        {
            "name": "Nearly contained fire",
            "input": {
                "County": 20, "Latitude": 37.8, "Longitude": -120.8,
                "PercentContained": 95.0, "PersonnelInvolved": 80,
                "Engines": 10, "Helicopters": 2, "Dozers": 1,
                "WaterTenders": 4, "MajorIncident": 0,
            },
        },
    ]

    log.info("")
    log.info("=" * 60)
    log.info("  Smoke Test — 4 Scenarios")
    log.info("=" * 60)

    for s in scenarios:
        result = predictor.predict(s["input"])
        alert_str = "  🚨 ALARM TRIGGERED" if result.alert else ""
        log.info(
            "\n  Scenario    : %s\n"
            "  Risk Level  : %s%s\n"
            "  Acres Est.  : %s acres (%s)\n"
            "  Confidence  : %.1f%%\n"
            "  Probs       : LOW=%.2f  MEDIUM=%.2f  HIGH=%.2f\n"
            "  Message     : %s",
            s["name"],
            result.risk_level, alert_str,
            f"{result.acres_est:,}", result.acres_range,
            result.confidence * 100,
            result.probabilities.get("LOW",    0),
            result.probabilities.get("MEDIUM", 0),
            result.probabilities.get("HIGH",   0),
            result.message,
        )

    log.info("")
    log.info("Smoke test complete. All scenarios passed.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    log.info("=" * 60)
    log.info("  GeoAI Forest Fire — Prediction Engine")
    log.info("=" * 60)

    predictor = WildfirePredictor()

    log.info("")
    log.info("Model info:")
    info = predictor.get_model_info()
    log.info("  Best model  : %s", info["best_model"])
    log.info("  Accuracy    : %.4f", info.get("accuracy", 0))
    log.info("  F1 weighted : %.4f", info.get("f1_weighted", 0))
    log.info("  CV F1 mean  : %.4f ± %.4f",
             info.get("cv_mean", 0), info.get("cv_std", 0))

    run_smoke_test(predictor)


if __name__ == "__main__":
    main()