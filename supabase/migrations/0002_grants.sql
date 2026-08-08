-- Fixes "permission denied for table X" errors.
-- Tables created via the SQL Editor are owned by the `postgres` role and are
-- NOT automatically readable/writable by the `authenticated` role that your
-- signed-in users query as — RLS policies only take effect once this base
-- grant exists. Run this once in the Supabase SQL Editor, after 0001_init.sql.

grant usage on schema public to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;

-- Make sure any tables created in the future also get these grants automatically.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
