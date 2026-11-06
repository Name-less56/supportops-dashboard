# Architecture

## Runtime

```text
Browser UI
   │ same-origin JSON API
   ▼
Express + Helmet ── authentication / RBAC / validation
   │ parameterized SQL
   ▼
PostgreSQL ── users / sessions / tickets / analytics / governance
```

The browser never receives password hashes, session tokens stored by the server, or unrestricted database access. Agent scope is applied in SQL queries and cannot be expanded by changing client-side controls.

## Main modules

- `server.mjs`: API, authentication, authorization, seed data and static delivery.
- `schema.sql`: idempotent PostgreSQL schema and indexes.
- `index.html` + `app.mjs`: operational dashboard and ticket queue.
- `suite.html` + `suite.mjs`: professional workflow, reporting and simulated Jira capability.
- `admin.html` + `admin.mjs`: users, taxonomy, groups and governance.
- `professional.css`, `fullstack.css`, `suite.css`: responsive neumorphic design system.

## Access model

| Role | Ticket scope | Administration |
| --- | --- | --- |
| Administrator | All groups | Users, taxonomy, groups and governance |
| Supervisor | All groups | None |
| Agent | Assigned support group | None |

## External services

The demo does not call external services. Jira is represented as a capability preview only. A production implementation would use OAuth, encrypted secrets, signed webhooks, retry handling and an audit trail.

