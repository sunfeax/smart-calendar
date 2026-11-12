# Stack and data flow

Application manifests and lockfiles define dependency versions. Use the installed
versions when consulting framework documentation or changing integration code.

## Frontend

- **Angular:** standalone components with signals for UI state and derived values.
- **RxJS:** HTTP, debounce, cancellation, retries, and ordered mutation streams.
  Use `toSignal`/`toObservable` at the boundary with signals and clean up subscriptions.
- **Angular Material and CDK:** dialogs, forms, overlays, menus, date selection,
  and accessibility primitives.
- **FullCalendar:** imported through `@fullcalendar/angular`, including view,
  interaction, locale, and Monarch theme plugins. `temporal-polyfill` supports it.
- **Transloco:** runtime language switching with matching dictionaries in
  `public/i18n/{ru,en,es}.json`. Configuration lives in
  `core/config/language.config.ts`; `LanguageService` selects the language.
- **Typography and icons:** bundled variable Inter, Material Symbols, emoji, and
  bundled brand SVGs in `public/icons/brands` from gilbarbara/logos (CC0).
- **Styles:** shared tokens in `src/styles/_tokens.scss`; Material and FullCalendar
  variables map to these tokens. Dark mode uses `data-theme="dark"` on the root element.
- **Dates:** `date-fns` for calculations. Persistent application date state uses ISO strings.
- **API models:** generated from backend Swagger/OpenAPI with `npm run api:gen`.
- **PWA:** `@angular/service-worker` in production builds. See the
  [frontend guide](03-calendar-frontend.md#pwa-and-connectivity).

### Data ownership

API services contain HTTP requests and return Observables without storing page
state. Components do not call `HttpClient` directly or construct API URLs.
Page data is loaded through `rxResource` with signal-based parameters. Changing
parameters replaces the request and cancels stale loading. Shared application
state belongs in service signals; local UI state stays in the component.

Mutations handle errors explicitly. Successful responses update the local resource
with `resource.update(...)`. Drag and resize failures call FullCalendar's `revert()`.
After a series change, reloading the visible range is necessary because occurrence
expansion belongs to the server. See [recurrence rules](02-data-model.md#recurrence).

Event autosave uses an ordered queue and computes the delta against the latest
confirmed server state when each request runs. The dialog drains queued finite
requests when closed. UI labels are always translated through dictionaries.

## Backend and database

- **NestJS:** modules, controllers, injectable services, guards, and pipes.
- **Prisma:** generated client, PostgreSQL adapter, and migration-managed schema.
- **PostgreSQL:** relational storage, `timestamptz` timestamps, and transactions.
- **class-validator/class-transformer:** request validation and transformations.
- **Swagger:** API schema and frontend model generation.
- **google-auth-library:** Google ID token verification.
- **cookie-parser:** session cookie handling; session hashes are stored in PostgreSQL.
- **rrule:** recurrence parsing and server-side occurrence expansion. There is no
  FullCalendar recurrence plugin in the frontend.
- **helmet and @nestjs/throttler:** API security headers and request rate limits.
- **@nestjs/config:** root environment configuration.
- **Vitest:** test tooling is configured; there are currently no checked-in automated tests.

The backend is ESM and relative imports use `.js`. The Prisma configuration is
`apps/backend/prisma7.config.ts`; generated files belong in `src/generated/prisma`.
Each application has its own dependencies, with shared lint and format tools at the root.

## Infrastructure

Docker Compose runs PostgreSQL, a one-shot migration container, the API, and the
web server. The web container serves the Angular build and proxies `/api` to Nest.
Production connects it to an external `web` network for an upstream HTTPS proxy.
See [deployment](05-deploy.md) for the current topology and operating requirements.

## Design choices

- FullCalendar supplies calendar rendering instead of a custom event layout engine.
- Database sessions allow server-side revocation without a separate JWT denylist.
- PostgreSQL keeps membership, invitations, events, and tags in one transactional store.
- Bundled icons and external image URLs avoid maintaining an image upload service.
- An application shell cache avoids adding conflict resolution for offline shared edits.
