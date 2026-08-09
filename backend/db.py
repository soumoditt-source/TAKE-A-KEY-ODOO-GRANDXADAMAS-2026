"""SQLite persistence for the local Take-A-Key demo and test environment."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()


DB_PATH = os.getenv(
    "TAKEAKEY_DB_PATH",
    str(Path(__file__).resolve().with_name("takeakey.db")),
)
DEMO_MODE = os.getenv("TAKEAKEY_DEMO_MODE", "true").lower() == "true"


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    company_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
    wallet_balance REAL NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_plate TEXT NOT NULL UNIQUE,
    capacity INTEGER NOT NULL CHECK (capacity > 0 AND capacity <= 60),
    color TEXT NOT NULL DEFAULT 'Graphite Grey',
    vehicle_type TEXT NOT NULL DEFAULT 'Sedan' CHECK (vehicle_type IN ('Sedan', 'Pool', 'Shuttle', 'Bus')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rides (
    id TEXT PRIMARY KEY,
    driver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    origin_lat REAL NOT NULL CHECK (origin_lat BETWEEN -90 AND 90),
    origin_lon REAL NOT NULL CHECK (origin_lon BETWEEN -180 AND 180),
    dest_lat REAL NOT NULL CHECK (dest_lat BETWEEN -90 AND 90),
    dest_lon REAL NOT NULL CHECK (dest_lon BETWEEN -180 AND 180),
    departure_time TEXT NOT NULL,
    available_seats INTEGER NOT NULL CHECK (available_seats >= 0),
    fare REAL NOT NULL DEFAULT 0 CHECK (fare >= 0),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ride_requests (
    id TEXT PRIMARY KEY,
    ride_id TEXT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    passenger_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bid_fare REAL NOT NULL CHECK (bid_fare >= 0),
    seats_requested INTEGER NOT NULL DEFAULT 1 CHECK (seats_requested > 0),
    pickup_lat REAL NOT NULL CHECK (pickup_lat BETWEEN -90 AND 90),
    pickup_lon REAL NOT NULL CHECK (pickup_lon BETWEEN -180 AND 180),
    drop_lat REAL NOT NULL CHECK (drop_lat BETWEEN -90 AND 90),
    drop_lon REAL NOT NULL CHECK (drop_lon BETWEEN -180 AND 180),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    ride_id TEXT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    passenger_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id TEXT UNIQUE REFERENCES ride_requests(id) ON DELETE SET NULL,
    seats INTEGER NOT NULL DEFAULT 1 CHECK (seats > 0),
    fare REAL NOT NULL DEFAULT 0 CHECK (fare >= 0),
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'refunded')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount REAL NOT NULL CHECK (amount >= 0),
    type TEXT NOT NULL DEFAULT 'payment' CHECK (type IN ('payment', 'top_up', 'refund')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_status ON rides(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_rides_search ON rides(status, departure_time, available_seats);
CREATE INDEX IF NOT EXISTS idx_requests_ride_status ON ride_requests(ride_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger ON bookings(passenger_id, status);
"""


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA busy_timeout = 15000")
    return connection


def _ensure_column(connection: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _migrate_transactions(connection: sqlite3.Connection) -> None:
    columns = {row[1]: row for row in connection.execute("PRAGMA table_info(transactions)")}
    booking_id = columns.get("booking_id")
    if not booking_id or booking_id[3] != 1:
        return
    connection.execute("ALTER TABLE transactions RENAME TO transactions_legacy")
    connection.execute(
        """CREATE TABLE transactions (
            id TEXT PRIMARY KEY,
            booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount REAL NOT NULL CHECK (amount >= 0),
            type TEXT NOT NULL DEFAULT 'payment' CHECK (type IN ('payment', 'top_up', 'refund')),
            status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    connection.execute(
        """INSERT INTO transactions (id, booking_id, user_id, amount, type, status, created_at)
        SELECT legacy.id, legacy.booking_id,
               COALESCE(bookings.passenger_id, (SELECT id FROM users LIMIT 1)),
               legacy.amount, 'payment', legacy.status, legacy.created_at
        FROM transactions_legacy legacy
        LEFT JOIN bookings ON bookings.id = legacy.booking_id"""
    )
    connection.execute("DROP TABLE transactions_legacy")


def _seed_demo_data(connection: sqlite3.Connection) -> None:
    if connection.execute("SELECT 1 FROM users LIMIT 1").fetchone():
        return

    now = datetime.now(timezone.utc)
    users = [
        ("d-1001", "arup.roy@tcs.com", "Arup Roy", "TCS_KOL", "admin", 1500.0),
        ("d-1002", "sneha.das@cognizant.com", "Sneha Das", "COG_KOL", "employee", 200.0),
        ("d-1003", "raj.mukherjee@tcs.com", "Raj Mukherjee", "TCS_KOL", "employee", 500.0),
        ("p-2001", "vikram.sen@tcs.com", "Vikram Sen", "TCS_KOL", "employee", 3000.0),
        ("p-2002", "priya.bose@cognizant.com", "Priya Bose", "COG_KOL", "employee", 800.0),
        ("p-2003", "ananya.ghosh@tcs.com", "Ananya Ghosh", "TCS_KOL", "employee", 100.0),
    ]
    connection.executemany(
        "INSERT INTO users (id, email, full_name, company_id, role, wallet_balance) VALUES (?, ?, ?, ?, ?, ?)",
        users,
    )
    connection.executemany(
        "INSERT INTO vehicles (id, owner_id, license_plate, capacity, color, vehicle_type) VALUES (?, ?, ?, ?, ?, ?)",
        [
            ("v-3001", "d-1001", "WB02AB1234", 3, "Obsidian Black", "Sedan"),
            ("v-3002", "d-1002", "WB06CD5678", 12, "Arctic White", "Shuttle"),
            ("v-3003", "d-1003", "WB26EF9012", 40, "Graphite Grey", "Bus"),
        ],
    )
    connection.executemany(
        """INSERT INTO rides
        (id, driver_id, vehicle_id, origin_lat, origin_lon, dest_lat, dest_lon, departure_time, available_seats, fare, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            ("r-4001", "d-1001", "v-3001", 22.5696, 88.4815, 22.5135, 88.4031, (now + timedelta(hours=2)).isoformat(), 2, 150.0, "scheduled"),
            ("r-4002", "d-1002", "v-3002", 22.5801, 88.4593, 22.5510, 88.3533, (now + timedelta(hours=3)).isoformat(), 4, 100.0, "scheduled"),
            ("r-4003", "d-1003", "v-3003", 22.5720, 88.4750, 22.5839, 88.3426, (now - timedelta(minutes=10)).isoformat(), 2, 120.0, "active"),
        ],
    )


def _refresh_demo_schedule(connection: sqlite3.Connection) -> None:
    if not DEMO_MODE:
        return
    now = datetime.now(timezone.utc)
    schedule = (("r-4001", 2), ("r-4002", 3), ("r-4003", 1))
    for ride_id, hours in schedule:
        connection.execute(
            "UPDATE rides SET departure_time = ? WHERE id = ? AND status IN ('scheduled', 'active') AND datetime(departure_time) < datetime('now')",
            ((now + timedelta(hours=hours)).isoformat(), ride_id),
        )


def init_database() -> None:
    connection = get_connection()
    try:
        connection.executescript(SCHEMA)
        _migrate_transactions(connection)
        _ensure_column(connection, "users", "wallet_balance", "REAL NOT NULL DEFAULT 0")
        _ensure_column(connection, "vehicles", "vehicle_type", "TEXT NOT NULL DEFAULT 'Sedan'")
        _ensure_column(connection, "rides", "fare", "REAL NOT NULL DEFAULT 0")
        _ensure_column(connection, "bookings", "request_id", "TEXT")
        _ensure_column(connection, "bookings", "seats", "INTEGER NOT NULL DEFAULT 1")
        _ensure_column(connection, "bookings", "fare", "REAL NOT NULL DEFAULT 0")
        _ensure_column(connection, "bookings", "payment_status", "TEXT NOT NULL DEFAULT 'pending'")
        _ensure_column(connection, "transactions", "user_id", "TEXT")
        _ensure_column(connection, "transactions", "type", "TEXT NOT NULL DEFAULT 'payment'")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at)")
        _seed_demo_data(connection)
        _refresh_demo_schedule(connection)
    finally:
        connection.close()


init_database()
