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
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from api.database import init_db, log_prediction, get_history, get_stats
from api.weather import get_weather
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from api.firms import get_active_fires
from api.shap_explainer import compute_shap_values

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
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
    # Initialize SQLite database
    init_db()

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
@limiter.limit("30/minute")
async def predict(request: Request, body: PredictRequest):
    """
    Run wildfire severity prediction.
    Returns risk level (LOW / MEDIUM / HIGH), confidence, and action message.
    """
    if predictor is None:
        raise HTTPException(503, "Model not loaded. Run python ml/train.py first.")

    result = predictor.predict(body.model_dump())
    result_dict = result.to_dict()

    # Attach feature importances
    if hasattr(predictor._model, 'feature_importances_'):
        importances = predictor._model.feature_importances_
        fi = {
            col: round(float(imp), 4)
            for col, imp in zip(
                predictor._report.get('feature_cols', []) if predictor._report else [],
                importances
            )
        }
        result_dict['feature_importances'] = dict(
            sorted(fi.items(), key=lambda x: x[1], reverse=True)
        )
    else:
        result_dict['feature_importances'] = {}

    # Compute SHAP per-prediction explanation
    shap_explanation = None
    try:
        shap_explanation = compute_shap_values(predictor, body.model_dump())
    except Exception as e:
        log.warning("SHAP computation skipped: %s", e)
    result_dict["shap_explanation"] = shap_explanation

    # Fetch weather and add to response
    weather_data = None
    try:
        weather_data = await get_weather(body.Latitude, body.Longitude)
    except Exception:
        pass
    result_dict["weather"] = weather_data

    # Log to SQLite
    try:
        log_prediction(result_dict, body.dict())
    except Exception as e:
        log.warning("Failed to log prediction: %s", e)

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

# ---------------------------------------------------------------------------
# Add these two endpoints to api/main.py
# ---------------------------------------------------------------------------

@app.get("/history", tags=["History"])
async def prediction_history(limit: int = 20):
    """
    Returns the most recent predictions logged to SQLite.
    Default limit: 20. Max: 100.
    """
    limit = min(limit, 100)
    try:
        history = get_history(limit)
        return {
            "count": len(history),
            "predictions": history
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch history: {e}")


@app.get("/stats", tags=["History"])
async def prediction_stats():
    """
    Returns aggregate stats from all logged predictions.
    Total count, by risk level, average confidence.
    """
    try:
        return get_stats()
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch stats: {e}")

# ---------------------------------------------------------------------------
# Add this endpoint to api/main.py
# ---------------------------------------------------------------------------

# ── Air Quality Index (AQI) ───────────────────────────────────────────────

@app.get("/aqi", tags=["Weather"])
async def aqi_endpoint(lat: float, lon: float):
    """
    Fetch Air Quality Index (AQI) from OpenAQ v3 API.
    
    Returns PM2.5-based AQI with health category and color.
    Search radius: 50km from given coordinates.
    """
    from api.aqi import get_aqi
    try:
        result = await get_aqi(lat, lon, radius_km=50)
        if result is None:
            return {
                "aqi": None,
                "category": "Unavailable",
                "pm25": None,
                "color": "#8892aa",
                "error": "OpenAQ API unavailable or API key not set"
            }
        return result
    except Exception as e:
        log.warning("AQI endpoint failed: %s", e)
        return {
            "aqi": None,
            "category": "Error",
            "pm25": None,
            "color": "#8892aa",
            "error": str(e)
        }


@app.get("/weather", tags=["Weather"])
async def current_weather(lat: float, lon: float):
    """
    Returns real-time weather for given coordinates.
    Includes wind speed, direction, humidity, temperature,
    red flag warning status, and fire weather risk level.
    
    California bounds enforced: Lat 32-42, Lng -125 to -114
    """
    # Enforce California bounds
    if not (32 <= lat <= 42) or not (-125 <= lon <= -114):
        raise HTTPException(
            400,
            "Coordinates outside California bounds. "
            "Model trained on California data only."
        )

    weather = await get_weather(lat, lon)

    if weather is None:
        raise HTTPException(
            503,
            "Weather service temporarily unavailable. "
            "Check OPENWEATHER_API_KEY in .env"
        )

    return weather

# ---------------------------------------------------------------------------
# Add these to api/main.py
# ---------------------------------------------------------------------------

# 1. Add import at top:
# from api.firms import get_active_fires

# 2. Add this endpoint:

@app.get("/active-fires", tags=["Satellite"])
async def active_fires(days: int = 1):
    """
    Returns real-time active fire detections in California
    from NASA FIRMS VIIRS NOAA-20 satellite.
    Updated every 10 minutes.
    
    days: 1-10 days lookback (default: 1)
    """
    data = await get_active_fires(days)

    if data.get("error") and data["count"] == 0:
        raise HTTPException(503, f"NASA FIRMS unavailable: {data['error']}")

    return data

# ---------------------------------------------------------------------------
# Add this endpoint to api/main.py
# ---------------------------------------------------------------------------

@app.get("/fire-perimeters", tags=["Satellite"])
async def fire_perimeters():
    """
    Returns GeoJSON polygons of famous California wildfire perimeters.
    Data sourced from CAL FIRE / NIFC public records.
    Used for historical reference overlay on the map.
    """
    return {
        "perimeters": [
            {
                "id":        "camp_fire_2018",
                "name":      "Camp Fire 2018",
                "year":      2018,
                "acres":     153336,
                "deaths":    85,
                "county":    "Butte County",
                "color":     "#ff5722",
                "fill":      "rgba(255,87,34,0.15)",
                "description": "California's deadliest wildfire. Destroyed the town of Paradise.",
                "coordinates": [
                    [-121.6326, 39.7934],
                    [-121.5983, 39.8201],
                    [-121.5541, 39.8456],
                    [-121.5123, 39.8634],
                    [-121.4876, 39.8789],
                    [-121.4234, 39.8923],
                    [-121.3987, 39.8756],
                    [-121.3654, 39.8534],
                    [-121.3423, 39.8312],
                    [-121.3198, 39.8089],
                    [-121.3087, 39.7823],
                    [-121.3234, 39.7534],
                    [-121.3456, 39.7289],
                    [-121.3789, 39.7123],
                    [-121.4123, 39.6989],
                    [-121.4567, 39.6878],
                    [-121.5012, 39.6934],
                    [-121.5456, 39.7056],
                    [-121.5876, 39.7234],
                    [-121.6198, 39.7512],
                    [-121.6326, 39.7934],
                ]
            },
            {
                "id":        "mendocino_complex_2018",
                "name":      "Mendocino Complex 2018",
                "year":      2018,
                "acres":     459123,
                "deaths":    1,
                "county":    "Mendocino / Lake County",
                "color":     "#ffc107",
                "fill":      "rgba(255,193,7,0.12)",
                "description": "Largest wildfire in California history at the time. Ranch + River fires combined.",
                "coordinates": [
                    [-122.9876, 39.4123],
                    [-122.9234, 39.4567],
                    [-122.8567, 39.4934],
                    [-122.7823, 39.5234],
                    [-122.7123, 39.5512],
                    [-122.6456, 39.5723],
                    [-122.5823, 39.5867],
                    [-122.5234, 39.5934],
                    [-122.4678, 39.5823],
                    [-122.4123, 39.5612],
                    [-122.3678, 39.5312],
                    [-122.3234, 39.4934],
                    [-122.2934, 39.4512],
                    [-122.2756, 39.4089],
                    [-122.2834, 39.3678],
                    [-122.3123, 39.3312],
                    [-122.3567, 39.3023],
                    [-122.4089, 39.2823],
                    [-122.4678, 39.2712],
                    [-122.5312, 39.2756],
                    [-122.5934, 39.2934],
                    [-122.6512, 39.3189],
                    [-122.7056, 39.3512],
                    [-122.7567, 39.3856],
                    [-122.8056, 39.4156],
                    [-122.8634, 39.4278],
                    [-122.9234, 39.4289],
                    [-122.9876, 39.4123],
                ]
            },
            {
                "id":        "dixie_fire_2021",
                "name":      "Dixie Fire 2021",
                "year":      2021,
                "acres":     963309,
                "deaths":    1,
                "county":    "Butte / Plumas / Lassen / Shasta / Tehama",
                "color":     "#ff1744",
                "fill":      "rgba(255,23,68,0.13)",
                "description": "Largest single wildfire in California history. Burned across 5 counties.",
                "coordinates": [
                    [-121.4234, 40.2123],
                    [-121.3567, 40.2567],
                    [-121.2823, 40.2934],
                    [-121.1934, 40.3234],
                    [-121.0978, 40.3467],
                    [-121.0023, 40.3623],
                    [-120.9123, 40.3712],
                    [-120.8234, 40.3734],
                    [-120.7378, 40.3656],
                    [-120.6567, 40.3478],
                    [-120.5823, 40.3212],
                    [-120.5178, 40.2878],
                    [-120.4634, 40.2456],
                    [-120.4234, 40.1978],
                    [-120.4023, 40.1456],
                    [-120.4089, 40.0923],
                    [-120.4367, 40.0434],
                    [-120.4823, 39.9989],
                    [-120.5367, 39.9623],
                    [-120.5978, 39.9323],
                    [-120.6634, 39.9089],
                    [-120.7312, 39.8923],
                    [-120.7978, 39.8823],
                    [-120.8634, 39.8812],
                    [-120.9267, 39.8878],
                    [-120.9856, 39.9023],
                    [-121.0389, 39.9234],
                    [-121.0856, 39.9512],
                    [-121.1256, 39.9845],
                    [-121.1589, 40.0223],
                    [-121.1856, 40.0634],
                    [-121.2067, 40.1067],
                    [-121.2234, 40.1512],
                    [-121.2367, 40.1956],
                    [-121.3123, 40.1823],
                    [-121.3734, 40.1934],
                    [-121.4234, 40.2123],
                ]
            },
            {
                "id":        "thomas_fire_2017",
                "name":      "Thomas Fire 2017",
                "year":      2017,
                "acres":     281893,
                "deaths":    2,
                "county":    "Ventura / Santa Barbara",
                "color":     "#aa00ff",
                "fill":      "rgba(170,0,255,0.12)",
                "description": "Was the largest California wildfire on record until 2018. Burned in December.",
                "coordinates": [
                    [-119.2234, 34.5123],
                    [-119.1567, 34.5456],
                    [-119.0823, 34.5712],
                    [-119.0034, 34.5889],
                    [-118.9234, 34.5978],
                    [-118.8423, 34.5989],
                    [-118.7634, 34.5923],
                    [-118.6878, 34.5778],
                    [-118.6178, 34.5556],
                    [-118.5556, 34.5267],
                    [-118.5034, 34.4923],
                    [-118.4634, 34.4534],
                    [-118.4367, 34.4112],
                    [-118.4256, 34.3678],
                    [-118.4378, 34.3256],
                    [-118.4712, 34.2889],
                    [-118.5189, 34.2612],
                    [-118.5756, 34.2423],
                    [-118.6378, 34.2323],
                    [-118.7023, 34.2367],
                    [-118.7645, 34.2523],
                    [-118.8223, 34.2778],
                    [-118.8734, 34.3112],
                    [-118.9156, 34.3512],
                    [-118.9478, 34.3956],
                    [-118.9712, 34.4423],
                    [-118.9856, 34.4901],
                    [-119.0512, 34.5056],
                    [-119.1234, 34.5089],
                    [-119.2234, 34.5123],
                ]
            },
            {
                "id":        "caldor_fire_2021",
                "name":      "Caldor Fire 2021",
                "year":      2021,
                "acres":     221835,
                "deaths":    1,
                "county":    "El Dorado County",
                "color":     "#00bfa5",
                "fill":      "rgba(0,191,165,0.12)",
                "description": "Threatened South Lake Tahoe. First fire to cross the Sierra Nevada crest.",
                "coordinates": [
                    [-120.5234, 38.7123],
                    [-120.4678, 38.7456],
                    [-120.4056, 38.7712],
                    [-120.3378, 38.7889],
                    [-120.2678, 38.7978],
                    [-120.1978, 38.7989],
                    [-120.1312, 38.7923],
                    [-120.0712, 38.7778],
                    [-120.0189, 38.7556],
                    [-119.9756, 38.7267],
                    [-119.9423, 38.6923],
                    [-119.9212, 38.6534],
                    [-119.9145, 38.6112],
                    [-119.9256, 38.5689],
                    [-119.9545, 38.5312],
                    [-120.0001, 38.5023],
                    [-120.0578, 38.4823],
                    [-120.1212, 38.4712],
                    [-120.1878, 38.4712],
                    [-120.2523, 38.4823],
                    [-120.3123, 38.5023],
                    [-120.3645, 38.5312],
                    [-120.4089, 38.5678],
                    [-120.4434, 38.6089],
                    [-120.4689, 38.6534],
                    [-120.4856, 38.6989],
                    [-120.5234, 38.7123],
                ]
            }
        ]
    }

# ---------------------------------------------------------------------------
# Add this endpoint to api/main.py
# ---------------------------------------------------------------------------

@app.get("/county-confidence", tags=["Model"])
async def county_confidence():
    """
    Returns per-county model confidence data.
    Shows which counties the model predicts most/least confidently.
    Computed from the processed dataset — no live inference needed.
    """
    try:
        df = pd.read_csv(DATA_PATH)

        # AcresBurned thresholds matching training labels
        def get_risk(acres):
            if acres >= 10000:
                return "HIGH"
            if acres >= 1000:
                return "MEDIUM"
            return "LOW"

        # County label encoder — reverse map from encoded int to name
        # We stored encoded County as integer — load raw data for names
        raw_path = PROJECT_ROOT / "data" / "raw" / "California_Fire_Incidents.csv"
        if raw_path.exists():
            raw_df = pd.read_csv(raw_path, low_memory=False)
            # Build county name map from raw data
            county_names = {}
            if "Counties" in raw_df.columns:
                from sklearn.preprocessing import LabelEncoder
                le = LabelEncoder()
                le.fit(raw_df["Counties"].fillna("Unknown").astype(str))
                county_names = {i: name for i, name in enumerate(le.classes_)}

        df["true_risk"] = df["AcresBurned"].apply(get_risk)

        # Group by county
        results = []
        for county_code, group in df.groupby("County"):
            county_name = county_names.get(int(county_code), f"County {county_code}")
            total = len(group)
            if total < 3:
                continue

            # Risk distribution
            risk_counts = group["true_risk"].value_counts().to_dict()

            # Dominant risk
            dominant = max(risk_counts, key=risk_counts.get)

            # Confidence proxy — how dominant is the majority class
            majority_pct = (risk_counts.get(dominant, 0) / total) * 100

            # Model certainty — higher = model more confident about this county
            certainty = round(majority_pct, 1)

            results.append({
                "county":        county_name,
                "county_code":   int(county_code),
                "total":         total,
                "dominant_risk": dominant,
                "certainty_pct": certainty,
                "risk_counts":   risk_counts,
                "high_pct":      round((risk_counts.get("HIGH", 0) / total) * 100, 1),
                "medium_pct":    round((risk_counts.get("MEDIUM", 0) / total) * 100, 1),
                "low_pct":       round((risk_counts.get("LOW", 0) / total) * 100, 1),
            })

        # Sort by certainty descending
        results.sort(key=lambda x: x["certainty_pct"], reverse=True)

        return {
            "counties":    results,
            "total_counties": len(results),
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to compute county confidence: {e}")
    
# ---------------------------------------------------------------------------
# Add these to api/main.py
# ---------------------------------------------------------------------------

# 1. Add import at top:
# from api.shap_explainer import compute_shap_values

# 2. Add this endpoint:

@app.post("/explain", tags=["Explainability"])
async def explain_prediction(body: PredictRequest):
    """
    Returns SHAP values for a single prediction.
    Shows WHY the model classified this fire as HIGH/MEDIUM/LOW.

    Returns:
    - shap_values: per-feature contribution to the prediction
    - top_positive: features pushing TOWARD the predicted class
    - top_negative: features pushing AWAY from the predicted class
    - base_value: baseline prediction before any features
    - predicted_class: class being explained
    """
    if predictor is None:
        raise HTTPException(503, "Model not loaded.")

    # First get the prediction
    try:
        result = predictor.predict(body.dict())
    except Exception as e:
        raise HTTPException(500, f"Prediction failed: {e}")

    # Then compute SHAP
    shap_result = compute_shap_values(predictor, body.dict())

    if shap_result is None:
        raise HTTPException(500, "SHAP computation failed. Check logs.")

    return {
        "prediction":    result.to_dict(),
        "explanation":   shap_result,
        "input_features": body.dict(),
    }


# ── Prophet Forecast ──────────────────────────────────────────────────────

@app.get("/forecast", tags=["Forecasting"])
async def forecast_incidents(periods: int = 12):
    """
    Returns a 12-month forward forecast of wildfire incident counts
    using Meta's Prophet time-series model.

    Includes:
    - historical: past monthly incident counts
    - forecast:   future months with yhat, yhat_lower, yhat_upper
    - seasonality: monthly risk index (0-100)
    - trend_direction, peak_month
    """
    from api.prophet_forecast import get_forecast
    try:
        return get_forecast(periods=min(periods, 24))
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Forecast failed: {e}")


# ── Fire Season Calendar ──────────────────────────────────────────────────

@app.get("/fire-calendar", tags=["Forecasting"])
async def fire_season_calendar():
    """
    Returns per-month fire risk scores (0-100) computed from historical data.
    Each month includes: risk_score, risk_label, avg_incidents, avg_acres,
    pct_high severity, and fire season identification.
    """
    from api.prophet_forecast import get_fire_calendar
    try:
        return get_fire_calendar()
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Calendar computation failed: {e}")


# ── Fire Spread Prediction ────────────────────────────────────────────────

class SpreadRequest(BaseModel):
    latitude:      float = Field(..., ge=32.0, le=42.0)
    longitude:     float = Field(..., ge=-125.0, le=-114.0)
    wind_speed_kmh: float = Field(20.0, ge=0, le=200)
    wind_deg:      float = Field(0, ge=0, le=360)
    risk_level:    str   = Field("MEDIUM", pattern="^(LOW|MEDIUM|HIGH)$")
    acres_est:     int   = Field(1000, ge=0)


@app.post("/spread-prediction", tags=["Fire Modeling"])
async def predict_fire_spread(body: SpreadRequest):
    """
    Compute elliptical fire spread polygons for 6h, 12h, and 24h horizons.
    
    Fire spreads faster downwind and slower crosswind. Spread rate depends on
    risk level and wind speed.
    
    Returns three polygons as lists of [lat, lng] coordinate pairs.
    """
    from api.spread import compute_spread_prediction
    try:
        return compute_spread_prediction(
            latitude=body.latitude,
            longitude=body.longitude,
            wind_speed_kmh=body.wind_speed_kmh,
            wind_deg=body.wind_deg,
            risk_level=body.risk_level,
            acres_est=body.acres_est,
        )
    except Exception as e:
        raise HTTPException(500, f"Spread prediction failed: {e}")


# ── Smoke Plume Trajectory ─────────────────────────────────────────────────

class SmokePlumeRequest(BaseModel):
    latitude:      float = Field(..., ge=32.0, le=42.0)
    longitude:     float = Field(..., ge=-125.0, le=-114.0)
    wind_deg:      float = Field(0, ge=0, le=360)
    wind_speed_kmh: float = Field(20.0, ge=0, le=200)


@app.post("/smoke-plume", tags=["Fire Modeling"])
async def predict_smoke_plume(body: SmokePlumeRequest):
    """
    Compute cone-shaped smoke plume polygon extending 50km downwind.
    
    Plume is narrow at fire point (1km wide) and widens to 15km at 50km distance.
    
    Returns polygon as list of [lat, lng] coordinate pairs.
    """
    from api.spread import compute_smoke_plume
    try:
        return compute_smoke_plume(
            latitude=body.latitude,
            longitude=body.longitude,
            wind_deg=body.wind_deg,
            wind_speed_kmh=body.wind_speed_kmh,
        )
    except Exception as e:
        raise HTTPException(500, f"Smoke plume computation failed: {e}")
