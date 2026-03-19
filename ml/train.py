"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : ml/train.py
Purpose : Train, compare, and save the best wildfire severity prediction model.
          Trains Random Forest, XGBoost, and Gradient Boosting — selects best
          by F1-weighted score — saves model + scaler + full report.
Usage   : python ml/train.py
Output  : models/best_model.pkl
          models/scaler.pkl
          models/label_encoder.pkl
          models/model_report.json
"""

from __future__ import annotations

import json
import logging
import sys
import time
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DATA_PATH = PROJECT_ROOT / "data" / "processed" / "clean_fire_data.csv"
MODELS_DIR = PROJECT_ROOT / "models"

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
# Feature columns — must match app.py input order exactly
# ---------------------------------------------------------------------------
FEATURE_COLS = [
    "County",            # label-encoded county
    "Latitude",
    "Longitude",
    "PercentContained",
    "PersonnelInvolved",
    "Engines",
    "Helicopters",
    "Dozers",
    "WaterTenders",
    "MajorIncident",
    # engineered features from preprocessing.py
    "resource_intensity",
    "suppression_power",
    "containment_efficiency",
]
TARGET_COL = "SeverityLabel"


# ---------------------------------------------------------------------------
# Severity labelling (converts AcresBurned → LOW / MEDIUM / HIGH)
# ---------------------------------------------------------------------------
def create_severity_labels(df: pd.DataFrame) -> pd.DataFrame:
    """
    Bin AcresBurned into three risk tiers:
        LOW    : < 1,000 acres
        MEDIUM : 1,000 – 10,000 acres
        HIGH   : > 10,000 acres
    """
    if "AcresBurned" not in df.columns:
        raise ValueError("Column 'AcresBurned' not found in dataset.")

    bins   = [-np.inf, 1_000, 10_000, np.inf]
    labels = ["LOW", "MEDIUM", "HIGH"]

    df[TARGET_COL] = pd.cut(
        df["AcresBurned"], bins=bins, labels=labels, right=True
    ).astype(str)

    dist = df[TARGET_COL].value_counts()
    log.info("Severity label distribution:\n  LOW=%d  MEDIUM=%d  HIGH=%d",
             dist.get("LOW", 0), dist.get("MEDIUM", 0), dist.get("HIGH", 0))
    return df


# ---------------------------------------------------------------------------
# Build feature matrix
# ---------------------------------------------------------------------------
def build_features(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """
    Select available feature columns and return (X, y).
    Missing feature columns are filled with 0 and a warning is logged.
    """
    available = [c for c in FEATURE_COLS if c in df.columns]
    missing   = [c for c in FEATURE_COLS if c not in df.columns]

    if missing:
        log.warning("Feature columns not found (will use 0): %s", missing)
        for col in missing:
            df[col] = 0

    X = df[FEATURE_COLS].copy()
    y = df[TARGET_COL].copy()

    log.info("Feature matrix : %d rows × %d columns", *X.shape)
    log.info("Features used  : %s", FEATURE_COLS)
    return X, y


# ---------------------------------------------------------------------------
# Model definitions
# ---------------------------------------------------------------------------
def get_models() -> dict:
    """Return the three candidate classifiers with production-ready hyper-params."""
    return {
        "RandomForest": RandomForestClassifier(
            n_estimators=300,
            max_depth=12,
            min_samples_split=5,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        ),
        "XGBoost": XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            eval_metric="mlogloss",
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        ),
        "GradientBoosting": GradientBoostingClassifier(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.08,
            subsample=0.8,
            min_samples_split=5,
            random_state=42,
        ),
    }


# ---------------------------------------------------------------------------
# Train + evaluate all models
# ---------------------------------------------------------------------------
def train_and_evaluate(
    X_train: np.ndarray,
    X_test:  np.ndarray,
    y_train: np.ndarray,
    y_test:  np.ndarray,
    le:      LabelEncoder,
) -> dict:
    """
    Train each candidate model, compute metrics, return a results dict keyed
    by model name.
    """
    models  = get_models()
    results = {}

    log.info("")
    log.info("=" * 60)
    log.info("  Model Training & Evaluation")
    log.info("=" * 60)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    for name, model in models.items():
        log.info("\n[%s] Starting training...", name)
        t0 = time.perf_counter()

        # ── Train ──────────────────────────────────────────────────────
        if isinstance(model, XGBClassifier):
            # XGBoost needs integer labels
            y_train_enc = le.transform(y_train)
            y_test_enc  = le.transform(y_test)
            model.fit(X_train, y_train_enc)
            y_pred_enc  = model.predict(X_test)
            y_pred      = le.inverse_transform(y_pred_enc)

            cv_scores = cross_val_score(
                model, X_train, y_train_enc,
                cv=cv, scoring="f1_weighted", n_jobs=-1
            )
        else:
            model.fit(X_train, y_train)
            y_pred    = model.predict(X_test)
            cv_scores = cross_val_score(
                model, X_train, y_train,
                cv=cv, scoring="f1_weighted", n_jobs=-1
            )

        elapsed = time.perf_counter() - t0

        # ── Metrics ────────────────────────────────────────────────────
        acc      = accuracy_score(y_test, y_pred)
        f1_w     = f1_score(y_test, y_pred, average="weighted", zero_division=0)
        f1_macro = f1_score(y_test, y_pred, average="macro",    zero_division=0)
        cm       = confusion_matrix(y_test, y_pred, labels=["LOW", "MEDIUM", "HIGH"])
        clf_rep  = classification_report(
            y_test, y_pred, labels=["LOW", "MEDIUM", "HIGH"], zero_division=0
        )

        results[name] = {
            "model":        model,
            "accuracy":     round(float(acc),      4),
            "f1_weighted":  round(float(f1_w),     4),
            "f1_macro":     round(float(f1_macro),  4),
            "cv_mean":      round(float(cv_scores.mean()), 4),
            "cv_std":       round(float(cv_scores.std()),  4),
            "train_time_s": round(elapsed, 2),
            "confusion_matrix": cm.tolist(),
            "classification_report": clf_rep,
        }

        log.info(
            "  Accuracy      : %.4f\n"
            "  F1 (weighted) : %.4f\n"
            "  F1 (macro)    : %.4f\n"
            "  CV F1 (5-fold): %.4f ± %.4f\n"
            "  Train time    : %.2fs",
            acc, f1_w, f1_macro, cv_scores.mean(), cv_scores.std(), elapsed,
        )
        log.info("  Classification Report:\n%s", clf_rep)

    return results


# ---------------------------------------------------------------------------
# Select best model
# ---------------------------------------------------------------------------
def select_best_model(results: dict) -> str:
    """Return the name of the model with the highest F1-weighted score."""
    best = max(results, key=lambda n: results[n]["f1_weighted"])
    log.info("")
    log.info("=" * 60)
    log.info("  Best Model: %s  (F1=%.4f)", best, results[best]["f1_weighted"])
    log.info("=" * 60)
    return best


# ---------------------------------------------------------------------------
# Save artifacts
# ---------------------------------------------------------------------------
def save_artifacts(
    results:    dict,
    best_name:  str,
    scaler:     StandardScaler,
    le:         LabelEncoder,
    feature_cols: list[str],
) -> None:
    """Persist model, scaler, label encoder, and JSON report."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # Best model
    model_path = MODELS_DIR / "best_model.pkl"
    joblib.dump(results[best_name]["model"], model_path)
    log.info("Saved model   → %s", model_path)

    # Scaler
    scaler_path = MODELS_DIR / "scaler.pkl"
    joblib.dump(scaler, scaler_path)
    log.info("Saved scaler  → %s", scaler_path)

    # Label encoder
    le_path = MODELS_DIR / "label_encoder.pkl"
    joblib.dump(le, le_path)
    log.info("Saved encoder → %s", le_path)

    # Full report JSON
    report = {
        "best_model":   best_name,
        "feature_cols": feature_cols,
        "target_col":   TARGET_COL,
        "severity_bins": {
            "LOW":    "0 – 1,000 acres",
            "MEDIUM": "1,000 – 10,000 acres",
            "HIGH":   "> 10,000 acres",
        },
        "models": {
            name: {
                k: v for k, v in metrics.items()
                if k != "model"                     # don't serialise the object
            }
            for name, metrics in results.items()
        },
    }

    report_path = MODELS_DIR / "model_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    log.info("Saved report  → %s", report_path)


# ---------------------------------------------------------------------------
# Pretty comparison table
# ---------------------------------------------------------------------------
def print_comparison_table(results: dict, best_name: str) -> None:
    """Print a side-by-side model comparison table to stdout."""
    log.info("")
    log.info("=" * 60)
    log.info("  Model Comparison Summary")
    log.info("=" * 60)
    log.info(
        "  %-22s %-10s %-12s %-12s %-8s",
        "Model", "Accuracy", "F1-Weighted", "CV F1 Mean", "Time(s)"
    )
    log.info("  " + "-" * 58)

    for name, m in results.items():
        marker = " ← BEST" if name == best_name else ""
        log.info(
            "  %-22s %-10.4f %-12.4f %-12.4f %-8.2f%s",
            name, m["accuracy"], m["f1_weighted"], m["cv_mean"], m["train_time_s"], marker
        )

    log.info("=" * 60)


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def main() -> None:
    log.info("=" * 60)
    log.info("  GeoAI Forest Fire — Model Training Pipeline")
    log.info("=" * 60)

    # ── 1. Load processed data ────────────────────────────────────────
    if not PROCESSED_DATA_PATH.exists():
        log.error(
            "Processed data not found at %s.\n"
            "Run  python ml/preprocessing.py  first.",
            PROCESSED_DATA_PATH
        )
        sys.exit(1)

    df = pd.read_csv(PROCESSED_DATA_PATH, low_memory=False)
    log.info("Loaded dataset : %d rows × %d columns", *df.shape)

    # ── 2. Create severity labels ─────────────────────────────────────
    df = create_severity_labels(df)

    # ── 3. Build feature matrix ───────────────────────────────────────
    X, y = build_features(df)

    # ── 4. Encode target labels ───────────────────────────────────────
    le = LabelEncoder()
    le.fit(["LOW", "MEDIUM", "HIGH"])          # fix the order explicitly
    log.info("Label classes  : %s", list(le.classes_))

    # ── 5. Train / test split (80/20, stratified) ─────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    log.info("Train size: %d | Test size: %d", len(X_train), len(X_test))

    # ── 6. Scale features ─────────────────────────────────────────────
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)
    log.info("Feature scaling applied (StandardScaler)")

    # ── 6b. Balance classes with SMOTE ────────────────────────────────
    # Without this, 81% LOW rows dominate and the model never learns HIGH.
    # SMOTE synthesises new minority-class samples in feature space.
    # We apply it ONLY to training data — test set stays untouched.
    log.info("Applying SMOTE to balance training classes...")
    smote = SMOTE(random_state=42, k_neighbors=3)
    le_y_train = le.transform(y_train)          # SMOTE needs numeric labels
    X_train_s, y_train_bal_enc = smote.fit_resample(X_train_s, le_y_train)
    y_train = le.inverse_transform(y_train_bal_enc)   # back to string labels
    bal_dist = pd.Series(y_train).value_counts()
    log.info(
        "After SMOTE — LOW=%d  MEDIUM=%d  HIGH=%d",
        bal_dist.get("LOW", 0), bal_dist.get("MEDIUM", 0), bal_dist.get("HIGH", 0),
    )

    # ── 7. Train & evaluate all models ───────────────────────────────
    results   = train_and_evaluate(X_train_s, X_test_s, y_train, y_test, le)
    best_name = select_best_model(results)

    # ── 8. Print comparison table ────────────────────────────────────
    print_comparison_table(results, best_name)

    # ── 9. Save all artifacts ─────────────────────────────────────────
    save_artifacts(results, best_name, scaler, le, FEATURE_COLS)

    log.info("")
    log.info("Pipeline complete. Run  python ml/predict.py  to test inference.")


if __name__ == "__main__":
    main()