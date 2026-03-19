"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/main.py
Purpose : FastAPI backend — exposes the prediction engine, incident data,
          alert system, and model info as REST endpoints consumed by React.
Usage   : uvicorn api.main:app --reload --port 8000
          (run from project root)
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Load .env from project root
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ---------------------------------------------------------------------------
# Paths & logging
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORT_PATH  = PROJECT_ROOT / "models" / "model_report.json"
DATA_PATH    = PROJECT_ROOT / "data" / "processed" / "clean_fire_data.csv"
RAW_PATH     = PROJECT_ROOT / "data" / "raw"    / "California_Fire_Incidents.csv"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Import predictor (path-safe for running from project root)
# ---------------------------------------------------------------------------
sys.path.insert(0, str(PROJECT_ROOT))
from ml.predict import WildfirePredictor  # noqa: E402

# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------
app = FastAPI(
    title="GeoAI Forest Fire Risk Intelligence API",
    description="Wildfire severity prediction, risk classification, and alert system.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Load predictor once at startup
# ---------------------------------------------------------------------------
predictor: WildfirePredictor | None = None

@app.on_event("startup")
async def startup_event() -> None:
    global predictor
    log.info("Loading WildfirePredictor...")
    try:
        predictor = WildfirePredictor()
        log.info("Predictor ready — model: %s", predictor._model_name)
    except FileNotFoundError as e:
        log.error("Model artifacts missing: %s", e)
        log.error("Run  python ml/train.py  before starting the API.")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    County:            int   = Field(10,     ge=0,    le=58,   description="Label-encoded county (0–58)")
    Latitude:          float = Field(37.0,   ge=32.0, le=42.0, description="California only: 32.0–42.0")
    Longitude:         float = Field(-120.0, ge=-125.0, le=-114.0, description="California only: −125 to −114")
    PercentContained:  float = Field(50.0,   ge=0.0,  le=100.0)
    PersonnelInvolved: int   = Field(50,     ge=0)
    Engines:           int   = Field(10,     ge=0)
    Helicopters:       int   = Field(2,      ge=0)
    Dozers:            int   = Field(1,      ge=0)
    WaterTenders:      int   = Field(3,      ge=0)
    MajorIncident:     int   = Field(0,      ge=0,   le=1,    description="0=No 1=Yes")

    model_config = {"json_schema_extra": {"example": {
        "County": 25, "Latitude": 36.5, "Longitude": -119.5,
        "PercentContained": 30.0, "PersonnelInvolved": 150,
        "Engines": 25, "Helicopters": 5, "Dozers": 3,
        "WaterTenders": 8, "MajorIncident": 1,
    }}}


class PredictResponse(BaseModel):
    risk_level:    str
    acres_est:     int
    acres_range:   str
    confidence:    float
    probabilities: dict
    alert:         bool
    color:         str
    message:       str
    model_name:    str
    input_features: dict


class AlertResponse(BaseModel):
    alert:      bool
    risk_level: str
    message:    str
    color:      str
    sound:      bool   # tells React whether to play the alarm sound


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", tags=["Health"])
async def root():
    return {
        "status": "ok",
        "service": "GeoAI Forest Fire Risk Intelligence API",
        "version": "1.0.0",
        "endpoints": ["/predict", "/alert", "/incidents", "/analytics", "/model-info"],
    }


@app.get("/health", tags=["Health"])
async def health():
    model_ready = predictor is not None
    return {
        "status": "ok" if model_ready else "degraded",
        "model_loaded": model_ready,
        "model_name": predictor._model_name if model_ready else None,
    }


# ── Prediction ────────────────────────────────────────────────────────────

@app.post("/predict", tags=["Prediction"])
async def predict(request: PredictRequest):
    """
    Run wildfire severity prediction.
    Returns risk level (LOW / MEDIUM / HIGH), confidence, and action message.
    """
    if predictor is None:
        raise HTTPException(503, "Model not loaded. Run python ml/train.py first.")

    result = predictor.predict(request.model_dump())
    result_dict = result.to_dict()

    # Attach feature importance so the UI can show which factors drove this prediction
    if hasattr(predictor._model, 'feature_importances_'):
        importances = predictor._model.feature_importances_
        fi = {
            col: round(float(imp), 4)
            for col, imp in zip(
                predictor._report.get('feature_cols', []) if predictor._report else [],
                importances
            )
        }
        # Sort descending
        result_dict['feature_importances'] = dict(
            sorted(fi.items(), key=lambda x: x[1], reverse=True)
        )
    else:
        result_dict['feature_importances'] = {}

    return result_dict


# ── Alert ─────────────────────────────────────────────────────────────────

@app.post("/alert", response_model=AlertResponse, tags=["Alert"])
async def check_alert(request: PredictRequest):
    """
    Check whether a given incident should trigger an alarm.
    Returns alert=True and sound=True when risk_level == HIGH.
    React uses this to play the alarm sound and flash the UI.
    """
    if predictor is None:
        raise HTTPException(503, "Model not loaded.")

    result = predictor.predict(request.model_dump())
    return {
        "alert":      result.alert,
        "risk_level": result.risk_level,
        "message":    result.message,
        "color":      result.color,
        "sound":      result.alert,   # HIGH → play alarm
    }


# ── Incidents (map data) ──────────────────────────────────────────────────

@app.get("/incidents", tags=["Data"])
async def get_incidents(
    limit: int = 500,
    min_acres: float = 0,
):
    """
    Return processed incident records for the wildfire map.
    Includes lat/lon, AcresBurned, County, and a precomputed risk_level.
    """
    if not DATA_PATH.exists():
        raise HTTPException(404, "Processed data not found. Run preprocessing.py.")

    raw_df = None
    if RAW_PATH.exists():
        try:
            raw_df = pd.read_csv(RAW_PATH, usecols=[
                "Name", "Started", "Counties", "AcresBurned",
                "Latitude", "Longitude", "PercentContained",
            ], low_memory=False)
        except Exception:
            raw_df = None

    df = pd.read_csv(DATA_PATH, low_memory=False)

    # Filter by minimum acres
    if "AcresBurned" in df.columns and min_acres > 0:
        df = df[df["AcresBurned"] >= min_acres]

    # Attach risk label based on AcresBurned thresholds
    def risk_label(acres: float) -> str:
        if acres > 10_000:
            return "HIGH"
        if acres > 1_000:
            return "MEDIUM"
        return "LOW"

    # Use raw name/date if available
    records = []
    for i, row in df.head(limit).iterrows():
        rec = {
            "id":              int(i),
            "latitude":        float(row.get("Latitude",   0)),
            "longitude":       float(row.get("Longitude",  0)),
            "acres_burned":    float(row.get("AcresBurned", 0)),
            "county":          int(row.get("County",       0)),
            "percent_contained": float(row.get("PercentContained", 0)),
            "major_incident":  int(row.get("MajorIncident", 0)),
            "risk_level":      risk_label(float(row.get("AcresBurned", 0))),
        }
        # Add human-readable fields from raw if available
        if raw_df is not None and i < len(raw_df):
            raw_row = raw_df.iloc[i]
            rec["name"]    = str(raw_row.get("Name",    "Unknown Fire"))
            rec["started"] = str(raw_row.get("Started", ""))
        else:
            rec["name"]    = f"Fire Incident #{i}"
            rec["started"] = ""

        records.append(rec)

    return {
        "total":   len(records),
        "records": records,
    }


# ── Analytics ─────────────────────────────────────────────────────────────

@app.get("/analytics", tags=["Data"])
async def get_analytics():
    """
    Return aggregated statistics computed from real data for the dashboard.
    All numbers here come from clean_fire_data.csv — nothing is hardcoded.
    """
    if not DATA_PATH.exists():
        raise HTTPException(404, "Processed data not found. Run preprocessing.py.")

    df = pd.read_csv(DATA_PATH, low_memory=False)

    def risk_label(acres: float) -> str:
        if acres > 10_000: return "HIGH"
        if acres > 1_000:  return "MEDIUM"
        return "LOW"

    df["risk_level"] = df["AcresBurned"].apply(risk_label)

    # Severity distribution
    severity_dist = df["risk_level"].value_counts().to_dict()

    # County distribution — top 10 by incident count
    county_counts = (
        df.groupby("County").size()
        .sort_values(ascending=False)
        .head(10)
        .reset_index()
        .rename(columns={0: "count"})
    )
    county_data = county_counts.to_dict(orient="records")

    # Acres burned distribution buckets
    bins   = [0, 100, 500, 1_000, 5_000, 10_000, 50_000, float("inf")]
    labels = ["0–100", "100–500", "500–1K", "1K–5K", "5K–10K", "10K–50K", "50K+"]
    df["acres_bucket"] = pd.cut(df["AcresBurned"], bins=bins, labels=labels, right=True)
    acres_dist = df["acres_bucket"].value_counts().sort_index().to_dict()
    acres_dist = {str(k): int(v) for k, v in acres_dist.items()}

    # Containment stats
    containment_mean = round(float(df["PercentContained"].mean()), 1)
    containment_median = round(float(df["PercentContained"].median()), 1)

    # Resource averages by risk level
    resource_cols = ["PersonnelInvolved", "Engines", "Helicopters", "Dozers", "WaterTenders"]
    resource_by_risk = (
        df.groupby("risk_level")[resource_cols]
        .mean()
        .round(1)
        .to_dict(orient="index")
    )

    # Year-over-year incident counts (from ArchiveYear)
    year_counts = {}
    if "ArchiveYear" in df.columns:
        year_counts = df["ArchiveYear"].value_counts().sort_index().to_dict()
        year_counts = {str(int(k)): int(v) for k, v in year_counts.items()}

    return {
        "total_incidents":     len(df),
        "severity_distribution": severity_dist,
        "county_distribution": county_data,
        "acres_distribution":  acres_dist,
        "containment": {
            "mean":   containment_mean,
            "median": containment_median,
        },
        "resource_by_risk":   resource_by_risk,
        "incidents_by_year":  year_counts,
        "summary_stats": {
            "total_acres_burned": int(df["AcresBurned"].sum()),
            "avg_acres_per_fire": round(float(df["AcresBurned"].mean()), 1),
            "max_acres":          int(df["AcresBurned"].max()),
            "major_incidents":    int(df["MajorIncident"].sum()) if "MajorIncident" in df.columns else 0,
        },
    }


# ── Model info ────────────────────────────────────────────────────────────

@app.get("/model-info", tags=["Model"])
async def model_info():
    """
    Return trained model metrics for the dashboard comparison table.
    Reads directly from models/model_report.json.
    """
    if predictor is None:
        raise HTTPException(503, "Model not loaded.")
    return predictor.get_model_info()


# ── Resource Recommender ──────────────────────────────────────────────────

@app.get("/recommend-resources", tags=["Decision Support"])
async def recommend_resources(
    risk_level: str = "HIGH",
    acres_est:  int = 5000,
):
    """
    Given a risk level and estimated acres, find similar historical incidents
    and return the median resource deployment as a recommendation.

    This turns a prediction into an actionable deployment plan:
    'Based on 23 similar incidents, deploy 45 engines and 320 personnel.'
    """
    if not DATA_PATH.exists():
        raise HTTPException(404, "Processed data not found.")

    df = pd.read_csv(DATA_PATH, low_memory=False)

    # Define similarity window: ±50% of predicted acres
    lo = acres_est * 0.5
    hi = acres_est * 1.5

    # Risk label helper
    def rl(acres):
        if acres > 10_000: return "HIGH"
        if acres > 1_000:  return "MEDIUM"
        return "LOW"

    df["risk_level"] = df["AcresBurned"].apply(rl)

    # Filter: same risk level AND within acres window
    similar = df[
        (df["risk_level"] == risk_level.upper()) &
        (df["AcresBurned"] >= lo) &
        (df["AcresBurned"] <= hi)
    ]

    # Fall back to risk-level only if window is too narrow
    if len(similar) < 5:
        similar = df[df["risk_level"] == risk_level.upper()]

    resource_cols = [
        "PersonnelInvolved", "Engines", "Helicopters",
        "Dozers", "WaterTenders",
    ]

    # Dataset-wide averages for comparison bars in UI
    overall_avg = df[resource_cols].median().round(1).to_dict()

    if similar.empty:
        return {
            "risk_level":       risk_level.upper(),
            "acres_est":        acres_est,
            "similar_count":    0,
            "recommended":      {c: 0 for c in resource_cols},
            "dataset_avg":      overall_avg,
            "confidence":       "low",
            "message":          "No similar incidents found in dataset.",
        }

    rec     = similar[resource_cols].median().round(0).astype(int).to_dict()
    count   = len(similar)
    conf    = "high" if count >= 20 else "medium" if count >= 8 else "low"

    # Human-readable summary sentence
    msg = (
        f"Based on {count} similar {risk_level.upper()} incidents "
        f"({lo:,.0f}–{hi:,.0f} acres), deploy approximately "
        f"{rec.get('PersonnelInvolved', 0):,} personnel, "
        f"{rec.get('Engines', 0)} engines, and "
        f"{rec.get('Helicopters', 0)} helicopters for effective containment."
    )

# ── AI Incident Report Generator ─────────────────────────────────────────

@app.post("/generate-report", tags=["Decision Support"])
async def generate_report(request: PredictRequest):
    """
    Generate a professional AI incident report using Claude.
    Produces a formatted report a fire chief would actually submit.
    """
    if predictor is None:
        raise HTTPException(503, "Model not loaded.")

    from api.report_generator import generate_incident_report

    result      = predictor.predict(request.model_dump())
    result_dict = result.to_dict()

    if hasattr(predictor._model, "feature_importances_"):
        importances = predictor._model.feature_importances_
        fi = {
            col: round(float(imp), 4)
            for col, imp in zip(
                predictor._report.get("feature_cols", []) if predictor._report else [],
                importances,
            )
        }
        result_dict["feature_importances"] = dict(
            sorted(fi.items(), key=lambda x: x[1], reverse=True)
        )

    report = generate_incident_report(result_dict)
    return {
        "prediction": result_dict,
        "report":     report,
    }

@app.post("/send-alert", tags=["Alert"])
async def send_alert(request: PredictRequest):
    """
    Run prediction AND dispatch email + SMS alerts if risk is HIGH.
    Called automatically from React when a HIGH prediction is made.
    """
    if predictor is None:
        raise HTTPException(503, "Model not loaded.")

    from api.alert_engine import dispatch_alerts

    result      = predictor.predict(request.model_dump())
    result_dict = result.to_dict()
    alert_result = dispatch_alerts(result_dict)

    return {
        "prediction": result_dict,
        "alerts":     alert_result,
    }


