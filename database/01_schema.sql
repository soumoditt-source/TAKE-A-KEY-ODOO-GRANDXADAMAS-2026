-- Take-A-Key production schema for PostgreSQL + PostGIS.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL CHECK (length(trim(full_name)) >= 2),
    company_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
    wallet_balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_plate TEXT UNIQUE NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 60),
    color TEXT NOT NULL DEFAULT 'Graphite Grey',
    vehicle_type TEXT NOT NULL DEFAULT 'Sedan' CHECK (vehicle_type IN ('Sedan', 'Pool', 'Shuttle', 'Bus')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    origin GEOGRAPHY(Point, 4326) NOT NULL,
    destination GEOGRAPHY(Point, 4326) NOT NULL,
    departure_time TIMESTAMPTZ NOT NULL,
    available_seats INTEGER NOT NULL CHECK (available_seats >= 0),
    fare NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (fare >= 0),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recurring_ride_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    origin GEOGRAPHY(Point, 4326) NOT NULL,
    destination GEOGRAPHY(Point, 4326) NOT NULL,
    departure_time TIME NOT NULL,
    weekdays SMALLINT[] NOT NULL CHECK (cardinality(weekdays) BETWEEN 1 AND 7),
    available_seats INTEGER NOT NULL CHECK (available_seats > 0),
    fare NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (fare >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bid_fare NUMERIC(10, 2) NOT NULL CHECK (bid_fare >= 0),
    seats_requested INTEGER NOT NULL DEFAULT 1 CHECK (seats_requested > 0),
    pickup GEOGRAPHY(Point, 4326) NOT NULL,
    dropoff GEOGRAPHY(Point, 4326) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ride_id, passenger_id, status)
);

CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID UNIQUE REFERENCES ride_requests(id) ON DELETE SET NULL,
    seats INTEGER NOT NULL DEFAULT 1 CHECK (seats > 0),
    fare NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (fare >= 0),
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ride_id, passenger_id, status)
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    type TEXT NOT NULL CHECK (type IN ('payment', 'top_up', 'refund')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS idx_rides_origin_gix ON rides USING GIST(origin);
CREATE INDEX IF NOT EXISTS idx_rides_destination_gix ON rides USING GIST(destination);
CREATE INDEX IF NOT EXISTS idx_rides_search ON rides(status, departure_time, available_seats);
CREATE INDEX IF NOT EXISTS idx_requests_ride_status ON ride_requests(ride_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger ON bookings(passenger_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
