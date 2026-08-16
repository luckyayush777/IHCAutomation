# Phase 2: What You Need To Do

Phase 2 creates the Supabase database, security policies, initial devices, and public read-only
dashboard access. Staff login is intentionally deferred. Most of the technical work can be
implemented in this repository. The following account and institute decisions require you because
they involve ownership, credentials, or operational policy.

## Before Phase 2 starts

### 1. Create the institute-owned Supabase project

1. Sign in at <https://supabase.com/dashboard> using an account the institute can retain.
2. Create a new organization and project. A suitable project name is `ihc-monitoring-prototype`.
3. Choose the closest available region to the institute.
4. Generate a strong database password and store it in a password manager.
5. Keep the project on the Free plan during the prototype unless its limits become a problem.

Do not expose database credentials or broad table access. Public dashboard reads will be granted
only through narrow Row Level Security policies. Do not send the database password or secret keys
through email or chat.

### 2. Put the project values in your local `.env`

From the Supabase project's API settings, copy these values into the local `.env` file:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
SUPABASE_SECRET_KEY=your-server-only-secret-key
```

The publishable key will be used by the public read-only dashboard. This key is safe to place in a
browser only because Row Level Security will limit what it can do. The service-role or secret key
is server-only and must never be exposed to the dashboard or physical devices.

You do not need to give the secret key to me in chat. Once it is in the ignored `.env` file, I can
use it locally without printing it.

### 3. Confirm the public prototype boundary

The first prototype will use this access model:

- no login is required to open the dashboard;
- anyone with the dashboard URL can view device names, readings, status, and alert history;
- public browser clients cannot insert, update, or delete database records;
- configuration changes remain server-side during the prototype;
- patient, clinical, recipient, and other personal data must not be stored in this system.

Authentication and staff roles can be added later without changing the sensor ingestion design.

### 4. Get four operating decisions in writing

Ask the health-centre owner or responsible staff member to confirm:

| Decision                        | Proposed prototype value    |
| ------------------------------- | --------------------------- |
| Fridge safe range               | 2.0 to 5.0 degrees Celsius  |
| Excursion delay before alert    | 10 minutes                  |
| Device considered offline after | 5 minutes without a reading |
| Data retention for the pilot    | 90 days                     |

These are software defaults for testing, not medical or regulatory advice. The responsible person
must approve or replace them before the monitored readings are used operationally.

### 5. Confirm the six monitored locations

Supply readable names for:

- Fridge 1;
- Fridge 2;
- Room 1;
- Room 2;
- Room 3;
- Room 4.

Examples are `Vaccine Refrigerator`, `Medicine Refrigerator`, `Consultation Room`, and
`Dispensary`. These names become the seeded device records shown to staff.

## What I will implement in Phase 2

Once the project exists and the local `.env` values are present, the repository work is:

- [x] Supabase CLI configuration and repeatable SQL migrations;
- [x] `devices`, `readings`, `alert_rules`, and `alerts` tables;
- [x] data types, foreign keys, checks, uniqueness constraints, and query indexes;
- [x] two refrigerator devices and four room devices in development seed data;
- [x] Row Level Security on every exposed table;
- [x] anonymous read-only policies for dashboard access, with anonymous writes blocked;
- [x] apply the migration and seed data to the hosted Supabase project;
- [x] verify live anonymous reads and blocked browser-side writes against the hosted project;
- [x] no login or account-management screens in the prototype;
- [x] database tests proving anonymous clients can read approved dashboard data but cannot insert,
      update, or delete records;
- [x] reset and setup instructions so the database can be recreated from scratch.

## Phase 2 completion check

Phase 2 is complete when a clean migration creates the whole schema, the six devices appear after
seeding, an anonymous browser can read approved dashboard data, and that browser cannot create or
modify readings, devices, rules, or alerts.

The next step is Phase 3: the simulator sends deterministic normal and abnormal readings to the API,
and the API validates and stores them in Supabase.
