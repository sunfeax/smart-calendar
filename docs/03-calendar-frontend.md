# Calendar frontend

FullCalendar integration follows the installed v7 API. Older examples may use
different imports, options, or internal markup.

## Data flow

The calendar page uses API services for events; it does not call HTTP directly.
Date-range callbacks update a signal, which supplies the parameters for
`rxResource`. A new range cancels stale loading and fetches the visible events.

Drag and resize are optimistic. The calendar moves the event immediately;
a failed request calls `revert()` and displays an error. Dialog mutations update
the local event resource after the server responds. The page passes typed
callbacks to the dialog for requests, resource updates, and error handling.
Series mutations reload the range because occurrences are expanded on the server.
All-day event ends are exclusive.

## Year view and week height

`multiMonthYear` uses a fixed `dayMaxEventRows: true` layout. Regular
`dayMaxEvents`/`dayMaxEventRows` options do not make its cells grow.

`countEventsByDay` and `fitWeekRow` in `utils/calendar-layout.ts` measure the
busiest day and write the week row's CSS variable. `_calendar-theme.scss` defines
the height formula. `fitWeekRow` runs from `dayCellDidMount` and `afterRenderEffect`
when rows or events change.

Theme styles remove the month body's `aspect-ratio` and absolute positioning from
`[role="rowgroup"]`. These depend on FullCalendar internals; verify growing weeks
after package updates. `--calendar-event-height`, `--calendar-event-outer-height`,
and `--calendar-event-gap` keep card borders and spacing in the row calculation.
The API bounds requests with `RANGE_MAX_DAYS` and `RANGE_MAX_ITEMS`.

## Event dialog and autosave

The Material dialog edits title, description, date range, time, all-day/completion
state, icon, tags, and recurrence. Date selection uses `mat-date-range-input`.
The icon picker provides bundled choices and emoji, website, and HTTPS image inputs.
The dialog is fullscreen on phones.

`EventEditDialog` tracks form state and the last server-confirmed event. Debounced
form changes, tag assignment/removal, and tag creation with assignment pass through
one `concatMap` queue. Each request computes its delta when executed against the
latest confirmed state. Invalid fields are withheld while valid changes can save.

Closing the dialog queues its latest form state immediately and lets finite
requests drain rather than cancelling them with the view. A failed older request
does not overwrite newer edits.

`EventTags` owns menu UI state and emits tag actions to its parent. The page creates
and assigns tags through API services. Category and tag metadata updates use their
own ordered queue and update resources from successful responses. Tag name drafts
save on blur, return to the list, or Escape dismissal. Deletion confirmations are
not delayed in the metadata queue.

## Sharing

`CalendarShareDialog` displays members for every role. Owners and editors can
invite users, revoke permitted links, and remove permitted members; the backend
applies the same role rules. The invitation token is returned once and copied to
the clipboard as `<origin>/invite/<token>`.

`/invite/:token` uses `authGuard`. Signed-out visitors sign in with `returnUrl` and
then return to the invitation. Only internal paths beginning with one slash are
accepted. The sharing dialog refreshes on reopening, without live membership updates.

## Appearance

The FullCalendar Monarch theme maps to shared design tokens in
`_calendar-theme.scss`. Cards use a neutral background, with icons and tags carrying
color. Material and FullCalendar switch themes together. Every layout supports
light and dark tokens.

## Search and export

Search opens from the header and uses an `rxResource` with a 300 ms debounce and
at least two characters. `EventRow` is shared with the archive and accepts action
content through `ng-content`. Selecting a result opens the regular event dialog.

XLSX export runs in the browser through a dynamically loaded `write-excel-file`.
The user selects a period of up to a year. Each occurrence becomes a row, with a
column for each tag category.

## Import

Owners and editors open import from the header menu. The dialog reads the selected
file in the browser, sends it to the preview endpoint with the browser time zone, and
shows how many events are ready, need attention, or cannot be imported. Broken events
can be skipped together or filled in one by one; the import button stays disabled
until every broken event is skipped or valid. Success reloads events and tag categories.
A newer file selection cancels reading of the previous one (`switchMap`). The dialog
cannot be closed while an import is saving. Notion columns are detected on the server;
the dialog asks only for the date column, and only when the file has several.

## PWA and connectivity

`@angular/service-worker` is enabled for production builds. `ngsw-config.json`
prefetches the application shell and loads translations, images, and Google fonts
on demand. `/api/**` is neither cached nor treated as application navigation.

`AppUpdateService` downloads a new version in the background and offers an update
action. Caddy does not mark unhashed worker scripts as immutable. Google fonts are
allowed in `connect-src` for service-worker requests.

`AuthService.me()` clears the user only for 401 responses. Other failures mark the
backend unreachable, route guards redirect to `/offline` with `returnUrl`, and
retry checks the session again. The app does not support offline data editing.

## Drag to trash

`eventDragStart` shows a bottom-center trash target. Pointer coordinates are tracked
through `pointermove`. `eventDragStop` over the target uses the ordinary deletion
path. A subsequent `eventDrop` onto the cell below it is reverted. The target sits
above the bottom edge to avoid FullCalendar's automatic scroll zone.

## Mobile behavior

- Below 600px (`MOBILE_QUERY`), use `dayGridMonth` instead of the year view.
  Horizontal swipes navigate months; day view swipes navigate days. Short,
  vertical, diagonal, held, cancelled, or multi-touch gestures do not navigate.
  Swipes suppress accidental date/event clicks while preserving vertical scrolling
  and pinch zoom.
- The first header row centers Today between the title and actions. The second
  centers period navigation. Below 374px, search moves into the menu.
- The month picker switches to a year list within the same panel. Selecting a year
  opens January of that year and returns to the month list. Desktop keeps its year menu.
- Month cells show short titles without tags or icons and collapse extra events
  into a count. Selecting a date or overflow count opens `timeGridDay`, with hourly
  slots, an all-day area, and a current-time marker. Back returns to that day's month.
- The floating add button creates an event on the open day, or the calendar's anchor
  date in month view. Selecting an empty time slot creates a one-hour event.
  Creation is limited to owners and editors; viewers can navigate and inspect events.
- Dragging is disabled on phones; dates and times are edited in the fullscreen dialog
  (`app-dialog-fullscreen`). Switching to a wider screen restores the year view;
  returning to a phone layout restores month view.
