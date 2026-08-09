# Architecture Notes

## Request path

```text
Next.js client -> FastAPI API -> tenant middleware -> relational database
                                      |
                                      +-> OSRM / OpenStreetMap
                                      +-> Haversine fallback
```

The browser never decides seat availability or role permissions. It only submits a request; the API owns validation, tenant scoping, and the atomic seat decrement.

## Matching score

For each available ride in the caller's company, the API computes:

`extra route time = (driver → pickup → passenger destination → driver destination) - (driver → driver destination)`

Results are sorted by extra route time. The passenger's fare pitch is then submitted separately, which keeps route efficiency and price negotiation independently understandable.

## Relational boundaries

`users` owns `vehicles`; `vehicles` is referenced by `rides`; `ride_requests` records negotiation intent; `bookings` is created only after driver approval; `transactions` records wallet top-ups and booking payments. Optional recurring schedules are represented by `recurring_ride_rules` in PostgreSQL.
