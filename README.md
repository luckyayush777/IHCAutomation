# IHC Automation

Environmental and medicine-fridge monitoring for the institute health centre. The system collects
sensor readings through the API, stores them in Supabase Postgres, and displays public read-only
status on a lightweight dashboard built with plain HTML, CSS, JavaScript, and Chart.js.

## Local services

| Service   | Package          | Local address                  | Purpose                               |
| --------- | ---------------- | ------------------------------ | ------------------------------------- |
| Dashboard | `@ihc/dashboard` | <http://localhost:5173>        | Public read-only monitoring dashboard |
| API       | `@ihc/api`       | <http://localhost:4000/health> | Ingestion and dashboard data API      |
| Simulator | `@ihc/simulator` | <http://localhost:4100/health> | Simulated sensor process              |

The simulator does not generate sensor readings yet. That begins after the Phase 2 database is
ready, so Phase 3 can send readings through the ingestion API.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer

This computer currently has Node.js 24 and npm 11. On Windows PowerShell, use `npm.cmd` if the
local execution policy blocks `npm.ps1`.

## Start locally

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

Open <http://localhost:5173>. The dashboard polls the API and shows device status, recent readings,
active alerts, and Chart.js trends.

Run a single application when needed:

```powershell
npm.cmd run dev:dashboard
npm.cmd run dev:api
npm.cmd run dev:simulator
```

## Quality checks

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Run every check in sequence with `npm.cmd run check`.

## Environment variables

Create a local `.env` for machine-specific values. The `.env` file and all other environment files
are ignored by Git. Never place the Supabase secret key in dashboard source code, device firmware, a
commit, screenshot, or chat message.

Known Supabase variables for Phase 2 are:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
SUPABASE_SECRET_KEY=your-server-only-secret-key
SUPABASE_JWKS_URL=https://your-project-ref.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_DB_PASSWORD=your-database-password
```

The publishable key is safe for the public dashboard only because Row Level Security grants
anonymous clients read-only access. `SUPABASE_SECRET_KEY` is server-only.

## Supabase setup

The phase 2 schema lives in `supabase/migrations/20260816093000_initial_monitoring_schema.sql`.
Development seed data lives in `supabase/seed.sql`.

With the Supabase CLI installed and linked to the hosted project, apply the schema and seeds with:

```powershell
npx.cmd supabase db push --include-seed
```

## Reading ingestion

The Phase 3 ingestion endpoint accepts simulator or device readings through the API only:

```http
POST /api/v1/readings
Authorization: Bearer <SIMULATOR_DEVICE_KEY>
Content-Type: application/json
```

Example payload:

```json
{
  "contractVersion": 1,
  "deviceCode": "fridge_male_ward",
  "readings": [
    {
      "metric": "temperature",
      "value": 4.2,
      "unit": "celsius",
      "quality": "good",
      "recordedAt": "2026-08-16T10:30:00.000Z"
    }
  ]
}
```

The API uses `SUPABASE_SECRET_KEY` server-side to store valid readings and update device heartbeat
state. The simulator uses `SIMULATOR_DEVICE_KEY`; it never needs Supabase database keys.

Simulator scenarios are controlled with:

```dotenv
SIMULATOR_SCENARIO=normal
SIMULATOR_RETRY_ATTEMPTS=1
```

Available scenarios are `normal`, `high_fridge`, `low_fridge`, `door_excursion`, `high_humidity`,
`smoke_signal`, `invalid_sensor`, and `offline_device`.

## Dashboard data

The browser reads from the API only:

```http
GET /api/v1/dashboard
```

The endpoint returns devices, recent readings, enabled alert rules, and recent alerts as one compact
snapshot. The public dashboard contains no write, acknowledgement, configuration, or login controls.

## Repository map

```text
IHCAutomation/
|-- apps/
|   |-- api/                 Express service
|   `-- dashboard/           Plain HTML/CSS/JS and Chart.js interface
|-- docs/                    Implementation checklists
|-- packages/
|   `-- shared/              Cross-service TypeScript contracts
|-- simulator/               Simulated sensor process
|-- supabase/
|   |-- migrations/          Phase 2 database migrations
|   `-- seed.sql             Phase 2 development devices and rules
|-- plans/
|   |-- HARDWARE_AND_BUDGET.md
|   `-- PROJECT_PLAN.md
`-- README.md
```

## Project documents

- [Full project plan](plans/PROJECT_PLAN.md)
- [Hardware and budget guide](plans/HARDWARE_AND_BUDGET.md)
- [Phase 2 checklist](docs/PHASE_2_CHECKLIST.md)
