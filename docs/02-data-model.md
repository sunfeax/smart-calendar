# Data model and domain rules

The source of truth is [schema.prisma](../apps/backend/prisma/schema.prisma).
Schema changes use Prisma migrations; this document describes relationships and
behavior without duplicating the schema. Identifiers are UUID strings and route
parameters are validated with `ParseUUIDPipe`.

## Entities

| Entity           | Purpose                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `User`           | Google identity, email, display name, avatar, memberships, and invitations.                       |
| `Session`        | Hashed session token, user, expiry, renewal time, and optional user agent.                        |
| `Calendar`       | Name and ownership boundary for members, events, categories, and invitations.                     |
| `CalendarMember` | User/calendar membership with an OWNER, EDITOR, or VIEWER role.                                   |
| `CalendarInvite` | Hashed single-use token, target role, creator, expiry, and acceptance metadata.                   |
| `TagCategory`    | Calendar-owned group of tags with a single/multiple-selection setting.                            |
| `Tag`            | Category-owned name, palette color, and sort order.                                               |
| `Event`          | Title, description, icon, start/end, all-day flag, completion/archive timestamps, and recurrence. |
| `EventTag`       | Many-to-many event/tag association.                                                               |
| `EventException` | Cancelled or overridden occurrence, identified by series and original start.                      |

`Event.externalId` stores the Google Calendar `UID` of an imported event and is unique
per calendar, so importing the same export again skips events that already exist.

Theme and language preferences live in browser storage rather than `User`.

## Access control

Every event, category, tag, member, and invitation operation checks calendar
membership and the minimum role through `CalendarAccessService`.

| Operation                                        | OWNER        | EDITOR       | VIEWER |
| ------------------------------------------------ | ------------ | ------------ | ------ |
| View events, tags, and members                   | Yes          | Yes          | Yes    |
| Create/edit/archive events and change completion | Yes          | Yes          | No     |
| Manage categories and tags                       | Yes          | Yes          | No     |
| Create EDITOR/VIEWER invitations                 | Yes          | Yes          | No     |
| Remove other members                             | Except owner | Except owner | No     |
| Rename or delete the calendar                    | Yes          | No           | No     |
| Leave the calendar                               | No           | Yes          | Yes    |

An editor cannot modify the owner or grant ownership. Invitation roles are
explicitly selected as EDITOR or VIEWER. First sign-in creates a personal calendar
and an OWNER membership. Ownership transfer is not implemented.

Events can only use tags from their own calendar. A single-selection category
allows one tag per event. Converting a category to single selection returns 409
while any event still has multiple tags in it.

## Tags and categories

- `TagColor` stores a palette key rather than a hex color. Frontend tokens
  `--color-tag-<key>` and `--color-on-tag-<key>` define both themes, using lowercase
  keys such as `blue`. Adding a color requires an enum migration and paired tokens.
- Limits live in `tag-category.constants.ts` and `tag.constants.ts`:
  `MAX_TAG_CATEGORIES_PER_CALENDAR` and `MAX_TAGS_PER_CATEGORY`.
- Parent IDs belong in routes: `calendars/:calendarId/tag-categories` and
  `tag-categories/:categoryId/tags`. Moving tags across categories is unsupported.
- Categories are returned with nested tags, ordered by `sortOrder`, then `createdAt`.
  The server appends new records with the next sort order. Clients change order only
  through `PUT calendars/:calendarId/tag-categories/order` and
  `PUT tag-categories/:categoryId/tags/order` with the complete ID list; an outdated
  list returns 409.
- `showOnCard` (default `true`) controls whether a category's tags appear on event
  cards. It is shared by all calendar members and does not affect the event dialog,
  search, or archive.
- Category creation requires `multiple`; tag creation requires `color`. Avoid
  `@IsOptional()` for non-nullable create fields: it also accepts `null`.
- Assignment uses individual `POST`/`DELETE events/:id/tags/:tagId` calls.
  Repeated calls are safe. For single-selection categories, adding a tag removes
  the previous tag of that category in the same transaction.
- Events return `tagIds`, while category responses supply names and colors.
  Renaming metadata updates all rendered events through the shared tag dictionary.
  Deleting a tag removes its event associations through cascading relations.

## Dates and range queries

Date/time columns use `@db.Timestamptz(3)`. Timed events store absolute instants
and display in the viewer's browser time zone. All-day events use UTC midnight
and an exclusive end: an event covering October 1 has an end of October 2.
`endAt` is required and must be later than `startAt`.

The frontend requests `[from, to)` for the visible range. An event overlaps when
`startAt < to` and `endAt > from`. The `(calendarId, startAt)` index supports these
queries. `RANGE_MAX_DAYS` and `RANGE_MAX_ITEMS` bound the interval and result size.

Series that started before the range remain eligible when `startAt < to`.
The server expands their occurrences and applies exceptions before responding.
Application date state uses ISO strings rather than mutable `Date` objects.

## Invitations

- Links expire after seven days and can be used once. A token contains 32 random
  bytes; the database stores only its hash.
- Acceptance is transactional: validate expiry and unused status, check membership
  and member limits, record `usedAt`/`usedById`, and create `CalendarMember`.
- Existing members can open the calendar without consuming the invitation.
- `MAX_CALENDAR_MEMBERS` currently allows five members including the owner.
  Invitations do not reserve places. A full calendar returns 409 without consuming
  the link.
- `MAX_ACTIVE_INVITES = MAX_CALENDAR_MEMBERS - 1` limits live unused invitations.
  Creation locks the calendar row in a transaction to enforce the limit.
- The invitation creator and the calendar owner can revoke a link. Owners and
  editors can remove members except the owner. Non-owner members can leave.
- Used, expired, and unavailable links return appropriate 410/404 responses without
  exposing additional information.

## Icons

The event's `icon` is a string with one of these prefixes:

| Prefix   | Value                                                                           |
| -------- | ------------------------------------------------------------------------------- |
| `emoji:` | Emoji sequences, at most 16 code points, without whitespace.                    |
| `brand:` | Bundled brand key: lowercase letters, digits, and hyphens, up to 40 characters. |
| `url:`   | HTTPS image URL, up to 2,048 characters.                                        |

Emoji validation includes flags, keycaps, and ZWJ sequences. The backend validates
brand key syntax; the frontend knows the available brands and supplies a fallback.
Add a new brand SVG in `public/icons/brands` and register it in `BRAND_ICONS`.

The website picker builds a DuckDuckGo favicon URL from a hostname and stores it
as `url:`. Image mode stores the original HTTPS URL without requiring a file
extension. Emoji can be entered in either mode. These picker modes are frontend
behavior; the backend stores only the prefixed value.

External images use lazy loading, `referrerpolicy="no-referrer"`, and a fallback
on failure. The picker uses a CDK connected overlay with focus containment,
Escape/outside-click dismissal, and vertical scrolling. File upload is unsupported.

## Recurrence

A series is stored once with `recurrenceRule`. The backend uses `rrule` to expand
occurrences in `Event.timeZone`, preserving local wall time through daylight
saving transitions. Timed series have an IANA time zone; standalone and all-day
events have no series time zone. Viewer display zones do not affect expansion.

The client receives the series ID and `originalStart` for each occurrence.
Supported UI presets include daily, weekly, monthly, yearly, and weekdays, with
no end, `UNTIL`, or `COUNT`. Rules are validated by the existing recurrence validator.
`UNTIL` is interpreted as wall time in the series zone.

- **This occurrence:** write an `EventException` with `cancelled = true` or JSON
  `overrides` for changed fields such as time or title.
- **This and following:** split the series. Reduce the original `COUNT` to the
  preceding occurrence count, or set `UNTIL` one second before the split. Give
  the new series the remaining count where applicable. Exceptions in the old
  series from the split onward are removed.
- **All occurrences:** update the original series. Changing its start, rule,
  time zone, or all-day flag clears exceptions whose anchors would no longer match.

`(eventId, originalStart)` uniquely identifies an exception. Exception lookup is
bounded by a `RANGE_MAX_DAYS` window around the requested range; an occurrence
moved farther away than that can fall outside the lookup window. Tags apply to
the whole series. Series mutations reload the visible range because the server
must rebuild its occurrences.

## Archive and deletion

`DELETE` archives an event by setting `archivedAt`. Archived records are excluded
from ordinary queries and mutations. Only a whole standalone event or series is
archived; deleting one occurrence cancels it, while deleting following occurrences
from the middle truncates the rule.

The undo notification lasts six seconds (`SNACKBAR_ACTION_DURATION`). Restore
uses `POST /events/:id/restore`; for one cancelled occurrence it includes
`scope=this` and `originalStart`. Truncating following occurrences has no undo action.

Owners and editors can list, restore, and permanently delete archived records.
Permanent deletion requires confirmation and only accepts archived records.
Archives have no automatic expiry. Deleting a calendar cascades to its related data.
