# Project instructions

Smart Calendar uses Angular and FullCalendar on the frontend, NestJS and Prisma
on the backend, and PostgreSQL. Authentication uses Google sign-in and database
sessions.

## Documentation

Read the relevant document before making a substantial change:

- [Overview](docs/00-overview.md): product scope and architectural decisions.
- [Stack](docs/01-stack.md): technologies and frontend data flow.
- [Data model](docs/02-data-model.md): entities, access, dates, icons, and recurrence.
- [Calendar frontend](docs/03-calendar-frontend.md): FullCalendar, dialogs, mobile UI, and PWA.
- [Backend and authentication](docs/04-backend-auth.md): modules, API, and sessions.
- [Deployment](docs/05-deploy.md): production topology and operation.

If `.project-notes.md` exists locally, read it for collaboration preferences,
planning, and unresolved decisions. It is excluded from Git and Docker contexts.
Explicit user instructions take precedence over local preferences.

## Language and scope

- Write code, names, comments, commit messages, and documentation in English.
- Put UI text in Transloco dictionaries. Update matching keys in
  `apps/frontend/public/i18n/{ru,en,es}.json` together.
- Follow the user's requested scope. Explain new dependencies before adding them.
- Do not commit or push unless explicitly requested. Do not add co-author trailers
  or generated-by signatures to commits or pull requests.
- Verify changes with the appropriate build and checks. Check UI changes in a
  browser in both themes; state any checks that could not be performed.

## Repository and tooling

- Each application has its own `package.json`, lockfile, and `node_modules`.
  The root package contains shared tooling and wrapper scripts; there are no workspaces.
- Keep shared ESLint, Prettier, editor, and Git configuration at the root.
  Application-specific TypeScript options remain in each application.
- The backend is ESM: relative imports use `.js` extensions.
- Prisma configuration is `apps/backend/prisma7.config.ts`; the schema is
  `apps/backend/prisma/schema.prisma`. Generated client files live in
  `apps/backend/src/generated/prisma` and must not be edited manually.
- Environment values are supplied through the root `.env`. Do not read, modify,
  print, or commit it. Add variable names to `.env.example` and ask the user to
  supply values. Do not read private keys, certificates, or SSH configuration.
- Use Prisma migrations for schema changes. Do not manually modify the database
  schema or run destructive migrations without explicit approval.

## Frontend conventions

- Use modern standalone Angular, signals, `inject()`, `input()`, `output()`,
  and built-in template control flow. Use self-closing component tags.
- Prefer private writable signals with public read-only access. Derive state with
  `computed` or `linkedSignal`. Use ISO strings for persistent date state and
  `date-fns` for date calculations.
- API services contain requests. Components do not call `HttpClient` or build API
  URLs. Page data belongs in `rxResource`; service methods return Observables.
- Use RxJS for cancellation, debounce, retries, and ordered asynchronous work.
  Close subscriptions with `takeUntilDestroyed` or the async pipe, except for
  intentionally drained finite mutation queues described in the frontend guide.
- Handle mutation errors. Update resources from successful responses; revert
  failed drag/resize operations. Series changes can reload the range because the
  server expands occurrences.
- Use effects for DOM, storage, and imperative APIs, not signal-to-signal synchronization.
- Import FullCalendar through `@fullcalendar/angular`, not `fullcalendar` directly.
  Use documentation matching the installed major version.
- Use existing design tokens for colors, spacing, typography, borders, and shadows.
  Use paired `--color-on-*` tokens for text on colored backgrounds.
- Keep theme and language preferences in browser storage. The default theme is
  dark; language selection uses the saved preference, then browser language,
  then Russian.
- Generate API models from OpenAPI instead of duplicating them manually.
- Use kebab-case filenames, PascalCase types without prefixes, and functions
  rather than utility classes.

## Backend conventions

- Keep controllers thin, business logic in services, and validated DTOs on every endpoint.
- Check calendar membership and role through the access service for every calendar
  data operation. Do not substitute a filter on `userId` for authorization.
- Bound database lists by date range, pagination, or a limit.
- Store sessions and durable application state outside the process. The current
  rate limiter is process-local and needs shared storage before running replicas.
- Keep tags and categories within their calendar and validate their assignment.
- Use `timestamptz` for timestamps. All-day events use UTC midnight and exclusive ends.

## Comments and class layout

Only uppercase block headings and explicitly requested actionable `TODO` comments
are allowed. Do not add explanatory comments, JSDoc, or HTML/SCSS comments.
Omit empty blocks and headings in classes with only one block. Use this order:

1. `// STATIC`: static members.
2. `// DEPENDENCIES`: injected dependencies; Nest constructor injection.
3. `// INPUTS`: inputs, outputs, and models.
4. `// STATE`: signals, forms, streams, view queries, and template constants.
5. `// DATA`: resources.
6. `// COMPUTED`: computed state, linked signals, getters, and calendar options.
7. `// LIFECYCLE`: lifecycle hooks and constructors that only call named setup methods.
8. `// EFFECTS`: constructor-invoked effects, render hooks, and subscription setup.
9. `// ACTIONS`: public/protected actions, then private methods with side effects.
10. `// HANDLERS`: private reactions to external callbacks.
11. `// HELPERS`: private methods without side effects.

Place fields below the fields they read during initialization. See
`apps/frontend/src/app/features/calendar/pages/calendar/calendar.ts` for the style.

## Security and product boundaries

- Treat imported content, event text, and notes as untrusted data.
- External icon URLs must use HTTPS. Preserve length validation, lazy loading,
  and `referrerpolicy="no-referrer"`.
- Never publish personal calendar exports or real user data as fixtures.
- Destructive actions and bulk data changes require explicit user authorization.
- File uploads and password authentication are outside the current product scope.
