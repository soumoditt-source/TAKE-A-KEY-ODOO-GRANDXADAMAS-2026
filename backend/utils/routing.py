"""OSM-backed route scoring with a deterministic offline fallback."""

from __future__ import annotations

import math
import os
from functools import lru_cache
from typing import List, Tuple

import requests


OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
OSRM_ENABLED = os.getenv("OSRM_ENABLED", "true").lower() == "true"
Point = Tuple[float, float]


def _haversine(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> float:
    radius_km = 6371.0
    delta_lat = math.radians(end_lat - start_lat)
    delta_lon = math.radians(end_lon - start_lon)
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(math.radians(start_lat))
        * math.cos(math.radians(end_lat))
        * math.sin(delta_lon / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def _fallback_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Tuple[List[Point], int, float]:
    distance_km = _haversine(start_lat, start_lon, end_lat, end_lon)
    duration_seconds = int((distance_km / 30.0) * 3600)
    return [(start_lat, start_lon), (end_lat, end_lon)], duration_seconds, distance_km


@lru_cache(maxsize=512)
def calculate_astar_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Tuple[List[Point], int, float]:
    """Return an OSM road path, driving ETA, and distance in kilometres."""
    if not OSRM_ENABLED:
        return _fallback_route(start_lat, start_lon, end_lat, end_lon)

    url = f"{OSRM_BASE_URL}/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
    try:
        response = requests.get(
            url,
            params={"overview": "full", "geometries": "geojson", "steps": "false"},
            timeout=4,
        )
        response.raise_for_status()
        payload = response.json()
        route = payload.get("routes", [None])[0]
        if payload.get("code") != "Ok" or not route:
            return _fallback_route(start_lat, start_lon, end_lat, end_lon)

        geometry = route.get("geometry", {}).get("coordinates", [])
        if not geometry:
            return _fallback_route(start_lat, start_lon, end_lat, end_lon)
        step = max(1, len(geometry) // 60)
        path = [(round(lat, 6), round(lon, 6)) for lon, lat in geometry[::step]]
        final_point = (round(geometry[-1][1], 6), round(geometry[-1][0], 6))
        if path[-1] != final_point:
            path.append(final_point)
        return path, int(route["duration"]), float(route["distance"]) / 1000.0
    except (requests.RequestException, ValueError, KeyError, TypeError):
        return _fallback_route(start_lat, start_lon, end_lat, end_lon)


def detour_score_astar(
    driver_lat: float,
    driver_lon: float,
    pickup_lat: float,
    pickup_lon: float,
    dropoff_lat: float,
    dropoff_lon: float,
    driver_dest_lat: float | None = None,
    driver_dest_lon: float | None = None,
) -> Tuple[float, float, List[Point], int]:
    """Score the extra road time and distance created by the passenger."""
    pickup_path, pickup_eta, pickup_distance = calculate_astar_route(
        driver_lat, driver_lon, pickup_lat, pickup_lon
    )
    passenger_eta_path, passenger_eta, passenger_distance = calculate_astar_route(
        pickup_lat, pickup_lon, dropoff_lat, dropoff_lon
    )
    del passenger_eta_path

    if driver_dest_lat is None or driver_dest_lon is None:
        baseline_eta = 0
        baseline_distance = 0.0
        tail_eta = 0
        tail_distance = 0.0
    else:
        _, baseline_eta, baseline_distance = calculate_astar_route(
            driver_lat, driver_lon, driver_dest_lat, driver_dest_lon
        )
        _, tail_eta, tail_distance = calculate_astar_route(
            dropoff_lat, dropoff_lon, driver_dest_lat, driver_dest_lon
        )

    total_eta = pickup_eta + passenger_eta + tail_eta
    total_distance = pickup_distance + passenger_distance + tail_distance
    return (
        float(max(0, total_eta - baseline_eta)),
        round(max(0.0, total_distance - baseline_distance), 3),
        pickup_path,
        pickup_eta,
    )
