# Supabase database

The schema, Row Level Security (RLS) policies, and triggers for FlashForge live
here so they can be reviewed in pull requests. There is only one Supabase
project, and the live site uses it, so a migration runs against production as
soon as it's applied.

## Files

| Path | What it is |
|---|---|
| `migrations/` | SQL changes, applied in filename order |
| `seed-admins.sql` | One-time script that makes the first admins (by Google email) |
| `tests/*.sql` | RLS checks that simulate anonymous and signed-in users; everything is rolled back |

## Migration log

| Migration | Issue | Applied to live DB |
|---|---|---|
| `20261020000000_baseline.sql` | #46 | Already in place (snapshot of the existing schema) |
| `20261020000050_tighten_rls.sql` | #46 | 2026-10-20 |
| `20261020000100_profiles_roles.sql` | #51 | 2026-10-20 |
| `seed-admins.sql` | #51 | 2026-10-20 (castanedag438@gmail.com) |
| `20261020000200_classes.sql` | #53 | 2026-10-20 |
| `20261021000100_class_join_failures.sql` | #54 | 2026-10-21 |
| `20261021000200_replace_set_cards.sql` | #55 | 2026-10-21 |
| `20261021000300_assignments.sql` | #56 | 2026-10-21 |
| `20261022000100_attempts.sql` | #57 | 2026-10-22 |
| `20261023000100_admin_users.sql` | #60 | 2026-10-23 |
| `20261023000200_admin_sets.sql` | #61 | 2026-10-23 |
| `20261023000300_generation_logs.sql` | #62 | 2026-10-23 |
| `20261023000400_generation_limits.sql` | #63 | 2026-10-23 |
| `20261024000100_attempt_modes.sql` | #66 | 2026-10-24 |
| `20261024000200_matching_mode.sql` | #67 | 2026-10-24 |
| `20261024000300_true_false.sql` | #68 | 2026-10-24 |
| `20261024000400_mixed_quiz.sql` | #69 | 2026-10-24 |
| `20261025000100_source_quotes.sql` | #21 | The columns were added by hand while PR #80 was tested; the file records them |
| `20261029000100_clear_edited_quotes.sql` | #21 | 2026-10-29 |

Add a row here whenever you apply a new migration.

## Running SQL with the Supabase CLI

No install, database password, or Docker needed. Log in once (opens a browser):

```bash
npx supabase login
```

Then run a file against the live database. The project ref is the subdomain in
`NEXT_PUBLIC_SUPABASE_URL` (`https://<ref>.supabase.co`):

```bash
npx supabase db query --linked --project-ref <ref> -f supabase/migrations/<file>.sql
```

## Writing a new migration

1. Name it `YYYYMMDDHHMMSS_short_name.sql` so it sorts after the existing ones.
2. Make it safe to re-run where possible (`if not exists`, `drop policy if exists`).
3. New tables get RLS turned on automatically (Supabase's `ensure_rls` event
   trigger), but you still have to add policies and grants, or nobody can read them.
4. Never let users change their own `profiles.role`. Role changes go through
   server routes using the service-role key (`lib/roles.ts`).
5. After applying, run every `tests/*.sql` file and check that every row matches
   its expected value.
6. When writing a check, run `set_config('request.jwt.claims', '{}', true)` before
   acting as `anon`. Otherwise `auth.uid()` is still the last simulated user.
