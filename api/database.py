"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/database.py
Purpose : SQLite prediction logging and history retrieval.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Database path — stored at project root/data/geoai.db
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH      = PROJECT_ROOT / "data" / "geoai.db"


# ---------------------------------------------------------------------------
# Initialise DB — create tables if they don't exist
# ---------------------------------------------------------------------------
def init_db() -> None:
    """Create the predictions and subscriptions tables if they don't exist."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS predictions (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp       TEXT    NOT NULL,
                latitude        REAL,
                longitude       REAL,
                county          TEXT,
                percent_contained REAL,
                personnel       REAL,
                engines         REAL,
                helicopters     REAL,
                major_incident  INTEGER,
                risk_level      TEXT    NOT NULL,
                confidence      REAL    NOT NULL,
                acres_est       REAL,
                model_name      TEXT,
                probabilities   TEXT,
                input_features  TEXT
            )
        """)
        
        conn.execute("""
            CREATE TABLE IF NOT EXISTS subscriptions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                email       TEXT    NOT NULL,
                latitude    REAL    NOT NULL,
                longitude   REAL    NOT NULL,
                zip_code    TEXT,
                created_at  TEXT    NOT NULL
            )
        """)
        
        conn.commit()
    log.info("Database initialised at %s", DB_PATH)


# ---------------------------------------------------------------------------
# Log a prediction
# ---------------------------------------------------------------------------
def log_prediction(result: dict[str, Any], inputs: dict[str, Any]) -> int:
    """
    Insert a prediction record into the database.
    Returns the new row ID.
    """
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute("""
            INSERT INTO predictions (
                timestamp, latitude, longitude, county,
                percent_contained, personnel, engines, helicopters,
                major_incident, risk_level, confidence, acres_est,
                model_name, probabilities, input_features
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.utcnow().isoformat(),
            inputs.get("Latitude"),
            inputs.get("Longitude"),
            inputs.get("County"),
            inputs.get("PercentContained"),
            inputs.get("PersonnelInvolved"),
            inputs.get("Engines"),
            inputs.get("Helicopters"),
            int(inputs.get("MajorIncident", 0)),
            result.get("risk_level"),
            result.get("confidence"),
            result.get("acres_est"),
            result.get("model_name"),
            json.dumps(result.get("probabilities", {})),
            json.dumps(inputs),
        ))
        conn.commit()
        return cursor.lastrowid


# ---------------------------------------------------------------------------
# Fetch prediction history
# ---------------------------------------------------------------------------
def get_history(limit: int = 20) -> list[dict[str, Any]]:
    """Return the most recent predictions, newest first."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT * FROM predictions
            ORDER BY id DESC
            LIMIT ?
        """, (limit,)).fetchall()

    history = []
    for row in rows:
        record = dict(row)
        # Parse JSON fields back to dicts
        try:
            record["probabilities"]  = json.loads(record["probabilities"] or "{}")
            record["input_features"] = json.loads(record["input_features"] or "{}")
        except (json.JSONDecodeError, TypeError):
            pass
        history.append(record)
    return history


# ---------------------------------------------------------------------------
# Stats for dashboard
# ---------------------------------------------------------------------------
def get_stats() -> dict[str, Any]:
    """Return aggregate stats from prediction history."""
    with sqlite3.connect(DB_PATH) as conn:
        total = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
        by_risk = conn.execute("""
            SELECT risk_level, COUNT(*) as count
            FROM predictions
            GROUP BY risk_level
        """).fetchall()
        avg_conf = conn.execute(
            "SELECT AVG(confidence) FROM predictions"
        ).fetchone()[0]

    risk_counts = {row[0]: row[1] for row in by_risk}
    return {
        "total_predictions": total,
        "by_risk_level": risk_counts,
        "average_confidence": round(avg_conf or 0, 4),
        "high_count":   risk_counts.get("HIGH", 0),
        "medium_count": risk_counts.get("MEDIUM", 0),
        "low_count":    risk_counts.get("LOW", 0),
    }


# ---------------------------------------------------------------------------
# Alert subscriptions
# ---------------------------------------------------------------------------
def add_subscription(email: str, lat: float, lon: float, zip_code: str = None) -> int:
    """
    Add a new alert subscription.
    Returns the new subscription ID.
    """
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute("""
            INSERT INTO subscriptions (email, latitude, longitude, zip_code, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (
            email,
            lat,
            lon,
            zip_code,
            datetime.utcnow().isoformat(),
        ))
        conn.commit()
        return cursor.lastrowid


def get_nearby_subscriptions(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    """
    Get all subscriptions within the specified radius using Haversine formula.
    Returns a list of subscription records.
    """
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        # Haversine formula in SQL
        # Earth radius = 6371 km
        rows = conn.execute("""
            SELECT 
                id, email, latitude, longitude, zip_code, created_at,
                (6371 * acos(
                    cos(radians(?)) * cos(radians(latitude)) *
                    cos(radians(longitude) - radians(?)) +
                    sin(radians(?)) * sin(radians(latitude))
                )) AS distance_km
            FROM subscriptions
            WHERE distance_km <= ?
        """, (lat, lon, lat, radius_km)).fetchall()
    
    return [dict(row) for row in rows]
