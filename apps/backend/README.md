# Backend

Smart Calendar API: NestJS (ESM) + Prisma 7 + PostgreSQL. Sign-in with Google, sessions stored in the database.

See the root `CLAUDE.md` and `docs/05-backend-auth.md` for the API design and project rules.

## Setup

```bash
npm install
cp ../../.env.example ../../.env   # then set real values
npm run db:up --prefix ../..       # Postgres in Docker
npm run prisma:migrate             # apply migrations, generate the client
```

All environment variables live in the repository root `.env`. Nest and the Prisma CLI run from this folder, so both point to `../../.env` explicitly (`ConfigModule` in `app.module.ts`, `dotenv` in `prisma7.config.ts`).

## Run

```bash
npm run start:dev    # watch mode, http://localhost:3000 (override with PORT)
npm run start:debug  # watch mode with the inspector
npm run build        # compile to dist/
npm run start:prod   # run the compiled build
```

From the repository root, `npm run back` is the same as `npm run start:dev`.

## Database

```bash
npm run prisma:migrate   # create and apply a migration (prisma migrate dev)
npm run prisma:generate  # regenerate the client after a schema change
npm run prisma:studio    # browse data
```

- Config: `prisma7.config.ts` (the default file name in Prisma 7). Schema: `prisma/schema.prisma`.
- The client is generated into `src/generated/prisma`. It is git-ignored, so never put hand-written files there.
- `PrismaService` and `PrismaModule` live in `src/prisma/`.

## Test

There are no automated tests yet. Vitest is configured for when they are added.

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
- All routes are behind the global `AuthGuard`. Mark public routes with `@Public()`.
