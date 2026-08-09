from fastapi.testclient import TestClient

from main import app
from utils.haversine import calculate_haversine, detour_score
from utils import routing


client = TestClient(app)


def login(email: str) -> tuple[str, dict]:
    response = client.post("/api/v1/auth/login", json={"email": email})
    assert response.status_code == 200
    body = response.json()
    return body["token"], body["user"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_calculate_haversine() -> None:
    distance = calculate_haversine(22.5696, 88.4815, 22.5510, 88.3533)
    assert 13.0 <= distance <= 13.6


def test_detour_score() -> None:
    route = ((22.5696, 88.4815), (22.5510, 88.3533))
    assert detour_score(route[0], route[1], route[0], route[1]) == 0.0


def test_auth_and_tenant_protection() -> None:
    assert client.get("/api/v1/rides").status_code in {401, 403}
    token, user = login("vikram.sen@tcs.com")
    assert user["company_id"] == "TCS_KOL"
    assert client.get("/api/v1/rides", headers=auth(token)).status_code == 200


def test_spatial_match_uses_offline_fallback(monkeypatch) -> None:
    monkeypatch.setattr(routing, "OSRM_ENABLED", False)
    routing.calculate_astar_route.cache_clear()
    token, _ = login("vikram.sen@tcs.com")
    response = client.post(
        "/api/v1/spatial/match",
        headers=auth(token),
        json={
            "pickup_lat": 22.5696,
            "pickup_lon": 88.4815,
            "dropoff_lat": 22.5135,
            "dropoff_lon": 88.4031,
            "seats_requested": 1,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body
    assert {"ride_id", "efficiency_score_seconds", "telemetry"} <= body[0].keys()


def test_offer_request_and_accept_flow() -> None:
    driver_token, _ = login("arup.roy@tcs.com")
    passenger_token, _ = login("vikram.sen@tcs.com")
    offer = client.post(
        "/api/v1/rides/offer",
        headers=auth(driver_token),
        json={
            "vehicle_id": "v-3001",
            "origin_lat": 22.57,
            "origin_lon": 88.48,
            "dest_lat": 22.51,
            "dest_lon": 88.40,
            "departure_time": "2099-08-08T18:00:00+00:00",
            "available_seats": 2,
            "fare": 120,
        },
    )
    assert offer.status_code == 200
    ride_id = offer.json()["ride_id"]
    request = client.post(
        "/api/v1/ride/request",
        headers=auth(passenger_token),
        json={
            "ride_id": ride_id,
            "bid_fare": 120,
            "seats_requested": 1,
            "pickup_lat": 22.57,
            "pickup_lon": 88.48,
            "drop_lat": 22.51,
            "drop_lon": 88.40,
        },
    )
    assert request.status_code == 200
    accepted = client.post(
        "/api/v1/ride/accept",
        headers=auth(driver_token),
        json={"request_id": request.json()["request_id"]},
    )
    assert accepted.status_code == 200
    trips = client.get("/api/v1/trips", headers=auth(passenger_token))
    assert any(trip["ride_id"] == ride_id for trip in trips.json())
