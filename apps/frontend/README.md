# Frontend

Smart Calendar web app: Angular 22 (standalone, signals) + Vitest. Angular Material and FullCalendar v7 are planned, not installed yet.

See the root `CLAUDE.md` and `docs/04-calendar-frontend.md` for the calendar design and project rules.

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

```bash
npm test             # unit tests with Vitest
```

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
