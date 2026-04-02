"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/evacuation.py
Purpose : Evacuation route generator using OpenRouteService Directions API
"""

import os
import logging
from typing import List, Dict, Any
import requests
import polyline

log = logging.getLogger(__name__)

# Major California cities for evacuation routing
MAJOR_CITIES = [
    {"name": "Sacramento", "lat": 38.5816, "lon": -121.4944},
    {"name": "San Francisco", "lat": 37.7749, "lon": -122.4194},
    {"name": "Fresno", "lat": 36.7378, "lon": -119.7871},
]


def compute_evacuation_routes(fire_lat: float, fire_lon: float) -> Dict[str, Any]:
    """
    Compute evacuation routes from fire location to 3 nearest major California cities.
    Uses OpenRouteService Directions API.
    
    Args:
        fire_lat: Fire latitude
        fire_lon: Fire longitude
        
    Returns:
        Dict with routes array, each containing:
        - city: city name
        - coordinates: list of [lat, lng] pairs (decoded polyline)
        - distance_km: distance in kilometers
        - duration_min: duration in minutes
        - city_lat, city_lon: destination coordinates
    """
    ors_api_key = os.getenv("ORS_API_KEY")
    
    if not ors_api_key:
        log.warning("ORS_API_KEY not configured — generating straight-line fallback routes")
        return _generate_fallback_routes(fire_lat, fire_lon)
    
    routes = []
    
    for city in MAJOR_CITIES:
        try:
            # ORS Directions API endpoint
            url = "https://api.openrouteservice.org/v2/directions/driving-car"
            
            headers = {
                "Authorization": ors_api_key,
                "Content-Type": "application/json",
            }
            
            payload = {
                "coordinates": [[fire_lon, fire_lat], [city["lon"], city["lat"]]],
                "format": "json",
                "units": "km",
                "instructions": False,
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            if "routes" in data and len(data["routes"]) > 0:
                route = data["routes"][0]
                geometry = route["geometry"]
                
                # Decode polyline to coordinates
                coords = polyline.decode(geometry)
                # Convert to [lat, lng] format
                coordinates = [[lat, lng] for lat, lng in coords]
                
                distance_km = route["summary"]["distance"]  # already in km
                duration_sec = route["summary"]["duration"]
                duration_min = round(duration_sec / 60, 1)
                
                routes.append({
                    "city": city["name"],
                    "coordinates": coordinates,
                    "distance_km": round(distance_km, 2),
                    "duration_min": duration_min,
                    "city_lat": city["lat"],
                    "city_lon": city["lon"],
                })
                
                log.info(f"Route to {city['name']}: {distance_km:.1f}km, {duration_min:.0f}min")
            else:
                log.warning(f"No route data for {city['name']}")
                routes.append(_fallback_route(fire_lat, fire_lon, city))
                
        except requests.exceptions.RequestException as e:
            log.error(f"ORS API error for {city['name']}: {e}")
            routes.append(_fallback_route(fire_lat, fire_lon, city))
        except Exception as e:
            log.error(f"Unexpected error computing route to {city['name']}: {e}")
            routes.append(_fallback_route(fire_lat, fire_lon, city))
    
    return {
        "routes": routes,
        "fire_location": {"lat": fire_lat, "lon": fire_lon},
        "ors_used": True,
    }


def _generate_fallback_routes(fire_lat: float, fire_lon: float) -> Dict[str, Any]:
    """Generate straight-line fallback routes when ORS is not available."""
    routes = []
    
    for city in MAJOR_CITIES:
        routes.append(_fallback_route(fire_lat, fire_lon, city))
    
    return {
        "routes": routes,
        "fire_location": {"lat": fire_lat, "lon": fire_lon},
        "ors_used": False,
    }


def _fallback_route(fire_lat: float, fire_lon: float, city: Dict[str, Any]) -> Dict[str, Any]:
    """Create a simple straight-line route as fallback."""
    import math
    
    # Calculate straight-line distance using Haversine formula
    R = 6371  # Earth radius in km
    lat1, lon1 = math.radians(fire_lat), math.radians(fire_lon)
    lat2, lon2 = math.radians(city["lat"]), math.radians(city["lon"])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    distance_km = R * c
    
    # Estimate duration (assuming average 60 km/h for straight line)
    duration_min = round((distance_km / 60) * 60, 1)
    
    return {
        "city": city["name"],
        "coordinates": [[fire_lat, fire_lon], [city["lat"], city["lon"]]],
        "distance_km": round(distance_km, 2),
        "duration_min": duration_min,
        "city_lat": city["lat"],
        "city_lon": city["lon"],
        "fallback": True,
    }
