# IHC Automation

Environmental and medicine-fridge monitoring for the institute health centre. The first software
milestone provides three independently runnable TypeScript applications and a shared health
contract. Supabase storage and public read-only access are introduced in Phase 2. The dashboard
remains public in the prototype; browser clients can read approved monitoring data but cannot write
to the database.

## Phase 1 services

| Service   | Package          | Local address                  | Purpose in Phase 1                         |
| --------- | ---------------- | ------------------------------ | ------------------------------------------ |
| Dashboard | `@ihc/dashboard` | <http://localhost:5173>        | Shows local service readiness              |
| API       | `@ihc/api`       | <http://localhost:4000/health> | Exposes the ingestion service health check |
| Simulator | `@ihc/simulator` | <http://localhost:4100/health> | Exposes simulator process health           |

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

Open <http://localhost:5173>. When all three processes are running, the dashboard changes both
service indicators to `online` automatically.

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
npm.cmd test
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

## Repository map

```text
IHCAutomation/
|-- apps/
|   |-- api/                 Express service
|   `-- dashboard/           React and Vite interface
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
