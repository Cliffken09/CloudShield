# CloudShield Threat Model

Lightweight threat model for the CloudShield prototype (v1). Scope: the
web application, its reverse proxy, and its database, as deployed by
`docker-compose.yml`. Out of scope: host/physical security, a CI/CD
pipeline (not built yet), and third-party dependency supply chain.

## Assets

- User credentials (email + password hash)
- Session tokens
- Vault secrets (encrypted at rest with a Fernet key from `ENCRYPTION_KEY`)

## Threats and mitigations

| # | Threat (STRIDE) | Scenario | Mitigation | Status |
|---|---|---|---|---|
| 1 | Spoofing | Attacker brute-forces login credentials | Argon2id password hashing + nginx rate limiting on `/auth/login` and `/auth/register` specifically (10 req/min per IP, burst 5) — scoped narrowly so routine calls like `GET /auth/me` don't share the same budget. This slows a scripted brute force against one account from one IP; it does **not** stop credential stuffing, which spreads attempts across many IPs and walks under any per-IP limit by design | Implemented (partial — see caveat) |
| 2 | Spoofing | Session token guessing or theft | 256-bit `secrets.token_urlsafe` session tokens, httponly cookies, 2h server-side expiry, expired sessions swept on every login | Implemented |
| 3 | Tampering | Man-in-the-middle alters traffic | TLS termination at the reverse proxy | Not yet — dev runs over HTTP; see Future Improvements |
| 4 | Information Disclosure | Vault secrets read from a DB dump | Secrets encrypted at rest (Fernet/AES) before being written to Postgres; the key lives only in process environment, never in the database, frontend, or source code | Implemented |
| 5 | Information Disclosure | Verbose error responses leak internals | Generic 400/401/404 messages, no stack traces returned to the client. `GET /vault/{id}` validates `id` as a UUID at the FastAPI layer, so a malformed ID returns a clean 422 instead of an unhandled Postgres exception | Implemented |
| 6 | Information Disclosure | `/metrics` exposes internals to the internet | Prometheus scrapes the app directly over the internal Docker network; nginx does not proxy `/metrics` | Implemented |
| 7 | Denial of Service | Flood of requests exhausts the app | nginx `limit_req` zones on all routes, stricter on `/auth/*` | Implemented |
| 8 | Elevation of Privilege | Container escape / compromised app process | App container runs as a non-root user (`appuser`) | Implemented |
| 9 | Repudiation | No record of who did what | Structured request logging + explicit auth-event logging (register/login/logout) to stdout, captured by the Docker log driver | Implemented |
| 10 | Injection | SQL injection via user input | Every query uses parameterized placeholders (`psycopg`); no string-built SQL | Implemented |

## Known limitations (v1 prototype)

- No TLS; the session cookie's `secure` flag is `False` — must flip to
  `True` once TLS terminates in front of nginx.
- Rate limiting is per-IP and only meaningfully slows single-source brute
  force; it is not a defense against distributed credential stuffing.
- The app connects to Postgres with a single shared role rather than a
  least-privilege, per-table grant.
- No automated dependency or container vulnerability scanning yet.

See `README.md` → "Future improvements" for the plan to close these gaps.
