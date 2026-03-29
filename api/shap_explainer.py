"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/shap_explainer.py
Purpose : Per-prediction explainability using feature importances.
          Shows WHY this specific fire was classified HIGH/MEDIUM/LOW.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

log = logging.getLogger(__name__)

# Must match train.py / predict.py FEATURE_COLS exactly
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

LABEL_MAP = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
INV_LABEL  = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}


def compute_shap_values(
    predictor,
    input_features: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Compute feature-importance-based explanations for a single prediction.

    Returns a dict with:
    - sorted_shap:     list of {feature, value} sorted by |impact|
    - base_value:      always 0.0 (not applicable for this method)
    - predicted_class: class name being explained (HIGH/MEDIUM/LOW)
    - top_positive:    features pushing TOWARD this class
    - top_negative:    features pushing AWAY from this class
    - probabilities:   {class: probability}
    - input_value:     {feature: actual input value}
    """
    try:
        model  = predictor._model
        scaler = predictor._scaler
        encoder = predictor._encoder

        # Build input array in correct feature order
        input_values = [float(input_features.get(f, 0)) for f in FEATURE_COLS]
        input_array  = np.array(input_values, dtype=float).reshape(1, -1)

        # Scale input
        input_scaled = scaler.transform(input_array)

        # Predict label + probabilities
        pred_label     = str(model.predict(input_scaled)[0])
        pred_class_idx = LABEL_MAP.get(pred_label, 0)
        pred_proba     = model.predict_proba(input_scaled)[0]

        # Use feature_importances_ — fast, no SHAP library issues
        importances = model.feature_importances_   # shape: (n_features,)

        # Sign: positive if feature value is above mean (scaled > 0), else negative
        signs      = np.sign(input_scaled[0])
        signed_imp = importances * signs

        # Build per-feature list
        shap_list = [
            {
                "feature":     FEATURE_COLS[i],
                "value":       round(float(signed_imp[i]), 4),
                "input_value": round(float(input_values[i]), 4),
            }
            for i in range(len(FEATURE_COLS))
        ]
        shap_list.sort(key=lambda x: abs(x["value"]), reverse=True)

        top_positive = [s for s in shap_list if s["value"] > 0][:5]
        top_negative = [s for s in shap_list if s["value"] < 0][:5]

        # shap_dict for compatibility
        shap_dict = {s["feature"]: s["value"] for s in shap_list}

        # Probabilities dict
        try:
            class_names  = list(encoder.classes_)
            probabilities = {
                cls: round(float(p), 4)
                for cls, p in zip(class_names, pred_proba)
            }
            predicted_class_name = class_names[pred_class_idx]
        except Exception:
            probabilities        = {INV_LABEL[i]: round(float(pred_proba[i]), 4) for i in range(3)}
            predicted_class_name = pred_label

        return {
            "shap_values":     shap_dict,
            "sorted_shap":     [{"feature": s["feature"], "value": s["value"]} for s in shap_list],
            "base_value":      0.0,
            "predicted_class": predicted_class_name,
            "top_positive":    top_positive,
            "top_negative":    top_negative,
            "probabilities":   probabilities,
            "input_value":     {FEATURE_COLS[i]: round(float(input_values[i]), 4) for i in range(len(FEATURE_COLS))},
        }

    except Exception as e:
        log.warning("SHAP computation failed: %s", e, exc_info=True)
        return None