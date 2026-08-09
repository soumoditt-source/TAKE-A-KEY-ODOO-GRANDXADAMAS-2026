-- Supabase RLS policies. The API service role may bypass these policies.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_ride_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION current_company_id() RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT company_id FROM users WHERE id = auth.uid() $$;

CREATE POLICY users_same_company ON users FOR SELECT
USING (company_id = current_company_id());
CREATE POLICY users_update_self ON users FOR UPDATE
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY vehicles_same_company ON vehicles FOR SELECT
USING (owner_id IN (SELECT id FROM users WHERE company_id = current_company_id()));
CREATE POLICY vehicles_manage_self ON vehicles FOR ALL
USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY rides_same_company ON rides FOR SELECT
USING (driver_id IN (SELECT id FROM users WHERE company_id = current_company_id()));
CREATE POLICY rides_manage_self ON rides FOR ALL
USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());

CREATE POLICY recurring_rules_self ON recurring_ride_rules FOR ALL
USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY requests_involved ON ride_requests FOR SELECT
USING (
    passenger_id = auth.uid()
    OR ride_id IN (SELECT id FROM rides WHERE driver_id = auth.uid())
);
CREATE POLICY requests_insert_self ON ride_requests FOR INSERT
WITH CHECK (passenger_id = auth.uid());
CREATE POLICY requests_driver_update ON ride_requests FOR UPDATE
USING (ride_id IN (SELECT id FROM rides WHERE driver_id = auth.uid()));

CREATE POLICY bookings_involved ON bookings FOR SELECT
USING (
    passenger_id = auth.uid()
    OR ride_id IN (SELECT id FROM rides WHERE driver_id = auth.uid())
);
CREATE POLICY bookings_insert_self ON bookings FOR INSERT
WITH CHECK (passenger_id = auth.uid());

CREATE POLICY transactions_self ON transactions FOR SELECT
USING (user_id = auth.uid());
