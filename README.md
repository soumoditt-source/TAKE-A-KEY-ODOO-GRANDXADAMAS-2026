# Take-A-Key

Take-A-Key is a tenant-aware corporate carpooling platform. Employees can find a route, pitch a per-seat fare, request a seat, and pay from a local wallet. Drivers can publish vehicles and rides, review passenger requests, and approve seats without race-condition overbooking.

## Current stack

- Next.js 16 + TypeScript + Tailwind + Leaflet for the client.
- FastAPI + SQLite for zero-config local development and deterministic tests.
- PostgreSQL + PostGIS schema and RLS scripts in `database/` for a production migration.
- OSRM over OpenStreetMap when online, Haversine routing fallback when offline.
- Local JWT auth with tenant ABAC, role RBAC, expiry, `jti`, and account revalidation.

Firebase is not required. Supabase is an optional later upgrade if you want hosted Postgres/Auth; the current demo intentionally works without any paid service or API key.

## Run locally on Windows

From this directory, double-click `launch.bat`, or run:

```powershell
.\launch.ps1
```

Open `http://localhost:3000`. The API health check is `http://localhost:8000/health`.

The local database is created at `backend/takeakey.db` and is ignored by Git. Demo accounts:

- `arup.roy@tcs.com` — admin / TCS Kolkata
- `vikram.sen@tcs.com` — employee / TCS Kolkata
- `sneha.das@cognizant.com` — employee / Cognizant Kolkata

Use an online connection for road geometry. To run fully offline, set `OSRM_ENABLED=false` in `backend/.env`.

## Core flow

1. Sign in with a seeded work email.
2. Click the map for pickup and destination.
3. Search; matches are ranked by route detour first, then the rider's price pitch is adjustable.
4. Send a seat request.
5. Sign in as the driver, open Requests, and approve it.
6. Return to the passenger account, open My trips, pay from Wallet, and use the local booking QR pass.

Seat acceptance runs in a SQLite `BEGIN IMMEDIATE` transaction and checks the remaining seat count in the same update. PostgreSQL deployment should retain the equivalent row-lock/transaction boundary.

## Vercel and GitHub

Vercel should use this repository with the project Root Directory left at the repo root; `vercel.json` builds the `frontend` workspace. Set `NEXT_PUBLIC_API_URL` to a reachable API URL. Vercel cannot keep the local SQLite/FastAPI process alive, so Vercel-only deployment is frontend-only until the API is moved to a free Python host or Supabase Edge Functions.

GitHub Actions runs `backend/pytest` and `frontend/npm run build` on every push and pull request. The local database and virtualenv are excluded from commits.

## Database and security

- `database/01_schema.sql` is the normalized PostgreSQL/PostGIS model.
- `database/02_rls_policies.sql` adds company-scoped read/write policies.
- `database/03_seed_data.sql` provides the same Kolkata demo tenant shape.
- `backend/middleware/kernel.py` validates JWT signature, expiry, tenant, role, and live account state.
- `backend/tests/test_spatial.py` covers auth, tenant protection, matching, offer, request, approval, and trip persistence.
