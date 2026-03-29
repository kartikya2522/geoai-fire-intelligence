"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/spread.py
Purpose : Fire spread prediction and smoke plume trajectory modeling.
          Computes elliptical fire spread polygons based on wind conditions
          and cone-shaped smoke plume trajectories.
"""

from __future__ import annotations

import math
from typing import Any


# ---------------------------------------------------------------------------
# Elliptical fire spread prediction
# ---------------------------------------------------------------------------
def compute_fire_spread(
    latitude: float,
    longitude: float,
    wind_speed_kmh: float,
    wind_deg: float,
    risk_level: str,
    acres_est: int,
    hours: int = 6,
) -> list[list[float]]:
    """
    Compute an elliptical fire spread polygon for a given time horizon.
    
    Fire spreads faster downwind (in the direction of wind_deg) and slower
    crosswind. The ellipse is oriented along the wind direction.
    
    Parameters
    ----------
    latitude : float
        Fire origin latitude (decimal degrees)
    longitude : float
        Fire origin longitude (decimal degrees)
    wind_speed_kmh : float
        Wind speed in km/h
    wind_deg : float
        Wind direction in degrees (0 = North, 90 = East, etc.)
    risk_level : str
        Fire risk level: LOW, MEDIUM, or HIGH
    acres_est : int
        Estimated acres burned (currently not used, reserved for future)
    hours : int
        Time horizon in hours (6, 12, or 24)
    
    Returns
    -------
    list[list[float]]
        List of [lat, lng] coordinate pairs forming the ellipse boundary
    """
    # Base spread rate in km/hour
    base_rates = {
        "LOW":    0.5,
        "MEDIUM": 1.5,
        "HIGH":   3.0,
    }
    base_rate = base_rates.get(risk_level, 1.5)
    
    # Wind multiplier: scale by wind_speed_kmh / 20
    # At 20 km/h wind, multiplier = 1.0
    # At 40 km/h wind, multiplier = 2.0
    wind_multiplier = max(0.3, wind_speed_kmh / 20.0)
    
    # Effective spread rate
    spread_rate = base_rate * wind_multiplier
    
    # Total spread distance in km
    spread_km = spread_rate * hours
    
    # Ellipse semi-major axis (downwind direction)
    # Fire spreads faster downwind
    a = spread_km * 1.5  # km downwind
    
    # Ellipse semi-minor axis (crosswind direction)
    # Fire spreads slower crosswind
    b = spread_km * 0.6  # km crosswind
    
    # Convert wind direction from meteorological (degrees from north)
    # to mathematical (radians counterclockwise from east)
    wind_rad = math.radians(90 - wind_deg)
    
    # Generate 16 points around the ellipse
    num_points = 16
    polygon = []
    
    for i in range(num_points):
        angle = 2 * math.pi * i / num_points
        
        # Parametric ellipse equations
        x_ellipse = a * math.cos(angle)  # downwind axis
        y_ellipse = b * math.sin(angle)  # crosswind axis
        
        # Rotate by wind direction
        x_rotated = x_ellipse * math.cos(wind_rad) - y_ellipse * math.sin(wind_rad)
        y_rotated = x_ellipse * math.sin(wind_rad) + y_ellipse * math.cos(wind_rad)
        
        # Convert km offsets to lat/lng
        # Approximate: 1 degree latitude ≈ 111 km
        # 1 degree longitude ≈ 111 km * cos(latitude)
        lat_offset = y_rotated / 111.0
        lng_offset = x_rotated / (111.0 * math.cos(math.radians(latitude)))
        
        new_lat = latitude + lat_offset
        new_lng = longitude + lng_offset
        
        polygon.append([new_lat, new_lng])
    
    # Close the polygon by repeating first point
    if polygon:
        polygon.append(polygon[0])
    
    return polygon


def compute_spread_prediction(
    latitude: float,
    longitude: float,
    wind_speed_kmh: float,
    wind_deg: float,
    risk_level: str,
    acres_est: int,
) -> dict[str, Any]:
    """
    Compute fire spread polygons for 6h, 12h, and 24h time horizons.
    
    Returns
    -------
    dict with keys:
        - spread_6h: list of [lat, lng] coordinates
        - spread_12h: list of [lat, lng] coordinates
        - spread_24h: list of [lat, lng] coordinates
        - metadata: dict with spread rates and wind info
    """
    spread_6h  = compute_fire_spread(latitude, longitude, wind_speed_kmh,
                                     wind_deg, risk_level, acres_est, hours=6)
    spread_12h = compute_fire_spread(latitude, longitude, wind_speed_kmh,
                                     wind_deg, risk_level, acres_est, hours=12)
    spread_24h = compute_fire_spread(latitude, longitude, wind_speed_kmh,
                                     wind_deg, risk_level, acres_est, hours=24)
    
    base_rates = {"LOW": 0.5, "MEDIUM": 1.5, "HIGH": 3.0}
    base_rate = base_rates.get(risk_level, 1.5)
    wind_multiplier = max(0.3, wind_speed_kmh / 20.0)
    effective_rate = base_rate * wind_multiplier
    
    return {
        "spread_6h":  spread_6h,
        "spread_12h": spread_12h,
        "spread_24h": spread_24h,
        "metadata": {
            "base_rate_kmh":     base_rate,
            "wind_multiplier":   round(wind_multiplier, 2),
            "effective_rate_kmh": round(effective_rate, 2),
            "wind_speed_kmh":    wind_speed_kmh,
            "wind_direction_deg": wind_deg,
            "risk_level":        risk_level,
        }
    }


# ---------------------------------------------------------------------------
# Smoke plume trajectory
# ---------------------------------------------------------------------------
def compute_smoke_plume(
    latitude: float,
    longitude: float,
    wind_deg: float,
    wind_speed_kmh: float = 20.0,
) -> dict[str, Any]:
    """
    Compute a cone-shaped smoke plume polygon extending downwind.
    
    The plume is narrow at the fire point (1km wide) and widens to 15km
    at 50km distance downwind.
    
    Parameters
    ----------
    latitude : float
        Fire origin latitude
    longitude : float
        Fire origin longitude
    wind_deg : float
        Wind direction in degrees (0 = North, 90 = East)
    wind_speed_kmh : float
        Wind speed in km/h (affects plume length)
    
    Returns
    -------
    dict with keys:
        - plume: list of [lat, lng] coordinates forming the cone
        - metadata: dict with plume dimensions
    """
    # Plume extends 50km downwind (can be adjusted by wind speed)
    plume_length_km = 50.0
    
    # Width at origin (1km) and at far end (15km)
    width_start_km = 1.0
    width_end_km = 15.0
    
    # Convert wind direction to radians
    wind_rad = math.radians(90 - wind_deg)
    
    # Vector pointing downwind
    dx = math.cos(wind_rad)
    dy = math.sin(wind_rad)
    
    # Perpendicular vector (for width)
    perp_dx = -dy
    perp_dy = dx
    
    # Build cone polygon: start narrow, end wide
    polygon = []
    
    # Left edge of origin
    offset_km = width_start_km / 2
    lat_offset = (perp_dy * offset_km) / 111.0
    lng_offset = (perp_dx * offset_km) / (111.0 * math.cos(math.radians(latitude)))
    polygon.append([latitude + lat_offset, longitude + lng_offset])
    
    # Right edge of origin
    lat_offset = -(perp_dy * offset_km) / 111.0
    lng_offset = -(perp_dx * offset_km) / (111.0 * math.cos(math.radians(latitude)))
    polygon.append([latitude + lat_offset, longitude + lng_offset])
    
    # Right edge of far end
    far_lat = latitude + (dy * plume_length_km) / 111.0
    far_lng = longitude + (dx * plume_length_km) / (111.0 * math.cos(math.radians(latitude)))
    
    offset_km = width_end_km / 2
    lat_offset = -(perp_dy * offset_km) / 111.0
    lng_offset = -(perp_dx * offset_km) / (111.0 * math.cos(math.radians(latitude)))
    polygon.append([far_lat + lat_offset, far_lng + lng_offset])
    
    # Left edge of far end
    lat_offset = (perp_dy * offset_km) / 111.0
    lng_offset = (perp_dx * offset_km) / (111.0 * math.cos(math.radians(latitude)))
    polygon.append([far_lat + lat_offset, far_lng + lng_offset])
    
    # Close polygon
    polygon.append(polygon[0])
    
    return {
        "plume": polygon,
        "metadata": {
            "length_km":       plume_length_km,
            "width_start_km":  width_start_km,
            "width_end_km":    width_end_km,
            "wind_direction_deg": wind_deg,
            "wind_speed_kmh":  wind_speed_kmh,
        }
    }
