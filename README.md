# Smart Calendar

A Notion-style calendar for small teams and couples. The year scrolls month by month, events carry an icon and colored tags grouped into categories, and a calendar can be shared with a few people by a one-time invite link.

## Features

- Sign in with Google only, no passwords.
- Several calendars per user, members with roles (owner, editor, viewer), one-time invite links.
- Year view with weeks that grow with the number of events, drag-and-drop, resize, multi-day events.
- Event dialog with autosave: title, description, dates, time, done mark, icon (emoji, brand logo or image link), tags by category.
- Recurring events with "this event", "this and following" and "all events" scopes, as in Google Calendar.
- Archive instead of hard delete, with undo, restore and permanent delete. Delete by dragging an event to a trash zone.
- Event search by title, description and tag. Export to XLSX.
- Light and dark themes, Russian, English and Spanish.
- Mobile layout: month grid, day view with an hourly scale, swipe navigation.
- Installable as a PWA.

## Stack

| Part     | Technologies                                                                |
| -------- | --------------------------------------------------------------------------- |
| Frontend | Angular (standalone, signals), Angular Material, FullCalendar v7, Transloco |
| Backend  | NestJS, Prisma 7, class-validator, Swagger, google-auth-library             |
| Database | PostgreSQL                                                                  |
| Infra    | Docker Compose, Caddy, external HTTPS reverse proxy, GitHub Actions CI      |

Sessions are stored in the database and sent as an httpOnly cookie. The frontend and the API share one domain, the API lives under `/api`.

## Repository layout

```
apps/
  frontend/   Angular app, Dockerfile and Caddyfile for production
  backend/    NestJS API, Prisma schema and migrations
docs/         architecture, domain rules, API, and deployment guides in English
docker-compose.yaml        Postgres for local development
docker-compose.prod.yaml   production: Postgres, migrations, API, Caddy
```

There are no npm workspaces: each app has its own `package.json` and `node_modules`. The root `package.json` holds only the shared tooling (ESLint, Prettier) and wrapper scripts.

## Getting started

Requirements: Node.js 24, Docker with the compose plugin, and a Google OAuth client ID of type "Web application" with `http://localhost` and `http://localhost:4200` in the authorized JavaScript origins.

```bash
cp .env.example .env            # fill in GOOGLE_CLIENT_ID
npm install                     # shared tooling
npm --prefix apps/backend install
npm --prefix apps/frontend install

npm run db:up                   # Postgres in Docker
cd apps/backend && npx prisma migrate dev && cd ../..

npm run back                    # API on http://localhost:3000
npm run front                   # app on http://localhost:4200
```

The frontend reads the Google client ID from `apps/frontend/src/environments/`. The dev server proxies `/api` to the backend. Swagger UI is available at `http://localhost:3000/api/docs` in development.

## Scripts

From the repository root:

| Command                | What it does                |
| ---------------------- | --------------------------- |
| `npm run front`        | Angular dev server          |
| `npm run back`         | NestJS in watch mode        |
| `npm run db:up`        | start Postgres in Docker    |
| `npm run db:down`      | stop the Docker services    |
| `npm run lint`         | ESLint for both apps        |
| `npm run format`       | Prettier for the whole repo |
| `npm run format:check` | Prettier check, used in CI  |

In `apps/backend`: `npm run prisma:migrate` creates and applies a migration, `npm run prisma:studio` opens the data browser. In `apps/frontend`: `npm run api:gen` regenerates the API models from the running backend's OpenAPI spec.

## Deployment

Production uses `docker-compose.prod.yaml`. Caddy serves the built frontend and proxies `/api` to the backend. An upstream reverse proxy on the external `web` Docker network provides public HTTPS; the bundled Caddy configuration listens on port 80 with automatic HTTPS disabled. Migrations run automatically before the API starts.

```bash
cp .env.example .env            # POSTGRES_*, GOOGLE_CLIENT_ID
docker compose -f docker-compose.prod.yaml up -d --build
```

Configure the external network and HTTPS proxy before starting the production stack. See the [deployment guide](docs/05-deploy.md) for details.

## Documentation

- [Product overview and decisions](docs/00-overview.md)
- [Stack and data flow](docs/01-stack.md)
- [Data model and domain rules](docs/02-data-model.md)
- [Calendar frontend](docs/03-calendar-frontend.md)
- [Backend and authentication](docs/04-backend-auth.md)
- [Deployment](docs/05-deploy.md)
