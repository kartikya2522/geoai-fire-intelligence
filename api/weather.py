"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/weather.py
Purpose : Real-time weather data from OpenWeatherMap API.
          Uses free tier 2.5 endpoint — no paid subscription needed.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

log = logging.getLogger(__name__)

OWM_BASE = "https://api.openweathermap.org/data/2.5/weather"


# ---------------------------------------------------------------------------
# Wind direction degrees → human readable
# ---------------------------------------------------------------------------
def degrees_to_direction(deg: float) -> str:
    directions = [
        "N", "NNE", "NE", "ENE",
        "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW",
        "W", "WNW", "NW", "NNW",
    ]
    index = round(deg / 22.5) % 16
    return directions[index]


# ---------------------------------------------------------------------------
# Red flag warning check
# ---------------------------------------------------------------------------
def is_red_flag(wind_speed_kmh: float, humidity: float, temp_c: float) -> bool:
    """
    NWCG Red Flag Warning criteria:
    - Wind speed >= 25 km/h
    - Relative humidity <= 25%
    - Temperature >= 32°C
    Any two of three triggers a red flag warning.
    """
    conditions_met = sum([
        wind_speed_kmh >= 25,
        humidity <= 25,
        temp_c >= 32,
    ])
    return conditions_met >= 2


# ---------------------------------------------------------------------------
# Fire weather risk level
# ---------------------------------------------------------------------------
def fire_weather_risk(wind_speed_kmh: float, humidity: float, temp_c: float) -> str:
    """Returns EXTREME / HIGH / MODERATE / LOW based on weather conditions."""
    if wind_speed_kmh >= 50 and humidity <= 15 and temp_c >= 38:
        return "EXTREME"
    if wind_speed_kmh >= 35 and humidity <= 20:
        return "HIGH"
    if wind_speed_kmh >= 25 and humidity <= 30:
        return "MODERATE"
    return "LOW"


# ---------------------------------------------------------------------------
# Main weather fetch function
# ---------------------------------------------------------------------------
async def get_weather(lat: float, lon: float) -> dict[str, Any] | None:
    """
    Fetch current weather for given coordinates.
    Returns structured weather dict or None if API call fails.
    """
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        log.warning("OPENWEATHER_API_KEY not set — weather unavailable")
        return None

    params = {
        "lat":   lat,
        "lon":   lon,
        "appid": api_key,
        "units": "metric",  # Celsius, km/h
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(OWM_BASE, params=params)
            resp.raise_for_status()
            data = resp.json()

        wind_speed_ms  = data.get("wind", {}).get("speed", 0)
        wind_speed_kmh = round(wind_speed_ms * 3.6, 1)
        wind_deg       = data.get("wind", {}).get("deg", 0)
        humidity       = data.get("main", {}).get("humidity", 0)
        temp_c         = data.get("main", {}).get("temp", 0)
        feels_like     = data.get("main", {}).get("feels_like", 0)
        description    = data.get("weather", [{}])[0].get("description", "").title()
        location_name  = data.get("name", "Unknown")

        red_flag       = is_red_flag(wind_speed_kmh, humidity, temp_c)
        weather_risk   = fire_weather_risk(wind_speed_kmh, humidity, temp_c)

        return {
            "location":        location_name,
            "temperature_c":   round(temp_c, 1),
            "feels_like_c":    round(feels_like, 1),
            "humidity_pct":    humidity,
            "wind_speed_kmh":  wind_speed_kmh,
            "wind_direction":  degrees_to_direction(wind_deg),
            "wind_deg":        wind_deg,
            "description":     description,
            "red_flag_warning": red_flag,
            "fire_weather_risk": weather_risk,
            "raw": {
                "wind_speed_ms": wind_speed_ms,
                "wind_deg":      wind_deg,
                "pressure_hpa":  data.get("main", {}).get("pressure", 0),
                "visibility_m":  data.get("visibility", 0),
            }
        }

    except httpx.TimeoutException:
        log.warning("OpenWeatherMap request timed out for lat=%s lon=%s", lat, lon)
        return None
    except httpx.HTTPStatusError as e:
        log.warning("OpenWeatherMap HTTP error: %s", e.response.status_code)
        return None
    except Exception as e:
        log.warning("Weather fetch failed: %s", e)
        return None
