# CloudShield

A secure, containerized and observable cloud application infrastructure lab.

## Purpose

CloudShield is a learning project exploring cloud infrastructure, cybersecurity,
networking, Linux, containerization, system design, and secure application
development. The application itself is intentionally simple — a password
vault API — so the focus stays on everything *underneath* it: how it's
deployed, secured, rate-limited, logged, and monitored.

The vault must never be used to store real credentials; it only contains
dummy/demo secrets.

## Project status

**v1 — Prototype.** Core auth + vault API, containerized deployment behind
an nginx reverse proxy, security headers, rate limiting, encrypted vault
storage, structured logging, and a Prometheus/Grafana monitoring stack are
working end to end. Known gaps are tracked in
[`THREAT_MODEL.md`](THREAT_MODEL.md) and "Future improvements" below.

## Architecture

```
                 INTERNET
                    │
                    ▼
            ┌───────────────┐
            │     NGINX     │   reverse proxy, security headers,
            │ Reverse Proxy │   rate limiting, static frontend
            │               │   (nginx/nginx.conf, frontend/)
            └───────┬───────┘
                ┌───┴────┐
                ▼        ▼
        ┌──────────┐  ┌───────────────┐
        │ frontend/│  │    FastAPI    │   auth, sessions, vault API
        │ (static) │  │  Application  │   (main.py, routers/, middleware.py)
        └──────────┘  └───────┬───────┘
                              │
                              ▼
                      ┌───────────────┐
                      │  PostgreSQL   │
                      │   Database    │
                      └───────────────┘

     ┌───────────────────────────────┐
     │      Monitoring / Logging     │
     │                                │
     │  Prometheus  ──scrapes──▶ App  │   internal Docker network only,
     │      │                        │   not exposed through nginx
     │      ▼                        │
     │   Grafana                     │
     └───────────────────────────────┘
```

Everything runs through Docker via `docker-compose.yml`.

## Repository layout

```
main.py               FastAPI app, middleware wiring, /health, /metrics
database.py            Postgres connection + query execution helper
security.py            Argon2 password hashing, session token generation
dependencies.py        Session-cookie auth dependency
middleware.py          Request logging + security headers middleware
models/                Pydantic request models (user, vault)
queries/                SQL query strings + schema.sql
routers/                auth.py, vault.py route handlers
frontend/               Static login/register/vault UI (index.html, app.js, styles.css)
nginx/nginx.conf        Reverse proxy: headers, rate limiting, routing, serves frontend/
prometheus/prometheus.yml   Scrape config
grafana/provisioning/   Auto-provisioned Prometheus datasource + CloudShield dashboard
Dockerfile              Non-root container image for the app
docker-compose.yml       postgres, app, nginx, prometheus, grafana
docker-compose.override.yml.example   Opt-in host access to Postgres for local dev (see Option B)
THREAT_MODEL.md          STRIDE-style threat model
TESTING.md               Manual test plan + demo script
```

## Running it

### Option A — full stack (recommended)

Everything (nginx, app, Postgres, Prometheus, Grafana) in Docker:

```
docker compose up -d --build
```

Open **`http://localhost:8080`** for the web UI (register, log in, manage
vault entries, log out). The raw API is reachable through the same nginx
instance; on a fresh Postgres volume, `queries/schema.sql` is applied
automatically on first boot. Prometheus is at `http://localhost:9090` and
Grafana at `http://localhost:3000` (login `admin` / the value of
`GRAFANA_ADMIN_PASSWORD` in `.env`; a Prometheus datasource and a
"CloudShield" overview dashboard are pre-provisioned).

Postgres is **not** published to the host in this mode — `app` reaches it
only over the internal Docker network, which is the point of the exercise
(see the Architecture diagram). See Option B below if you need host access
to the database.

### Option B — local dev (app on the host, DB in Docker)

```
docker compose up -d postgres
```

Postgres isn't published to the host by default (see above), so a
host-side app process can't reach `localhost:5432` yet. Opt back in for
local dev only:

```
cp docker-compose.override.yml.example docker-compose.override.yml
docker compose up -d postgres   # re-create with the port published
```

Then:

```
docker exec -i cloudshield-db psql -U cloudshield -d cloudshield < queries/schema.sql   # first time only
python -m venv .venv && .venv\Scripts\activate   # or source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

In this mode the app is reachable directly at `http://localhost:8000` (no
nginx in front, so no rate limiting/edge headers — expected for local dev).
The static frontend isn't served in this mode either; use `/docs` or curl
to exercise the API.

## Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres container credentials |
| `DB_CONNECTION` | Connection string the app uses when run *outside* Docker |
| `DOCS_URL` | Path for Swagger UI (e.g. `/docs`), or unset to disable it |
| `ENCRYPTION_KEY` | Fernet key used to encrypt vault secrets at rest — generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `GRAFANA_ADMIN_PASSWORD` | Grafana admin login |

Only `DB_CONNECTION`, `DOCS_URL`, and `ENCRYPTION_KEY` are passed into the
`app` container's environment — the Postgres and Grafana admin credentials
stay with the services that actually need them.

`.env` is gitignored — never commit real credentials. Copy `.env.example`
to `.env` and fill in your own values to get started.

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | Liveness check (used by the Docker healthcheck) |
| POST | `/auth/register` | none | Create a user |
| POST | `/auth/login` | none | Log in, sets an httponly session cookie |
| GET | `/auth/me` | session cookie | Return the current user's id and email |
| POST | `/auth/logout` | session cookie | Invalidate the current session |
| POST | `/vault` | session cookie | Create a vault entry |
| GET | `/vault` | session cookie | List the current user's vault entries |
| GET | `/vault/{id}` | session cookie | Read one vault entry |

## Security controls implemented

- Argon2id password hashing
- Server-side sessions with random, expiring tokens in httponly cookies;
  expired sessions are swept on every login
- Vault secrets encrypted at rest (Fernet/AES) with a key that lives only
  in process environment — never in Git, the database, or the frontend
- Parameterized SQL everywhere (no string-built queries)
- Security headers and rate limiting at the nginx edge
- Structured request + auth-event logging
- Non-root application container
- `/metrics` reachable only on the internal Docker network, never through nginx
- Postgres reachable only from the app over the internal Docker network,
  never published to the host

The vault UI includes a **Security** panel (below the credential list)
that demonstrates several of these live against the real API: the raw
response headers, nginx's 429s under a burst of login attempts, and a 404
when asking for a vault entry that belongs to nobody.

Full breakdown, known gaps, and what's still missing: [`THREAT_MODEL.md`](THREAT_MODEL.md).

## Future improvements

- TLS termination + flip the session cookie's `secure` flag to `True`
- CI/CD pipeline
- Infrastructure as code (e.g. Terraform) for a real cloud deployment
- Automated dependency/container vulnerability scanning
- Least-privilege, per-table Postgres roles for the app
- Centralized log aggregation (e.g. Loki) instead of container stdout
- Horizontal scaling and load balancing
- Container orchestration (e.g. Kubernetes) beyond single-host Docker Compose

## Testing

See [`TESTING.md`](TESTING.md) for a full walkthrough of exercising the
running stack.
