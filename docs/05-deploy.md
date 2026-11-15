# Deployment

The production stack is defined in
[`docker-compose.prod.yaml`](../docker-compose.prod.yaml). It is designed to run
behind an external HTTPS reverse proxy on the Docker network named `web`.

## Topology

| Service                  | Responsibility                                                       |
| ------------------------ | -------------------------------------------------------------------- |
| `smart-calendar-db`      | PostgreSQL with a persistent `db-data` volume and a readiness check. |
| `smart-calendar-migrate` | Runs `prisma migrate deploy` once after the database is healthy.     |
| `smart-calendar-backend` | Nest API on internal port 3000, started after successful migrations. |
| `smart-calendar-web`     | Caddy serving the Angular build and proxying `/api/*` to the API.    |

The web service joins both the application network and the external `web` network.
The Compose file publishes no host ports. The external proxy must reach
`smart-calendar-web:80`, route the public domain to it, and terminate HTTPS.

The bundled [Caddyfile](../apps/frontend/Caddyfile) listens on `:80` and sets
`auto_https off`. It does not request certificates. PostgreSQL and the API are
reachable only through the internal application network.

## Prerequisites

- A Linux host with Docker and the Compose plugin.
- An existing external Docker network named `web` and a reverse proxy attached to it.
- A domain with DNS records pointing to the public proxy and valid TLS configuration.
- A Google OAuth web client whose authorized JavaScript origins include the
  application's public HTTPS origin. Use the same client ID in frontend and backend configuration.
- Root environment values populated from `.env.example`. Keep real values local.

The frontend client ID is configured in `apps/frontend/src/environments/` and is
part of the build. The backend receives `GOOGLE_CLIENT_ID` through Compose.
Database credentials are interpolated into `DATABASE_URL`; with the current
unescaped interpolation, avoid reserved URL characters such as `@`, `:`, `/`, `?`,
and `#` in credentials.

## Start and update

From the repository root, after configuring the environment and external proxy:

```bash
cp .env.example .env
docker compose -f docker-compose.prod.yaml up -d --build
docker compose -f docker-compose.prod.yaml ps
```

Populate the copied environment file before running Compose. The migration service
uses the backend image's build stage; the API uses its runtime stage. Both Docker
builds use the repository root as context. `.dockerignore` excludes dependencies,
build output, environment files, local notes, and personal calendar exports.

For an update, pull the desired revision and run the same `up -d --build` command.
Pending migrations run before the API starts. Open tabs and installed PWAs keep the
previous frontend until their next load, so a release must not break the previous
frontend's API calls; remove or rename fields one release after the frontend stops
using them. Review migrations and back up data
before deployment.

## Database backups

[`scripts/backup-db.sh`](../scripts/backup-db.sh) streams `pg_dump` from the
database container into an encrypted [restic](https://restic.net) repository in
Cloudflare R2, then keeps 7 daily, 4 weekly, and 3 monthly snapshots. restic
does not save a snapshot when `pg_dump` fails. It requires restic 0.17 or newer.

Create an R2 bucket and an R2 API token with Object Read & Write access to that
bucket. On the server, create `~/smart-calendar/backup.env` with mode `600`
from [`backup.env.example`](../backup.env.example). `HEALTHCHECK_URL` is an
optional healthchecks.io ping URL.

```bash
mkdir -p ~/smart-calendar
install -m 600 backup.env.example ~/smart-calendar/backup.env
```

Store the restic password outside the server as well; snapshots cannot be
decrypted without it. Initialize the repository once, run the first backup, and
schedule the script with cron as a user that can run Docker:

```bash
set -a; source ~/smart-calendar/backup.env; set +a
restic init
./scripts/backup-db.sh
restic snapshots
```

```cron
PATH=/usr/local/bin:/usr/bin:/bin
0 3 * * * /path/to/smart-calendar/scripts/backup-db.sh >> $HOME/smart-calendar-backup.log 2>&1
```

Verify restoration into a separate database, not the production one:

```bash
docker compose -f docker-compose.prod.yaml exec -T smart-calendar-db \
  sh -c 'createdb -U "$POSTGRES_USER" restore_check'
restic dump latest smart-calendar.sql | docker compose -f docker-compose.prod.yaml \
  exec -T smart-calendar-db sh -c 'psql -U "$POSTGRES_USER" -d restore_check -q'
```

Drop `restore_check` after inspecting it.

## Security and operating limits

- General API throttling allows 300 requests per minute per IP. Google sign-in
  and invitation acceptance have stricter limits of 10 per minute. Excess traffic
  receives 429. The current counter store is process-local; replicas require a
  shared counter store.
- Nest trusts forwarded headers from loopback and private network addresses;
  Caddy trusts private proxy ranges. Only trusted infrastructure should reach
  these internal networks or supply forwarded client headers.
- Helmet sets API headers. Swagger is disabled when `NODE_ENV` is `production`.
- Caddy limits API request bodies to 1 MB and sets HSTS, frame protection,
  content-type protection, referrer policy, and permissions policy headers.
- Content Security Policy is currently **report-only**. It reports violations
  without blocking them. Verify required resources before switching to enforcement.
- Hashed JavaScript, CSS, and font assets receive long-lived immutable caching.
  Worker scripts and other dynamic responses are excluded from that policy.
- Public HTTPS is required for secure session cookies. Verify sign-in, PWA
  installation, and application updates through the public origin.

The external proxy, certificates, public ingress rules, backup scheduling, and monitoring
are deployment responsibilities outside the bundled application containers.
