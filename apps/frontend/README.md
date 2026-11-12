# Frontend

Smart Calendar web app: Angular 22 (standalone, signals, RxJS for HTTP) + Angular Material + FullCalendar v7.

In development, `ng serve` proxies `/api` to the backend on port 3000 (`proxy.conf.json`). The Google Client ID lives in `src/environments/`.

Translations live in `public/i18n/{ru,en,es}.json` (Transloco), design tokens in `src/styles/_tokens.scss`.

See the [frontend guide](../../docs/03-calendar-frontend.md) for calendar design and the root [project instructions](../../CLAUDE.md) for development conventions.

## Setup

```bash
npm install
```

## Run

```bash
npm start            # ng serve, http://localhost:4200
npm run build        # production build to dist/
npm run watch        # development build in watch mode
```

From the repository root, `npm run front` is the same as `npm start`.

## Test

There are no automated tests yet. Vitest is configured for when they are added.

## Lint and format

ESLint and Prettier are configured once in the repository root:

```bash
npm run lint                 # this app only
npm run lint --prefix ../..  # both apps
npm run format --prefix ../..
```

## Scaffolding

```bash
npx ng generate component path/name
npx ng generate --help
```
