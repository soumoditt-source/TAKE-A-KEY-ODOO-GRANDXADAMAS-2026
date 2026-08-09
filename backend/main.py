"""Take-A-Key API: tenant-safe carpool matching, bookings, wallet, and fleet data."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, List, Tuple
from uuid import uuid4

import jwt
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import get_connection
from middleware.kernel import require_admin_role, verify_abac_tenant
from utils.routing import detour_score_astar


app = FastAPI(title="Take-A-Key Mobility API", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str | None = None


class MatchRequest(BaseModel):
    pickup_lat: float = Field(ge=-90, le=90)
    pickup_lon: float = Field(ge=-180, le=180)
    dropoff_lat: float = Field(ge=-90, le=90)
    dropoff_lon: float = Field(ge=-180, le=180)
    seats_requested: int = Field(default=1, ge=1, le=8)


class LiveTelemetry(BaseModel):
    driver_lat: float
    driver_lon: float
    path_to_pickup: List[Tuple[float, float]]
    pickup_eta_seconds: int
    distance_km: float


class RideMatchResponse(BaseModel):
    ride_id: str
    driver_id: str
    driver_name: str
    vehicle_color: str
    license_plate: str
    vehicle_type: str
    available_seats: int
    fare: float
    departure_time: str
    efficiency_score_seconds: float
    detour_km: float
    telemetry: LiveTelemetry


class BidRequest(BaseModel):
    ride_id: str
    bid_fare: float = Field(ge=0)
    seats_requested: int = Field(default=1, ge=1, le=8)
    pickup_lat: float = Field(ge=-90, le=90)
    pickup_lon: float = Field(ge=-180, le=180)
    drop_lat: float = Field(ge=-90, le=90)
    drop_lon: float = Field(ge=-180, le=180)


class AcceptRequest(BaseModel):
    request_id: str


class OfferRideRequest(BaseModel):
    vehicle_id: str
    origin_lat: float = Field(ge=-90, le=90)
    origin_lon: float = Field(ge=-180, le=180)
    dest_lat: float = Field(ge=-90, le=90)
    dest_lon: float = Field(ge=-180, le=180)
    departure_time: str
    available_seats: int = Field(ge=1, le=60)
    fare: float = Field(default=0, ge=0)


class VehicleRequest(BaseModel):
    license_plate: str = Field(min_length=4, max_length=20)
    capacity: int = Field(ge=1, le=60)
    color: str = Field(default="Graphite Grey", min_length=2, max_length=40)
    vehicle_type: str = Field(default="Sedan")


class AmountRequest(BaseModel):
    amount: float = Field(gt=0, le=100000)


def _parse_time(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(status_code=422, detail="departure_time must be ISO-8601") from error
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _commit(connection: Any) -> None:
    connection.commit()
    connection.close()


def _close(connection: Any) -> None:
    connection.rollback()
    connection.close()


@app.post("/api/v1/auth/login")
def login(request: LoginRequest) -> dict[str, Any]:
    connection = get_connection()
    user = connection.execute(
        "SELECT id, email, full_name, company_id, role FROM users WHERE lower(email) = lower(?)",
        (request.email.strip(),),
    ).fetchone()
    connection.close()
    if not user:
        raise HTTPException(status_code=401, detail="No account found for this email.")

    secret = os.getenv("JWT_SECRET", "super-secret-enterprise-key-do-not-share")
    token = jwt.encode(
        {
            "sub": user["id"],
            "company_id": user["company_id"],
            "role_profile": user["role"],
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "exp": int((datetime.now(timezone.utc).timestamp()) + 12 * 60 * 60),
            "jti": uuid4().hex,
        },
        secret,
        algorithm="HS256",
    )
    return {"token": token, "user": dict(user)}


@app.get("/api/v1/auth/me")
def current_user(user: dict = Depends(verify_abac_tenant)) -> dict[str, Any]:
    connection = get_connection()
    row = connection.execute(
        "SELECT id, email, full_name, company_id, role FROM users WHERE id = ?",
        (user["sub"],),
    ).fetchone()
    connection.close()
    if not row:
        raise HTTPException(status_code=401, detail="User account is no longer active.")
    return dict(row)


@app.post("/api/v1/spatial/match", response_model=List[RideMatchResponse])
def spatial_match(request: MatchRequest, tenant: dict = Depends(verify_abac_tenant)) -> list[RideMatchResponse]:
    connection = get_connection()
    rows = connection.execute(
        """
        SELECT r.id AS ride_id, r.driver_id, r.origin_lat, r.origin_lon, r.dest_lat, r.dest_lon,
               r.available_seats, r.fare, r.departure_time, u.full_name AS driver_name,
               v.color AS vehicle_color, v.license_plate, v.vehicle_type
        FROM rides r
        JOIN users u ON u.id = r.driver_id
        JOIN vehicles v ON v.id = r.vehicle_id
        WHERE u.company_id = ?
          AND r.status IN ('scheduled', 'active')
          AND r.available_seats >= ?
        ORDER BY r.departure_time ASC
        """,
        (tenant["company_id"], request.seats_requested),
    ).fetchall()
    connection.close()

    matches: list[RideMatchResponse] = []
    for row in rows:
        score_seconds, detour_km, path, pickup_eta = detour_score_astar(
            driver_lat=row["origin_lat"],
            driver_lon=row["origin_lon"],
            pickup_lat=request.pickup_lat,
            pickup_lon=request.pickup_lon,
            dropoff_lat=request.dropoff_lat,
            dropoff_lon=request.dropoff_lon,
            driver_dest_lat=row["dest_lat"],
            driver_dest_lon=row["dest_lon"],
        )
        matches.append(
            RideMatchResponse(
                ride_id=row["ride_id"],
                driver_id=row["driver_id"],
                driver_name=row["driver_name"],
                vehicle_color=row["vehicle_color"] or "Graphite Grey",
                license_plate=row["license_plate"],
                vehicle_type=row["vehicle_type"] or "Sedan",
                available_seats=row["available_seats"],
                fare=float(row["fare"] or 0),
                departure_time=row["departure_time"],
                efficiency_score_seconds=score_seconds,
                detour_km=detour_km,
                telemetry=LiveTelemetry(
                    driver_lat=row["origin_lat"],
                    driver_lon=row["origin_lon"],
                    path_to_pickup=path,
                    pickup_eta_seconds=pickup_eta,
                    distance_km=round(detour_km, 2),
                ),
            )
        )
    return sorted(matches, key=lambda match: match.efficiency_score_seconds)


@app.get("/api/v1/rides")
def list_rides(tenant: dict = Depends(verify_abac_tenant)) -> list[dict[str, Any]]:
    connection = get_connection()
    rows = connection.execute(
        """
        SELECT r.id, r.origin_lat, r.origin_lon, r.dest_lat, r.dest_lon, r.departure_time,
               r.available_seats, r.fare, r.status, u.full_name AS driver_name,
               u.id AS driver_id, v.license_plate, v.color, v.vehicle_type
        FROM rides r
        JOIN users u ON u.id = r.driver_id
        JOIN vehicles v ON v.id = r.vehicle_id
        WHERE u.company_id = ?
        ORDER BY r.departure_time ASC
        """,
        (tenant["company_id"],),
    ).fetchall()
    connection.close()
    return [dict(row) for row in rows]


@app.get("/api/v1/me/rides")
def my_offered_rides(tenant: dict = Depends(verify_abac_tenant)) -> list[dict[str, Any]]:
    connection = get_connection()
    rows = connection.execute(
        """
        SELECT r.*, v.license_plate, v.vehicle_type
        FROM rides r JOIN vehicles v ON v.id = r.vehicle_id
        WHERE r.driver_id = ? ORDER BY r.departure_time DESC
        """,
        (tenant["sub"],),
    ).fetchall()
    connection.close()
    return [dict(row) for row in rows]


@app.post("/api/v1/rides/offer")
def offer_ride(request: OfferRideRequest, driver: dict = Depends(verify_abac_tenant)) -> dict[str, Any]:
    departure = _parse_time(request.departure_time)
    if departure <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Departure must be in the future.")

    connection = get_connection()
    vehicle = connection.execute(
        """
        SELECT v.id, v.capacity FROM vehicles v JOIN users u ON u.id = v.owner_id
        WHERE v.id = ? AND v.owner_id = ? AND u.company_id = ?
        """,
        (request.vehicle_id, driver["sub"], driver["company_id"]),
    ).fetchone()
    if not vehicle:
        _close(connection)
        raise HTTPException(status_code=403, detail="You can only publish with your own company vehicle.")
    if request.available_seats > vehicle["capacity"]:
        _close(connection)
        raise HTTPException(status_code=422, detail="Available seats exceed vehicle capacity.")

    ride_id = f"r-{uuid4().hex[:10]}"
    connection.execute(
        """INSERT INTO rides
        (id, driver_id, vehicle_id, origin_lat, origin_lon, dest_lat, dest_lon, departure_time, available_seats, fare, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')""",
        (
            ride_id,
            driver["sub"],
            request.vehicle_id,
            request.origin_lat,
            request.origin_lon,
            request.dest_lat,
            request.dest_lon,
            departure.isoformat(),
            request.available_seats,
            request.fare,
        ),
    )
    _commit(connection)
    return {"status": "success", "ride_id": ride_id, "message": "Ride published for your company network."}


@app.post("/api/v1/ride/request")
def request_ride(request: BidRequest, passenger: dict = Depends(verify_abac_tenant)) -> dict[str, Any]:
    connection = get_connection()
    ride = connection.execute(
        """
        SELECT r.id, r.driver_id, r.available_seats, r.fare
        FROM rides r JOIN users u ON u.id = r.driver_id
        WHERE r.id = ? AND u.company_id = ? AND r.status IN ('scheduled', 'active')
        """,
        (request.ride_id, passenger["company_id"]),
    ).fetchone()
    if not ride:
        _close(connection)
        raise HTTPException(status_code=404, detail="Ride is not available in your company network.")
    if ride["driver_id"] == passenger["sub"]:
        _close(connection)
        raise HTTPException(status_code=422, detail="A driver cannot book their own ride.")
    if request.seats_requested > ride["available_seats"]:
        _close(connection)
        raise HTTPException(status_code=409, detail="Not enough seats remain.")
    duplicate = connection.execute(
        """
        SELECT 1 FROM ride_requests WHERE ride_id = ? AND passenger_id = ? AND status = 'pending'
        UNION ALL
        SELECT 1 FROM bookings WHERE ride_id = ? AND passenger_id = ? AND status IN ('pending', 'approved')
        LIMIT 1
        """,
        (request.ride_id, passenger["sub"], request.ride_id, passenger["sub"]),
    ).fetchone()
    if duplicate:
        _close(connection)
        raise HTTPException(status_code=409, detail="You already have an active request for this ride.")

    request_id = f"req-{uuid4().hex[:10]}"
    connection.execute(
        """INSERT INTO ride_requests
        (id, ride_id, passenger_id, bid_fare, seats_requested, pickup_lat, pickup_lon, drop_lat, drop_lon)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            request_id,
            request.ride_id,
            passenger["sub"],
            request.bid_fare,
            request.seats_requested,
            request.pickup_lat,
            request.pickup_lon,
            request.drop_lat,
            request.drop_lon,
        ),
    )
    _commit(connection)
    return {"status": "success", "request_id": request_id, "message": "Request sent to the driver."}


@app.get("/api/v1/requests")
def pending_requests(driver: dict = Depends(verify_abac_tenant)) -> list[dict[str, Any]]:
    connection = get_connection()
    rows = connection.execute(
        """
        SELECT rr.*, r.departure_time, u.full_name AS passenger_name, u.email AS passenger_email
        FROM ride_requests rr
        JOIN rides r ON r.id = rr.ride_id
        JOIN users u ON u.id = rr.passenger_id
        WHERE r.driver_id = ? AND rr.status = 'pending'
        ORDER BY rr.created_at ASC
        """,
        (driver["sub"],),
    ).fetchall()
    connection.close()
    return [dict(row) for row in rows]


@app.post("/api/v1/ride/accept")
def accept_ride_request(request: AcceptRequest, driver: dict = Depends(verify_abac_tenant)) -> dict[str, Any]:
    connection = get_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        ride_request = connection.execute(
            """
            SELECT rr.ride_id, rr.passenger_id, rr.bid_fare, rr.seats_requested
            FROM ride_requests rr JOIN rides r ON r.id = rr.ride_id
            JOIN users u ON u.id = r.driver_id
            WHERE rr.id = ? AND rr.status = 'pending' AND r.driver_id = ? AND u.company_id = ?
            """,
            (request.request_id, driver["sub"], driver["company_id"]),
        ).fetchone()
        if not ride_request:
            raise HTTPException(status_code=404, detail="Request not found or already processed.")
        updated = connection.execute(
            """UPDATE rides SET available_seats = available_seats - ?
            WHERE id = ? AND available_seats >= ?""",
            (ride_request["seats_requested"], ride_request["ride_id"], ride_request["seats_requested"]),
        )
        if updated.rowcount != 1:
            connection.execute("UPDATE ride_requests SET status = 'rejected' WHERE id = ?", (request.request_id,))
            raise HTTPException(status_code=409, detail="Not enough seats remain for this request.")

        booking_id = f"bk-{uuid4().hex[:10]}"
        connection.execute(
            """INSERT INTO bookings
            (id, ride_id, passenger_id, request_id, seats, fare, status, payment_status)
            VALUES (?, ?, ?, ?, ?, ?, 'approved', 'pending')""",
            (
                booking_id,
                ride_request["ride_id"],
                ride_request["passenger_id"],
                request.request_id,
                ride_request["seats_requested"],
                ride_request["bid_fare"],
            ),
        )
        connection.execute("UPDATE ride_requests SET status = 'accepted' WHERE id = ?", (request.request_id,))
        connection.commit()
        return {"status": "success", "booking_id": booking_id, "message": "Passenger confirmed."}
    except HTTPException:
        connection.rollback()
        raise
    except Exception as error:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Unable to accept request safely.") from error
    finally:
        connection.close()


@app.get("/api/v1/trips")
def list_trips(user: dict = Depends(verify_abac_tenant)) -> list[dict[str, Any]]:
    connection = get_connection()
    rows = connection.execute(
        """
        SELECT b.id AS booking_id, b.seats, b.fare, b.status AS booking_status, b.payment_status,
               r.id AS ride_id, r.departure_time, r.origin_lat, r.origin_lon, r.dest_lat, r.dest_lon,
               r.status AS ride_status, u.full_name AS driver_name, u.email AS driver_email,
               v.license_plate, v.vehicle_type
        FROM bookings b
        JOIN rides r ON r.id = b.ride_id
        JOIN users u ON u.id = r.driver_id
        JOIN vehicles v ON v.id = r.vehicle_id
        WHERE b.passenger_id = ?
        ORDER BY r.departure_time DESC
        """,
        (user["sub"],),
    ).fetchall()
    connection.close()
    return [dict(row) for row in rows]


@app.get("/api/v1/me/vehicles")
def list_my_vehicles(user: dict = Depends(verify_abac_tenant)) -> list[dict[str, Any]]:
    connection = get_connection()
    rows = connection.execute(
        "SELECT * FROM vehicles WHERE owner_id = ? ORDER BY created_at DESC",
        (user["sub"],),
    ).fetchall()
    connection.close()
    return [dict(row) for row in rows]


@app.post("/api/v1/me/vehicles")
def create_vehicle(request: VehicleRequest, user: dict = Depends(verify_abac_tenant)) -> dict[str, Any]:
    if request.vehicle_type not in {"Sedan", "Pool", "Shuttle", "Bus"}:
        raise HTTPException(status_code=422, detail="Unsupported vehicle type.")
    connection = get_connection()
    vehicle_id = f"v-{uuid4().hex[:10]}"
    try:
        connection.execute(
            """INSERT INTO vehicles (id, owner_id, license_plate, capacity, color, vehicle_type)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (vehicle_id, user["sub"], request.license_plate.upper(), request.capacity, request.color, request.vehicle_type),
        )
        _commit(connection)
        return {"status": "success", "vehicle_id": vehicle_id}
    except Exception as error:
        _close(connection)
        raise HTTPException(status_code=409, detail="License plate is already registered.") from error


@app.get("/api/v1/wallet")
def wallet(user: dict = Depends(verify_abac_tenant)) -> dict[str, Any]:
    connection = get_connection()
    owner = connection.execute("SELECT wallet_balance FROM users WHERE id = ?", (user["sub"],)).fetchone()
    transactions = connection.execute(
        """SELECT id, amount, type, status, created_at FROM transactions
        WHERE user_id = ? ORDER BY created_at DESC LIMIT 20""",
        (user["sub"],),
    ).fetchall()
    connection.close()
    return {"balance": float(owner["wallet_balance"] if owner else 0), "transactions": [dict(row) for row in transactions]}


@app.post("/api/v1/wallet/top-up")
def top_up(request: AmountRequest, user: dict = Depends(verify_abac_tenant)) -> dict[str, Any]:
    connection = get_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?", (request.amount, user["sub"]))
        connection.execute(
            "INSERT INTO transactions (id, booking_id, user_id, amount, type, status) VALUES (?, NULL, ?, ?, 'top_up', 'completed')",
            (f"tx-{uuid4().hex[:10]}", user["sub"], request.amount),
        )
        balance = connection.execute("SELECT wallet_balance FROM users WHERE id = ?", (user["sub"],)).fetchone()[0]
        connection.commit()
        return {"status": "success", "balance": float(balance)}
    except Exception as error:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Unable to update wallet.") from error
    finally:
        connection.close()


@app.post("/api/v1/wallet/pay/{booking_id}")
def pay_booking(booking_id: str, user: dict = Depends(verify_abac_tenant)) -> dict[str, Any]:
    connection = get_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        booking = connection.execute(
            "SELECT fare, payment_status FROM bookings WHERE id = ? AND passenger_id = ? AND status = 'approved'",
            (booking_id, user["sub"]),
        ).fetchone()
        if not booking:
            raise HTTPException(status_code=404, detail="Payable booking not found.")
        if booking["payment_status"] == "completed":
            raise HTTPException(status_code=409, detail="Booking is already paid.")
        balance = connection.execute("SELECT wallet_balance FROM users WHERE id = ?", (user["sub"],)).fetchone()[0]
        if balance < booking["fare"]:
            raise HTTPException(status_code=402, detail="Top up your wallet before paying.")
        connection.execute("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?", (booking["fare"], user["sub"]))
        connection.execute("UPDATE bookings SET payment_status = 'completed' WHERE id = ?", (booking_id,))
        connection.execute(
            "INSERT INTO transactions (id, booking_id, user_id, amount, type, status) VALUES (?, ?, ?, ?, 'payment', 'completed')",
            (f"tx-{uuid4().hex[:10]}", booking_id, user["sub"], booking["fare"]),
        )
        connection.commit()
        return {"status": "success", "message": "Payment completed from wallet."}
    except HTTPException:
        connection.rollback()
        raise
    finally:
        connection.close()


@app.get("/api/v1/admin/fleet")
def fleet_status(admin: dict = Depends(require_admin_role)) -> dict[str, Any]:
    connection = get_connection()
    vehicles = connection.execute(
        """SELECT v.id, v.license_plate, v.capacity, v.color, v.vehicle_type, u.full_name AS owner
        FROM vehicles v JOIN users u ON u.id = v.owner_id WHERE u.company_id = ? ORDER BY v.created_at DESC""",
        (admin["company_id"],),
    ).fetchall()
    rides = connection.execute(
        """SELECT r.status, COUNT(*) AS count FROM rides r JOIN users u ON u.id = r.driver_id
        WHERE u.company_id = ? GROUP BY r.status""",
        (admin["company_id"],),
    ).fetchall()
    employees = connection.execute(
        "SELECT COUNT(*) AS count FROM users WHERE company_id = ?", (admin["company_id"],)
    ).fetchone()["count"]
    revenue = connection.execute(
        """SELECT COALESCE(SUM(t.amount), 0) AS total FROM transactions t
        JOIN users u ON u.id = t.user_id WHERE u.company_id = ? AND t.type = 'payment'""",
        (admin["company_id"],),
    ).fetchone()["total"]
    connection.close()
    return {
        "metrics": {"employees": employees, "vehicles": len(vehicles), "revenue": float(revenue or 0)},
        "fleet": [dict(row) for row in vehicles],
        "ride_summary": [dict(row) for row in rides],
    }


@app.get("/health")
def health() -> dict[str, str]:
    connection = get_connection()
    connection.execute("SELECT 1").fetchone()
    connection.close()
    return {"status": "ok", "engine": "OSRM / Haversine fallback", "database": "sqlite-ready"}
