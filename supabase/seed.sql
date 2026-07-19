-- =============================================================================
-- IIC Events Platform — Seed Data
-- Run AFTER all migrations to bootstrap the system
-- =============================================================================

-- =============================================================================
-- =============================================================================
-- STEP 1: Admin User Creation (MANUAL INSTRUCTIONS)
-- Raw inserts into auth.users are no longer recommended due to Supabase schema updates.
--
-- DO THIS INSTEAD:
-- 1. Go to Supabase Dashboard -> Authentication -> Users -> Add User
-- 2. Email: admin@iicinnovations.ac.in | Password: admin@1234
-- 3. Check "Auto Confirm User" and click Create.
-- 4. The trigger will auto-create their public.profiles row.
-- 5. Run this query to make them an admin:
--    UPDATE public.profiles SET role = 'SUPER_ADMIN' WHERE email = 'admin@iicinnovations.ac.in';
-- =============================================================================


