"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/firms.py
Purpose : Real-time active fire detection from NASA FIRMS satellite data.
          Uses VIIRS NOAA-20 sensor — updated every 10 minutes.
          California bounding box only — model trained on CA data.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# NASA FIRMS API config
# ---------------------------------------------------------------------------
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

# California bounding box — strict bounds matching model training geography
CA_WEST  = -125.0
CA_SOUTH =   32.0
CA_EAST  = -114.0
CA_NORTH =   42.0
# California bounding box — west,south,east,north
CA_BBOX = "-125,32,-114,42"

# VIIRS NOAA-20 — highest resolution, 375m pixel size, updated every 10 mins
SENSOR = "VIIRS_NOAA20_NRT"

# Confidence mapping
CONFIDENCE_MAP = {
    "l": "Low",
    "n": "Nominal",
    "h": "High",
}


# ---------------------------------------------------------------------------
# Risk level from fire radiative power (FRP)
# ---------------------------------------------------------------------------
def frp_to_risk(frp: float) -> str:
    """
    Fire Radiative Power (MW) → risk level.
    Based on USFS fire intensity classification.
    """
    if frp >= 500:
        return "HIGH"
    if frp >= 100:
        return "MEDIUM"
    return "LOW"


def frp_to_color(frp: float) -> str:
    risk = frp_to_risk(frp)
    return {
        "HIGH":   "#ff5722",
        "MEDIUM": "#ffc107",
        "LOW":    "#00bf55",
    }[risk]


# ---------------------------------------------------------------------------
# Parse CSV response from FIRMS
# ---------------------------------------------------------------------------
def parse_firms_csv(csv_text: str) -> list[dict[str, Any]]:
    """Parse the CSV response from NASA FIRMS API."""
    lines = csv_text.strip().split("\n")
    if len(lines) < 2:
        return []

    headers = [h.strip() for h in lines[0].split(",")]
    fires   = []

    for line in lines[1:]:
        if not line.strip():
            continue
        values = line.split(",")
        if len(values) < len(headers):
            continue

        row = dict(zip(headers, values))

        try:
            lat  = float(row.get("latitude",  0))
            lon  = float(row.get("longitude", 0))
            frp  = float(row.get("frp",       0))
            conf = row.get("confidence", "n").strip().lower()

            # Double-check California bounds
            if not (CA_SOUTH <= lat <= CA_NORTH and CA_WEST <= lon <= CA_EAST):
                continue

            fires.append({
                "latitude":      lat,
                "longitude":     lon,
                "frp":           frp,
                "brightness":    float(row.get("bright_ti4", 0) or 0),
                "scan":          float(row.get("scan",        0) or 0),
                "track":         float(row.get("track",       0) or 0),
                "acq_date":      row.get("acq_date",  "").strip(),
                "acq_time":      row.get("acq_time",  "").strip(),
                "satellite":     row.get("satellite", "").strip(),
                "confidence":    CONFIDENCE_MAP.get(conf, conf.title()),
                "version":       row.get("version",   "").strip(),
                "risk_level":    frp_to_risk(frp),
                "color":         frp_to_color(frp),
                "daynight":      row.get("daynight",  "").strip(),
            })
        except (ValueError, TypeError):
            continue

    return fires


# ---------------------------------------------------------------------------
# Main fetch function
# ---------------------------------------------------------------------------
async def get_active_fires(days: int = 1) -> dict[str, Any]:
    """
    Fetch active fires in California from NASA FIRMS.
    
    Args:
        days: Number of days to look back (1-10)
    
    Returns:
        Dict with fires list, count, and metadata
    """
    map_key = os.getenv("NASA_FIRMS_MAP_KEY")
    if not map_key:
        log.warning("NASA_FIRMS_MAP_KEY not set — satellite data unavailable")
        return {"fires": [], "count": 0, "error": "NASA_FIRMS_MAP_KEY not configured"}

    days = max(1, min(days, 10))  # clamp to 1-10

    from urllib.parse import quote
    bbox_encoded = quote(CA_BBOX, safe='')
    url = f"{FIRMS_BASE}/{map_key}/{SENSOR}/-125,32,-114,42/{days}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            csv_text = resp.text

        if "Error" in csv_text or "Invalid" in csv_text:
            log.warning("NASA FIRMS API error: %s", csv_text[:200])
            return {"fires": [], "count": 0, "error": csv_text[:200]}

        fires = parse_firms_csv(csv_text)

        # Sort by FRP descending — most intense fires first
        fires.sort(key=lambda f: f["frp"], reverse=True)

        # Stats
        high_count   = sum(1 for f in fires if f["risk_level"] == "HIGH")
        medium_count = sum(1 for f in fires if f["risk_level"] == "MEDIUM")
        low_count    = sum(1 for f in fires if f["risk_level"] == "LOW")

        log.info(
            "NASA FIRMS: %d active fires in California "
            "(HIGH=%d, MEDIUM=%d, LOW=%d)",
            len(fires), high_count, medium_count, low_count
        )

        return {
            "fires":        fires,
            "count":        len(fires),
            "high_count":   high_count,
            "medium_count": medium_count,
            "low_count":    low_count,
            "sensor":       SENSOR,
            "days":         days,
            "region":       "California",
            "bbox":         CA_BBOX,
            "error":        None,
        }

    except httpx.TimeoutException:
        log.warning("NASA FIRMS request timed out")
        return {"fires": [], "count": 0, "error": "Request timed out"}
    except httpx.HTTPStatusError as e:
        log.warning("NASA FIRMS HTTP error: %s", e.response.status_code)
        return {"fires": [], "count": 0, "error": f"HTTP {e.response.status_code}"}
    except Exception as e:
        log.warning("NASA FIRMS fetch failed: %s", e)
        return {"fires": [], "count": 0, "error": str(e)}
