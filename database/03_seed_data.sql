-- Demo seed data for a TCS Kolkata and Cognizant Kolkata tenant.
INSERT INTO users (id, email, full_name, company_id, role, wallet_balance) VALUES
('d0000000-0000-0000-0000-000000000001', 'arup.roy@tcs.com', 'Arup Roy', 'TCS_KOL', 'admin', 1500),
('d0000000-0000-0000-0000-000000000002', 'sneha.das@cognizant.com', 'Sneha Das', 'COG_KOL', 'employee', 200),
('d0000000-0000-0000-0000-000000000003', 'raj.mukherjee@tcs.com', 'Raj Mukherjee', 'TCS_KOL', 'employee', 500),
('p0000000-0000-0000-0000-000000000001', 'vikram.sen@tcs.com', 'Vikram Sen', 'TCS_KOL', 'employee', 3000),
('p0000000-0000-0000-0000-000000000002', 'priya.bose@cognizant.com', 'Priya Bose', 'COG_KOL', 'employee', 800)
ON CONFLICT (id) DO NOTHING;

INSERT INTO vehicles (id, owner_id, license_plate, capacity, color, vehicle_type) VALUES
('v0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'WB02AB1234', 3, 'Obsidian Black', 'Sedan'),
('v0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'WB06CD5678', 12, 'Arctic White', 'Shuttle'),
('v0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'WB26EF9012', 40, 'Graphite Grey', 'Bus')
ON CONFLICT (id) DO NOTHING;

INSERT INTO rides (id, driver_id, vehicle_id, origin, destination, departure_time, available_seats, fare, status) VALUES
('r0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'v0000000-0000-0000-0000-000000000001',
 ST_SetSRID(ST_MakePoint(88.4815, 22.5696), 4326), ST_SetSRID(ST_MakePoint(88.4031, 22.5135), 4326), now() + interval '2 hours', 2, 150, 'scheduled'),
('r0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'v0000000-0000-0000-0000-000000000002',
 ST_SetSRID(ST_MakePoint(88.4593, 22.5801), 4326), ST_SetSRID(ST_MakePoint(88.3533, 22.5510), 4326), now() + interval '3 hours', 4, 100, 'scheduled'),
('r0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'v0000000-0000-0000-0000-000000000003',
 ST_SetSRID(ST_MakePoint(88.4750, 22.5720), 4326), ST_SetSRID(ST_MakePoint(88.3426, 22.5839), 4326), now() + interval '1 hour', 2, 120, 'active')
ON CONFLICT (id) DO NOTHING;
