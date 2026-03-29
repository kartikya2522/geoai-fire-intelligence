"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/aqi.py
Purpose : Air Quality Index (AQI) data from OpenAQ API.
          Fetches PM2.5 levels and converts to EPA AQI scale with
          health category classifications.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

log = logging.getLogger(__name__)

OPENAQ_V3_BASE = "https://api.openaq.org/v3/locations"


# ---------------------------------------------------------------------------
# EPA AQI breakpoints for PM2.5
# ---------------------------------------------------------------------------
def pm25_to_aqi(pm25: float) -> tuple[int, str]:
    """
    Convert PM2.5 concentration (μg/m³) to EPA AQI index and health category.
    
    EPA AQI Breakpoints for PM2.5 (24-hour):
    - 0.0 - 12.0  μg/m³ → AQI 0-50    (Good)
    - 12.1 - 35.4 μg/m³ → AQI 51-100  (Moderate)
    - 35.5 - 55.4 μg/m³ → AQI 101-150 (Unhealthy for Sensitive Groups)
    - 55.5 - 150.4 μg/m³ → AQI 151-200 (Unhealthy)
    - 150.5 - 250.4 μg/m³ → AQI 201-300 (Very Unhealthy)
    - 250.5+ μg/m³ → AQI 301-500 (Hazardous)
    
    Returns
    -------
    tuple[int, str]
        (AQI value, health category string)
    """
    breakpoints = [
        (0.0,   12.0,   0,   50,   "Good"),
        (12.1,  35.4,   51,  100,  "Moderate"),
        (35.5,  55.4,   101, 150,  "Unhealthy for Sensitive Groups"),
        (55.5,  150.4,  151, 200,  "Unhealthy"),
        (150.5, 250.4,  201, 300,  "Very Unhealthy"),
        (250.5, 500.0,  301, 500,  "Hazardous"),
    ]
    
    for c_low, c_high, i_low, i_high, category in breakpoints:
        if c_low <= pm25 <= c_high:
            # Linear interpolation within the range
            aqi = round(((i_high - i_low) / (c_high - c_low)) * (pm25 - c_low) + i_low)
            return aqi, category
    
    # If above all breakpoints, return max hazardous
    if pm25 > 250.5:
        return 500, "Hazardous"
    
    # If below all breakpoints (shouldn't happen with 0.0 start)
    return 0, "Good"


def aqi_to_color(aqi: int) -> str:
    """Return hex color code for AQI level."""
    if aqi <= 50:
        return "#00bf55"  # Green (Good)
    elif aqi <= 100:
        return "#ffc107"  # Yellow (Moderate)
    elif aqi <= 150:
        return "#ff9800"  # Orange (Unhealthy for Sensitive)
    elif aqi <= 200:
        return "#ff5722"  # Red (Unhealthy)
    elif aqi <= 300:
        return "#9c27b0"  # Purple (Very Unhealthy)
    else:
        return "#8b0000"  # Maroon (Hazardous)


# ---------------------------------------------------------------------------
# OpenAQ v3 API query
# ---------------------------------------------------------------------------
async def get_aqi(lat: float, lon: float, radius_km: int = 50) -> dict[str, Any] | None:
    """
    Fetch air quality data from OpenAQ v3 API for nearest monitoring station.
    
    Parameters
    ----------
    lat : float
        Latitude in decimal degrees
    lon : float
        Longitude in decimal degrees
    radius_km : int
        Search radius in kilometers (default 50km)
    
    Returns
    -------
    dict | None
        AQI data dict with:
        - aqi: int (0-500)
        - category: str (Good/Moderate/Unhealthy/etc.)
        - pm25: float (μg/m³)
        - color: str (hex color code)
        - station: str (monitoring station name)
        - distance_km: float
        - measured_at: str (ISO timestamp)
        Returns None if API call fails or no data available.
    """
    api_key = os.getenv("OPENAQ_API_KEY")
    
    if not api_key:
        log.warning("OPENAQ_API_KEY not set — AQI data unavailable")
        return None
    
    # OpenAQ v3 requires coordinates parameter in format: lat,lon
    params = {
        "coordinates": f"{lat},{lon}",
        "radius":      radius_km * 1000,  # API expects meters
        "limit":       10,
        "order_by":    "distance",
        "parameters_id": 2,  # PM2.5 parameter ID
    }
    
    headers = {
        "X-API-Key": api_key,
        "Accept":    "application/json",
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(OPENAQ_V3_BASE, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        
        results = data.get("results", [])
        
        if not results:
            log.info("No AQI monitoring stations found within %d km of %s,%s",
                     radius_km, lat, lon)
            return {
                "aqi":         None,
                "category":    "No Data",
                "pm25":        None,
                "color":       "#8892aa",
                "station":     None,
                "distance_km": None,
                "measured_at": None,
                "error":       "No monitoring stations nearby",
            }
        
        # Take the first (nearest) location
        location = results[0]
        station_name = location.get("name", "Unknown Station")
        distance_m   = location.get("distance", 0)
        distance_km  = round(distance_m / 1000, 1)
        
        # Get latest PM2.5 measurement
        latest = location.get("latest", {})
        pm25_measurement = None
        
        for param in latest.values():
            if isinstance(param, dict) and param.get("parameter", {}).get("name") == "pm25":
                pm25_measurement = param
                break
        
        if not pm25_measurement:
            log.info("No PM2.5 data available at station %s", station_name)
            return {
                "aqi":         None,
                "category":    "No Data",
                "pm25":        None,
                "color":       "#8892aa",
                "station":     station_name,
                "distance_km": distance_km,
                "measured_at": None,
                "error":       "No PM2.5 data available",
            }
        
        pm25_value  = pm25_measurement.get("value")
        measured_at = pm25_measurement.get("datetime", {}).get("utc")
        
        if pm25_value is None:
            return {
                "aqi":         None,
                "category":    "No Data",
                "pm25":        None,
                "color":       "#8892aa",
                "station":     station_name,
                "distance_km": distance_km,
                "measured_at": measured_at,
                "error":       "Invalid PM2.5 value",
            }
        
        # Convert PM2.5 to AQI
        aqi_value, aqi_category = pm25_to_aqi(float(pm25_value))
        color = aqi_to_color(aqi_value)
        
        return {
            "aqi":         aqi_value,
            "category":    aqi_category,
            "pm25":        round(float(pm25_value), 1),
            "color":       color,
            "station":     station_name,
            "distance_km": distance_km,
            "measured_at": measured_at,
        }
    
    except httpx.TimeoutException:
        log.warning("OpenAQ request timed out for lat=%s lon=%s", lat, lon)
        return None
    except httpx.HTTPStatusError as e:
        log.warning("OpenAQ HTTP error: %s — %s", e.response.status_code, e.response.text)
        return None
    except Exception as e:
        log.warning("AQI fetch failed: %s", e)
        return None
