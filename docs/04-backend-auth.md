# Backend and authentication

## Modules

Nest features include `auth`, `session`, and `users`, plus `calendars`, `events`,
`tag-categories`, `tags`, `members`, and `invites` under `features/calendar`.

`auth` owns Google sign-in, logout, `/auth/me`, and the global guard. It delegates
session creation, hashed-token lookup, renewal, revocation, and expiry cleanup to
`session`. Calendar access checks are centralized in the access service.
Controllers validate DTOs and delegate business logic to services.

## API

All routes use the `/api` prefix. Swagger describes the implemented contract;
frontend models are generated from it. Swagger is available only outside production.

### Authentication

- `POST /auth/google`: verify a Google ID token and set a session cookie.
- `POST /auth/logout`: revoke the session.
- `GET /auth/me`: return the current user.

### Calendars, members, and invitations

- `GET /calendars`, `POST /calendars`, `PATCH /calendars/:id`, `DELETE /calendars/:id`.
- `GET /calendars/:id/members`: list members and roles.
- `DELETE /calendars/:id/members/:userId`: remove an allowed member or leave as a non-owner.
- `GET /calendars/:id/invites`: active links without their tokens, including creator IDs.
- `POST /calendars/:id/invites` with `{ role }`: create an EDITOR or VIEWER invitation.
  The token is returned once.
- `DELETE /invites/:id`: revoke an allowed invitation.
- `POST /invites/accept` with `{ token }`: accept and return the calendar.

### Events

- `GET /calendars/:id/events?from=&to=`: standalone events and expanded occurrences.
  Occurrences carry the series ID and `originalStart`; standalone events use null.
- `POST /calendars/:id/events`: create an event or series.
- `PATCH /events/:id`, `DELETE /events/:id`: update or archive. For series,
  `scope=this|following|all` and `originalStart` select the affected occurrences.
  Without a scope, the operation addresses the stored record.
- `GET /calendars/:id/events/archived`: up to 100 archived records, owner/editor only.
- `POST /events/:id/restore`: restore an archived record, or use
  `scope=this&originalStart=...` to restore one cancelled occurrence.
- `DELETE /events/:id/archived`: permanently delete an archived record.
- `POST /events/:id/tags/:tagId`, `DELETE /events/:id/tags/:tagId`: assign/remove
  one tag and return the updated event.
- `GET /calendars/:id/events/search?q=`: case-insensitive title, description, and
  tag-name search, from 2 to 100 characters, up to 50 non-archived results.
  A series contributes its next occurrence, or its final occurrence if it has ended.

Event responses contain `tagIds`; category responses supply names and colors.
Recurrence scope behavior is described in the [data model](02-data-model.md#recurrence).

### Tags

- `GET`/`POST /calendars/:calendarId/tag-categories`: list categories with tags or create one.
- `PATCH`/`DELETE /tag-categories/:id`: update or remove a category.
- `POST /tag-categories/:categoryId/tags`: create a tag.
- `PATCH`/`DELETE /tags/:id`: update or remove a tag.

There is no separate tag-list endpoint. XLSX export is generated on the client;
JSON/ICS export endpoints are not currently implemented.

## Google sign-in and sessions

1. Google Identity Services returns an ID token as `credential` to the frontend.
2. The frontend posts it to `/auth/google`.
3. `google-auth-library` checks the token signature, expiry, and audience against
   the configured client ID.
4. The backend finds or creates the user by the Google `sub` identifier and updates
   profile fields. First sign-in creates a personal calendar and owner membership.
5. The backend creates a database session and sets a secure, httpOnly,
   `SameSite=Lax` cookie.

The database stores only the session token hash. Sessions expire after 30 days
with sliding renewal. The application does not store passwords or require its own
refresh-token flow. Google authorized JavaScript origins must include the frontend
origin used by the browser; local development uses `http://localhost` and
`http://localhost:4200`. Production uses its public HTTPS origin.

## Security boundaries

- Every calendar operation checks membership and role through the access service.
- DTOs validate incoming fields and enforce field-length and format limits.
- External icon URLs use HTTPS, bounded length, lazy loading, and no-referrer requests.
- Helmet provides API headers; throttling limits general and sensitive requests.
- The frontend and API share an origin. Cookie policy and JSON request handling
  are part of the current setup; changing to cross-origin hosting requires a
  separate review of CSRF and cookie behavior.
- Credentials belong in environment configuration, never in source or logs.
  Personal event data and authentication tokens must not be logged.
- Schema changes use migrations. See [deployment](05-deploy.md) for proxy,
  rate-limit, backup, and production configuration details.
