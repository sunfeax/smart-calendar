# Smart Calendar overview

Smart Calendar is a shared web calendar with a continuous year view, event icons,
and colored tags organized into categories. Users can create personal calendars
or share them with a small group through single-use invitation links.

The application includes Google sign-in, recurring events, archive and restore,
search, XLSX export, light and dark themes, English/Russian/Spanish translations,
and mobile month/day views. It can be installed as a PWA. Backend and deployment
limitations are documented alongside their implementation.

## Architectural decisions

| Area               | Decision                                                 | Rationale                                                                        |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Calendar rendering | FullCalendar through `@fullcalendar/angular`             | Provides multi-day layout, drag and drop, resizing, and multiple views.          |
| Frontend           | Standalone Angular with signals and RxJS                 | Signals represent state; RxJS handles asynchronous events and HTTP workflows.    |
| UI                 | Angular Material and shared design tokens                | Consistent controls, accessibility, and light/dark theme support.                |
| Backend            | NestJS, Prisma, PostgreSQL                               | Modular services, validated API boundaries, and relational data with migrations. |
| Authentication     | Google ID tokens and database sessions                   | Avoids password storage and supports immediate session revocation.               |
| Authorization      | Calendar membership with OWNER, EDITOR, and VIEWER roles | Centralizes access checks for shared calendars and their data.                   |
| Recurrence         | Server-side `rrule` expansion in the series time zone    | Keeps local event times stable through daylight saving changes.                  |
| Dates              | PostgreSQL `timestamptz`; UTC dates for all-day events   | Separates absolute instants from date-only events with exclusive end dates.      |
| Invitations        | Single-use, seven-day links for EDITOR or VIEWER         | Limits link reuse and prevents granting ownership by invitation.                 |
| Event editing      | Autosave with ordered mutations                          | Saves individual changes without a separate save action.                         |
| Deletion           | Archive, undo, restore, and confirmed permanent deletion | Supports recovery from accidental deletion.                                      |
| Tags               | Calendar-owned categories and tags with palette keys     | Keeps shared metadata consistent and supports both themes.                       |
| Event appearance   | Neutral cards with icons and colored tags                | Uses a shared background while keeping event metadata visible.                   |
| Icons              | Emoji, bundled brand SVGs, and external HTTPS images     | Supports multiple icon sources without file uploads.                             |
| Preferences        | Browser-local theme and language                         | Keeps device preferences independent of account data.                            |
| Mobile             | Month grid and hourly day view; editing through dialogs  | Supports touch navigation without drag/scroll conflicts.                         |
| PWA                | Cached application shell; API data remains online        | Supports installation without offline-editing conflicts in shared calendars.     |
| Deployment         | Docker Compose with an external HTTPS reverse proxy      | Separates application containers from public TLS termination.                    |

## Scope and limits

- Calendars, categories, tags, and members have server-side limits defined in their
  feature constants. No capacity claim is implied by the architecture.
- Category/tag ordering follows creation order; `sortOrder` is reserved for explicit ordering.
- Single-selection categories reject conversion when existing events have multiple tags.
- Series tags apply to all occurrences. Recurrence exceptions modify event fields.
- Shared views do not currently receive live updates from other participants.
- Offline editing, password authentication, and user image uploads are not implemented.

## Documentation

- [Stack and data flow](01-stack.md)
- [Data model and domain rules](02-data-model.md)
- [Calendar frontend](03-calendar-frontend.md)
- [Backend and authentication](04-backend-auth.md)
- [Deployment](05-deploy.md)

The root [README](../README.md) covers setup and commands. The Prisma schema and
application source are authoritative when documentation and implementation differ.
