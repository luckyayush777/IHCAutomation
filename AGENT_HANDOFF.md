# Agent Handoff: IHC Automation

Last updated: 16 August 2026

## Read This First

This repository is an IoT environmental-monitoring project for an institute health centre. The
software prototype monitors two medicine refrigerators and four rooms, stores telemetry in
Supabase, displays it on a responsive dashboard, and will later generate local and remote alerts.

Phase 1 is complete. The Supabase project and credentials are ready, but Phase 2 database
migrations have not been created or applied.

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

Connection checks completed successfully:

- Project and Auth API are reachable.
- The publishable key is accepted.
- The publishable key reaches PostgREST; querying `devices` currently returns the expected
  table-not-found response because migrations have not run.
- The secret key is accepted when called with a server User-Agent.
- The database password is present locally.

Important testing detail: Supabase intentionally returns HTTP 401 when an `sb_secret_...` key is
used with a browser-like User-Agent. Windows PowerShell's `Invoke-WebRequest` triggers that guard.
Use the Node backend, or set a clearly server-side User-Agent when performing a command-line secret
key connectivity test. A 401 from the default PowerShell User-Agent does not by itself mean the
secret is invalid.

The original template used the legacy-looking variable `SUPABASE_SERVICE_ROLE_KEY`. New code should
standardize on `SUPABASE_SECRET_KEY` and use the current `sb_secret_...` value only in the API.

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

The last full verification passed formatting, lint, type checking, four test files, and all
production builds. Rerun before completing Phase 2:

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
explicit request. The root `.env.example` is deleted and was not found under `plans/`; determine
whether that deletion was intentional before committing. README links still point at the old root
planning-document paths and may need updating after the user confirms the layout.

## Phase 2 Starting Point

The user has completed all currently required Supabase and operational decisions. A new agent can
begin implementation without requesting staff emails or login requirements.

Recommended order:

1. Inspect and preserve the existing dirty worktree, especially the `plans/` move.
2. Standardize environment naming on `SUPABASE_SECRET_KEY` without exposing its value.
3. Add Supabase CLI project configuration and a repeatable initial migration.
4. Create `devices`, `readings`, `alert_rules`, and `alerts` with constraints and indexes defined in
   the project plan.
5. Enable RLS on every exposed table.
6. Grant anonymous `select` only on the fields/tables required by the public dashboard.
7. Explicitly block anonymous inserts, updates, and deletes; server secret access remains available
   to the backend.
8. Seed the two refrigerator and four room devices listed above, plus the confirmed refrigerator
   rule defaults.
9. Add database tests for constraints and RLS, including positive anonymous reads and negative
   anonymous write tests.
10. Verify the migration can recreate the schema from scratch and can be applied to the hosted
    Supabase project.
11. Update the Phase 2 checklist and project-plan status after verification.

Phase 2 is complete only when:

- a clean migration creates the schema;
- all six seeded devices are present;
- public clients can read approved monitoring data without login;
- public clients cannot create or modify devices, readings, rules, or alerts;
- the server can use its secret key for trusted operations;
- no secret appears in Git history or browser code.

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
