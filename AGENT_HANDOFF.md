# Agent Handoff: IHC Automation

Last updated: 16 August 2026

## Read This First

This repository is an IoT environmental-monitoring project for an institute health centre. The
software prototype monitors two medicine refrigerators and four rooms, stores telemetry in
Supabase, displays it on a responsive dashboard, and will later generate local and remote alerts.

Phase 1 and Phase 2 are complete. The hosted Supabase project has the initial monitoring schema,
seed devices, refrigerator alert rules, and public read-only RLS boundary applied and verified.

Do not reintroduce dashboard login in the prototype. The user explicitly removed that requirement.
The dashboard must be publicly readable without an account, while all browser-side writes remain
blocked.

## Confirmed Scope

- Operational target, not only a classroom demonstration.
- Sensor pilot target: 4 to 6 weeks.
- Two monitored refrigerators.
- Four monitored rooms for temperature, humidity, and fire-related signals.
- Refrigerator operating range: 2.0 to 5.0 degrees Celsius.
- Out-of-range persistence before an alert: 10 minutes.
- Device offline timeout: 5 minutes without a reading.
- Prototype detailed-reading retention: 90 days.
- Primary users: health-centre staff on a PC and professors on phones.
- Alert channels eventually include email, SMS, WhatsApp, and local buzzers.
- Alert acknowledgement is deferred.
- Maintenance is expected to be staff-owned after handover.

## Device Seed Names

Use these exact stable names/slugs unless the user changes them:

| Device slug          | Type                     |
| -------------------- | ------------------------ |
| `fridge_male_ward`   | Refrigerator monitor     |
| `fridge_female_ward` | Refrigerator monitor     |
| `doctors_room`       | Room environment monitor |
| `monitoring_room`    | Room environment monitor |
| `male_ward`          | Room environment monitor |
| `female_ward`        | Room environment monitor |

Human-readable labels can be title-cased from these slugs, but keep the slugs stable for simulator
configuration and API tests.

## Access Model

The prototype dashboard is public and requires no login.

- Anonymous clients may select the approved dashboard data: device identity/status, readings,
  configured ranges, and alert history.
- Anonymous clients must not insert, update, or delete any row.
- The public dashboard must not contain configuration or device-management controls.
- Device ingestion goes through the backend API and uses server-only credentials.
- Database administration and rule changes remain server-side or migration-driven.
- Supabase Row Level Security must be enabled on every exposed table.
- Authentication and staff roles may be added later, but are not part of Phase 2.
- Never store patient, medicine-recipient, clinical, or other personal data in this system.

## Supabase State

A hosted Supabase project has been created. The ignored root `.env` contains the required values.
Never print, commit, move into documentation, or send their values through chat.

Known configured variable names:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_JWKS_URL
SUPABASE_DB_PASSWORD
```

Connection and Phase 2 verification checks completed successfully:

- Project and Auth API are reachable.
- The publishable key is accepted and can anonymously read the approved monitoring tables.
- The hosted project has 6 seeded devices and 2 refrigerator alert rules.
- `devices`, `readings`, `alert_rules`, and `alerts` all have RLS enabled.
- Anonymous `select` returns HTTP 200 on all four exposed tables.
- Anonymous `insert`, `update`, and `delete` are blocked on all four exposed tables.
- The secret key is accepted when called with a server User-Agent.
- A temporary server-side secret-key insert/delete probe succeeded and cleaned itself up.
- The database password is present locally.

Important testing detail: Supabase intentionally returns HTTP 401 when an `sb_secret_...` key is
used with a browser-like User-Agent. Windows PowerShell's `Invoke-WebRequest` triggers that guard.
Use the Node backend, or set a clearly server-side User-Agent when performing a command-line secret
key connectivity test. A 401 from the default PowerShell User-Agent does not by itself mean the
secret is invalid.

The original template used the legacy-looking variable `SUPABASE_SERVICE_ROLE_KEY`. New code should
standardize on `SUPABASE_SECRET_KEY` and use the current `sb_secret_...` value only in the API.

Supabase CLI is installed as a project dev dependency:

```powershell
npx.cmd supabase --version
# 2.114.0
```

Use `npx.cmd`, not `npx`, in this PowerShell installation because script execution policy blocks
the `npx.ps1` shim.

The CLI may need permission to write `C:\Users\user\.supabase` for telemetry/settings. Direct
hosted database commands were run by constructing a Postgres URL in memory from `SUPABASE_URL` and
`SUPABASE_DB_PASSWORD`; do not print that URL because it contains the password.

## Current Architecture

This is an npm workspace using TypeScript throughout:

```text
apps/dashboard     React + Vite public dashboard
apps/api           Express ingestion and alert-processing API
packages/shared    Shared TypeScript contracts
simulator          Node TypeScript sensor simulator
supabase            Migrations and development seed data
docs                Phase checklists
plans               Project and hardware planning documents (currently uncommitted move)
```

Local services:

| Service          | URL                            |
| ---------------- | ------------------------------ |
| Dashboard        | `http://127.0.0.1:5173`        |
| API health       | `http://localhost:4000/health` |
| Simulator health | `http://localhost:4100/health` |

The simulator only exposes its health endpoint today. Telemetry generation belongs to Phase 3.

## Phase 1 Verification

Phase 1 includes:

- npm workspace and shared TypeScript configuration;
- responsive React foundation screen;
- Express API health endpoint;
- simulator health endpoint;
- ESLint and Prettier;
- unit/integration tests for all packages;
- production builds and environment handling.

The last full verification after Phase 2 passed formatting, lint, type checking, tests, and all
production builds:

```powershell
npm.cmd run check
```

Use `npm.cmd`, not `npm`, in this PowerShell installation because script execution policy blocks
the `npm.ps1` shim.

Start all local services with:

```powershell
npm.cmd run dev
```

No development server was listening on ports 5173, 4000, or 4100 when this handoff was written.

## Repository And Git State

- GitHub remote: `https://github.com/luckyayush777/IHCAutomation.git`
- Branch: `main`, tracking `origin/main`.
- Latest observed commit: `24c6f3b Update project documentation to reflect public read-only access in Phase 2`.
- GitHub CLI is authenticated as `luckyayush777`.
- Portable GitHub CLI location:
  `C:\Users\user\AppData\Local\Programs\GitHubCLI\2.97.0\bin\gh.exe`.
- Stale global Git `http.proxy` and `https.proxy` values were removed. Do not restore the old
  `172.31.2.4:8080` proxy.

The worktree was already dirty before this handoff file was added:

```text
D  .env.example
D  HARDWARE_AND_BUDGET.md
D  PROJECT_PLAN.md
?? plans/
```

The planning documents now exist at `plans/PROJECT_PLAN.md` and
`plans/HARDWARE_AND_BUDGET.md`. Treat this as user work and do not move or revert it without an
explicit request. README links now point to the `plans/` paths. The root `.env.example` is still
deleted and was not found under `plans/`; determine whether that deletion was intentional before
committing.

Additional Phase 2 changes currently in the worktree:

- `supabase/config.toml` added with project and seed configuration.
- `supabase/migrations/20260816093000_initial_monitoring_schema.sql` added.
- `supabase/seed.sql` now idempotently seeds six devices and two refrigerator rules.
- `packages/shared/src/schema.test.ts` added for schema/RLS structure checks.
- `supabase` package dev dependency added in `package.json` / `package-lock.json`.
- `README.md`, `docs/PHASE_2_CHECKLIST.md`, and `plans/PROJECT_PLAN.md` updated for Phase 2.

## Phase 2 Completion Notes

Migration applied to the hosted Supabase project:

```powershell
npx.cmd supabase db push --db-url <constructed-in-memory-url> --include-all --yes
```

Seed applied and verified using the checked-in `supabase/seed.sql`. The seed file was rewritten as
one SQL statement because `npx.cmd supabase db query --file supabase\seed.sql` rejected multiple
commands in one prepared statement.

Final hosted counts:

| Table                      | Count |
| -------------------------- | ----: |
| `devices`                  |     6 |
| `alert_rules`              |     2 |
| `readings`                 |     0 |
| `alerts`                   |     0 |
| RLS-enabled exposed tables |     4 |

Anonymous REST verification:

- `select` on `devices`, `readings`, `alert_rules`, and `alerts`: HTTP 200.
- `insert`, `update`, and `delete` on all four tables: HTTP 401.

Server REST verification:

- `SUPABASE_SECRET_KEY` insert into `devices`: HTTP 201.
- Cleanup delete for the temporary probe row: HTTP 204.

## Phase 3 Starting Point

Begin ingestion API and simulator work. Do not request staff emails or login requirements yet.

Recommended order:

1. Add shared telemetry contracts for `deviceCode`, metric readings, accepted units, timestamps, and
   API responses.
2. Implement `POST /api/v1/readings` in `apps/api` using `SUPABASE_SECRET_KEY` only on the server.
3. Authenticate simulator/device requests with `SIMULATOR_DEVICE_KEY` or a server-side device-token
   mechanism; never put database keys in simulator payloads or firmware.
4. Validate device code, metric, unit, numeric range, quality, and timestamp freshness.
5. Insert valid readings into Supabase and update `devices.last_seen_at` / `devices.status`.
6. Add API tests for valid readings, unknown devices, invalid metric/unit pairs, impossible values,
   stale timestamps, future timestamps, missing auth, and no credential logging.
7. Extend the simulator beyond `/health` so it emits deterministic normal readings for all six
   seeded device slugs.
8. Keep alert evaluation mostly deferred to Phase 5, but preserve the schema/API shape needed for
   rule evaluation.

## Safety Boundary

The custom IoT room monitoring is not a certified fire-alarm replacement. The health centre has no
existing fire system, so detector selection, placement, local sounders, mains wiring, testing, and
certification require a qualified fire-safety vendor. The final local alarm must operate without
Wi-Fi, Supabase, the dashboard, or custom ESP32 code. Hobby MQ-series smoke modules are acceptable
only for workbench simulation and must not be represented as operational fire protection.

For hardware work, avoid direct 230 V mains wiring. Use certified low-voltage adapters and involve a
qualified technician for fixed wiring, installation, and calibration approval.

## Reference Documents

- `plans/PROJECT_PLAN.md`: detailed architecture, schema outline, phases, acceptance criteria, and
  safety requirements.
- `plans/HARDWARE_AND_BUDGET.md`: beginner hardware guide and provisional budget.
- `docs/PHASE_2_CHECKLIST.md`: Supabase setup and public read-only Phase 2 boundary.
- `README.md`: package layout, commands, and local development instructions.
