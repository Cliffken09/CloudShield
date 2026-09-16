# Testing CloudShield

A manual test plan for the running stack, plus a script for demoing it end
to end in under two minutes.

## Prerequisites

- Docker + Docker Compose
- `.env` populated (copy from `.env.example` — see README for how to
  generate `ENCRYPTION_KEY`)

## 1. Start the stack

```
docker compose up -d --build
docker compose ps
```

Everything should report healthy/running: `cloudshield-db`,
`cloudshield-app`, `cloudshield-nginx`, `cloudshield-prometheus`,
`cloudshield-grafana`.

- Web UI: http://localhost:8080
- API docs (Swagger): http://localhost:8080/docs
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (`admin` / `GRAFANA_ADMIN_PASSWORD` from `.env`)

## 2. Manual test checklist

Work through this once after any change to auth, vault, or the edge
config. Each item names what you're actually verifying, not just what to
click.

### Auth

- [ ] **Register** a new account (email + 12+ char password) → account is
      created, you're switched to the Log in tab with the email prefilled.
- [ ] **Register the same email again** → rejected with a generic message
      (doesn't reveal whether the account already existed via a different
      error).
- [ ] **Log in** with the new account → lands on the vault view, top bar
      shows your real email (not the literal string "Logged in").
- [ ] **Log in with a wrong password** → generic "Invalid credentials",
      no hint about whether the email exists.
- [ ] **Refresh the page while logged in** → still logged in, top bar
      still shows your real email. This exercises `GET /auth/me`, which is
      also what fixes the old bug where a reload showed "Logged in"
      literally instead of an address.
- [ ] **Log out** → returned to the login screen; refreshing stays logged
      out.

### Vault

- [ ] **Empty state** on a fresh account: centered lock icon, "Your vault
      is empty" copy, and an "+ Add credential" button — not a bare line
      of text.
- [ ] **Add a credential** via the modal (e.g. label `GitHub`, any
      secret) → modal closes, entry appears in the list, "Save credential"
      briefly shows a spinner and is disabled for the duration of the
      request.
- [ ] **Double-click "Save credential"** on a slow connection (or just
      click twice fast) → only one entry is created. The button disables
      itself on the first click, so the second click is a no-op.
- [ ] **Reveal** a secret → masked dots are replaced with the real value,
      button flips to "Hide", a "Copy" button appears.
- [ ] **Copy** → clipboard contains the secret, button reads "Copied"
      briefly. Wait ~20 seconds and paste somewhere → clipboard has been
      cleared automatically.
- [ ] **Hide** → secret masks again, Copy button disappears.
- [ ] **Log out, log back in** → the credential you added is still there
      (persisted, not just client state).
- [ ] **Request a vault entry that isn't a valid UUID**, e.g. open
      `http://localhost:8080/vault/not-a-uuid` while logged in → `422
      Unprocessable Entity` from FastAPI's own validation, not a raw
      Postgres error or a 500.
- [ ] **Request a vault entry UUID that exists but belongs to another
      user** (or any random UUID) → clean `404 Entry not found`, not a
      500 and not the entry itself.

### Security panel (in the vault view, below the credential list)

- [ ] **Security controls** list renders with checkmarks; open the same
      page over `http://` vs a TLS-terminated deployment and confirm the
      TLS line flips from "⚠ TLS not enabled" to "✓ TLS enabled" —
      nothing to click, it reads `location.protocol` live.
- [ ] **Check headers** → lists the actual response headers this browser
      received (`x-content-type-options`, `x-frame-options`,
      `content-security-policy`, `referrer-policy`, etc.).
- [ ] **Fire 20 login attempts** → button disables while running, then
      shows a tally of `401`s and `429`s. You should see 429s appear
      partway through, once nginx's burst allowance for `/auth/` runs out.
      This does not touch your active session (it deliberately sends the
      wrong password, so no new cookie is ever set) — but it does exhaust
      your own login rate limit for about a minute, so do this after any
      real logout/login checks, not before.
- [ ] **Request a stranger's entry** → generates a random UUID client-side
      and shows the live `404` response.

### Edge / infrastructure

- [ ] `curl -I http://localhost:8080/` → security headers present exactly
      once each (nginx hides the app's own copy so they aren't doubled).
- [ ] `curl http://localhost:8080/metrics` → `404` (Prometheus reaches the
      app directly over the Docker network, not through nginx).
- [ ] `docker compose exec app env | grep -i postgres` → empty. The app
      container only gets `DB_CONNECTION`, `DOCS_URL`, and
      `ENCRYPTION_KEY`, never the raw Postgres or Grafana credentials.
- [ ] `docker compose port postgres 5432` → no output / not published.
      Confirms Postgres isn't reachable from the host in the default
      compose file.
- [ ] Inspect a row in `cloudshield.vault_entries` directly
      (`docker compose exec postgres psql -U cloudshield -d cloudshield -c
      "select label, secret_cipher from cloudshield.vault_entries limit 1;"`)
      → `secret_cipher` is opaque ciphertext, not the plaintext secret.

## 3. The two-minute demo

A walkthrough for showing CloudShield to someone else, in order. Say the
bracketed lines out loud as you go — they're the "why", not just the
"what".

1. **Open CloudShield** (`http://localhost:8080`).
   *"This is a password vault — but the point of the project is
   everything underneath it, not the CRUD."*
2. **Register a demo account.** Any email, a 12+ character password.
3. **Log in.**
   *"Sessions are server-side random tokens in an httponly cookie —
   there's nothing in the JS that can read it, and nothing in the token
   itself to guess."*
4. **Show the empty vault.** Point out it's a real empty state, not a
   blank list.
5. **Add a GitHub demo credential** through the modal.
   *"Notice the Save button disables itself while the request is in
   flight — no double-submits."*
6. **Show it masked**, then **Reveal** it.
   *"It's encrypted at rest — what's sitting in Postgres right now is
   ciphertext, not this."* (Optionally back this up with the `psql` query
   from the checklist above.)
7. **Copy it**, mention the clipboard auto-clears in ~20 seconds.
8. **Log out**, then **log back in** — show the GitHub credential is
   still there. *"Persisted server-side, not localStorage."*
9. **Scroll to the Security panel.**
   *"This is the part that's usually invisible in a demo like this — the
   chassis around the CRUD."*
   - Click **Check headers** — point out CSP, X-Frame-Options, etc. are
     real headers this response actually carried.
   - Click **Request a stranger's entry** — show the clean 404.
     *"The API checks ownership on every vault read — a valid ID that
     isn't yours doesn't leak whether it exists."*
   - Click **Fire 20 login attempts** last — watch the 429s show up.
     *"That's nginx's rate limiter kicking in, live, against the real
     edge — not a mocked response."* This deliberately exhausts your own
     login rate limit for about a minute, so do it after you're done
     logging in and out, not before.
10. **Open Grafana** (`http://localhost:3000`). Show the CloudShield
    dashboard: requests/sec, status code mix, p50/p95/p99 latency — all
    live, fed by the requests you just made.
11. **Show the architecture diagram** in `README.md` and narrate the
    boundaries: nginx is the only thing exposed to the internet; Postgres
    isn't reachable from the host at all, only from the app over the
    internal Docker network; `/metrics` is deliberately never proxied
    through nginx.

## 4. Resetting state

To start over with a clean database (e.g. before a demo):

```
docker compose down -v
docker compose up -d --build
```

`-v` drops the named volumes (`postgres_data`, `prometheus_data`,
`grafana_data`), so `queries/schema.sql` re-runs against a fresh database
on next boot.
