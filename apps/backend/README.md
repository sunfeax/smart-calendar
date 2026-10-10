# Backend

Smart Calendar API: NestJS (ESM) + Vitest. Prisma and PostgreSQL are planned, not connected yet.

See the root `CLAUDE.md` and `docs/05-backend-auth.md` for the API design and project rules.

## Setup

```bash
npm install
```

## Run

```bash
npm run start:dev    # watch mode, http://localhost:3000 (override with PORT)
npm run start:debug  # watch mode with the inspector
npm run build        # compile to dist/
npm run start:prod   # run the compiled build
```

From the repository root, `npm run back` is the same as `npm run start:dev`.

## Test

```bash
npm test             # unit tests (src/**/*.spec.ts)
npm run test:e2e     # e2e tests (test/)
npm run test:cov     # coverage
```

## Lint and format

ESLint and Prettier are configured once in the repository root:

```bash
npm run lint                 # this app only
npm run lint --prefix ../..  # both apps
npm run format --prefix ../..
```

## Notes

- The project is ESM (`"type": "module"`): relative imports need the `.js` extension.
- Shared TypeScript strictness flags live in `../../tsconfig.base.json`.
