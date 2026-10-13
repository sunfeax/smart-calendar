# Гайд: календарь на API (бэкенд + фронтенд)

Пособие для этапа 2 из `06-roadmap.md`. Каждый шаг объясняет, **что** делаем, **почему** именно так и **как**, и заканчивается проверкой. Код дан каркасами: сигнатуры и структура готовы, а то, что пишешь ты, помечено комментариями `// TODO`. В них описана цель и критерий, а подсказка («Подсказка: …») дана только для API, которого в проекте ещё не было. Готового кода в TODO нет: его пишешь сам. Пока каркас не дописан, TypeScript ругается на отсутствующий `return`: это нормально. Схема API: `05-backend-auth.md`, схема БД и правила: `03-data-model.md`.

Читать по порядку: каждый шаг опирается на предыдущие. Образец стиля, на который стоит оглядываться: `apps/backend/src/session/session.service.ts` и `apps/backend/src/user/user.service.ts`.

**Статус:** схема Prisma и миграция есть (`Calendar`, `CalendarMember`, `Event`). Всё остальное в этом гайде ещё не сделано.

## Принятые решения

Решения по этапу 2, которых не было в `08-open-questions.md`. Они определяют код ниже.

1. **События «на весь день».** Храним как FullCalendar: `startAt` = полночь UTC первого дня, `endAt` = полночь UTC дня **после** последнего (эксклюзивный конец). Между API и календарём конвертировать нечего. Единственное место, где конец сдвигается на день, это диалог (там пользователь выбирает последний день включительно).
2. **Цвет календаря.** У каждого календаря **один цвет на весь календарь**. Он показывается на его плитке на экране выбора и как акцент на странице календаря. У событий этого цвета нет, карточки нейтральные. Хранится **ключ палитры** (`blue`, `green`...), а не hex: значения цветов лежат токенами отдельно для светлой и тёмной темы, поэтому цвет хорошо выглядит в обеих. Палитра ~8 цветов, этап 3 её переиспользует. (Принято по умолчанию, если нужен hex, скажи до шага 3.)
3. **Календари как закладки.** После входа открывается экран с плитками календарей и плиткой «+». Клик по плитке открывает календарь, клик по «+» создаёт новый. Из календаря на экран плиток возвращаются кнопкой в шапке. Сайдбара нет. Календарь можно удалить, в том числе последний. Лимит числа календарей (1 бесплатный, много в премиуме) относится к монетизации и в этот этап не входит: сделаем его, когда решим модель (`08-open-questions.md`). Создание календаря проходит через один метод сервиса, туда лимит и встанет.
4. **«Выполнено».** У каждого события есть отметка о выполнении (галочка на карточке и в диалоге), как в списке дел. Отдельного типа «задача» нет. В схему добавляется `completedAt` (порция 3 из `03-data-model.md`), шаг 4.
5. **Swagger используем** (пробуем в этом проекте, чтобы решить, нужен ли он на работе). Бэкенд отдаёт спецификацию OpenAPI, из неё генерируются типы и сервисы для Angular (шаг 8). Ручные запросы к API идут через Swagger UI на `/api/docs`.

## Как это устроено

```
Angular                                   Nest
  Calendar page ── rxResource ──┐
  Dialog / drag / delete ───────┤
                                ▼
                       сгенерированный клиент  ──HTTP /api──>  Controller (тонкий)
                       (типы и методы из OpenAPI)                  │
                                                                   ▼
                                                  Service ── CalendarAccessService
                                                     │        (членство и роль, один раз)
                                                     ▼
                                                PrismaService
```

Идеи, на которых всё держится:

1. **Одна точка проверки доступа.** Каждый метод сервиса, который трогает данные календаря, **первой строкой** вызывает `CalendarAccessService`. Фильтров «`where: { userId }`» в запросах к событиям нет и быть не должно (правило из `CLAUDE.md`).
2. **Контроллеры тонкие.** Берут параметры и DTO, передают `user.id` и параметры в сервис, возвращают результат. Вся логика в сервисах.
3. **Фронтенд не дублирует типы.** Типы запросов и ответов приходят из OpenAPI (`/api/docs-json`). Поэтому ответы бэкенда описываются **классами**, а не `interface`: Swagger не видит интерфейсы. Это касается и существующего `UserProfile`. После правки DTO на бэкенде нужно заново сгенерировать клиент (шаг 8).
4. **Даты везде ISO-строки.** На бэкенде `Date` допустим, в состоянии фронтенда нет.
5. **Все списки ограничены.** События: диапазон дат (не шире N дней) плюс жёсткий `take`. Календари: `take`.

### Карта шагов

| Шаг | Где      | Результат                                                    |
| --- | -------- | ------------------------------------------------------------ |
| 1   | бэкенд   | Swagger, `/api/docs`, ответы классами                        |
| 2   | бэкенд   | `CalendarAccessService`: членство и роль                     |
| 3   | бэкенд   | модуль `calendars`: список, один, создание, правка, удаление |
| 4   | бэкенд   | `completedAt`, модуль `events`: диапазон, создание, правка, удаление |
| 5   | бэкенд   | ручная проверка доступа и границ диапазона                   |
| 6   | фронтенд | цвета календаря в токенах, ключи переводов                   |
| 7   | фронтенд | маршруты и экран выбора календаря (плитки)                   |
| 8   | фронтенд | клиент API из OpenAPI                                        |
| 9   | фронтенд | страница календаря: события из API, навигация                |
| 10  | фронтенд | диалог события, «+» на дате, галочка «выполнено»             |
| 11  | фронтенд | drag-and-drop, ресайз, откат                                 |
| 12  | фронтенд | удаление с отменой                                           |
| 13  | фронтенд | диалог календаря: создание, цвет, удаление                   |
| 14  | везде    | сквозная проверка                                            |

---

## Шаг 1. Swagger и ответы классами

**Что:** подключить `@nestjs/swagger`, открыть документацию на `/api/docs` и отдавать спецификацию в JSON.

**Зачем сейчас, а не в конце:** клиент для Angular генерируется из этой спецификации. Если описывать DTO сразу с учётом Swagger, к шагу 8 всё уже будет в порядке, а не придётся переписывать.

**Как:**

```bash
cd apps/backend
npm i @nestjs/swagger
```

- В `main.ts`, **до `listen`**, собрать документ и поднять UI. Подсказка: `DocumentBuilder` собирает метаданные (название, версия, схема авторизации), `SwaggerModule.createDocument` строит спецификацию по контроллерам, `SwaggerModule.setup` отдаёт UI и JSON. Путь UI: `docs` (с учётом глобального префикса `api` получится `/api/docs`, JSON будет на `/api/docs-json`; проверь, как префикс влияет на `setup`).
- Авторизация у нас по cookie `session`: у `DocumentBuilder` есть метод для cookie-схемы. Название cookie берём из `SESSION_COOKIE`, не пишем строкой.
- **CLI-плагин Swagger.** Без него каждое поле DTO пришлось бы дублировать в `@ApiProperty`. Плагин подключается в `nest-cli.json` (`compilerOptions.plugins`) и читает типы TypeScript и декораторы `class-validator`. По умолчанию он обрабатывает только файлы `*.dto.ts` и `*.entity.ts`: **называй файлы с DTO и ответами так**. Если плагин по какой-то причине не заработает под ESM, запасной путь: `@ApiProperty()` вручную.
- **Ответы классами.** Перенеси `UserProfile` из интерфейса в класс (файл с суффиксом `.dto.ts`) и поправь импорты. Контроллер `auth` при этом менять не нужно, кроме импорта.

**Предупреждение про `whitelist: true`.** `ValidationPipe({ whitelist: true })` выбрасывает из тела любое свойство DTO, у которого нет **ни одного** декоратора валидации. Поле без декоратора молча пропадёт. В каждом поле входных DTO должен быть хотя бы один декоратор (для необязательных `@IsOptional()` плюс правило).

**Про безопасность.** UI документации публичен. На время беты на локальной машине это нормально, но в чек-лист этапа 6 стоит добавить «закрыть `/api/docs` в проде».

**Запасной способ проверки.** Если нужно вызвать API без UI, подойдёт `curl -b "session=<значение>" ...`, значение cookie берётся из DevTools → Application → Cookies.

**Проверка:** `npm run back`, `http://localhost:3000/api/docs` открывается и показывает `auth/*`. `GET /api/auth/me` в схеме возвращает не пустой объект, а поля профиля. Войдя через фронтенд, ты получаешь cookie на `localhost`; она уйдёт и на порт 3000, поэтому «Try it out» в Swagger UI работает от твоего пользователя.

---

## Шаг 2. `CalendarAccessService`: членство и роль

**Что:** один сервис, который отвечает на вопрос «может ли этот пользователь делать это с этим календарём».

**Зачем отдельным сервисом:** проверка нужна и календарям, и событиям, а позже тегам и приглашениям. Если разбросать её по сервисам, в одном из них её забудут или напишут чуть иначе. Ошибка в проверке доступа это утечка чужих данных.

**Модуль:** сервис живёт в модуле `calendars` и экспортируется оттуда (`exports`), модуль `events` импортирует `CalendarsModule`. Порядок генерации тот же, что в прошлом гайде: сначала `module`, потом `service`.

```bash
cd apps/backend
npx nest g module calendars && npx nest g service calendars/calendar-access --flat
```

Проверь, что сервис не оказался в `AppModule`, и что импорты с расширением `.js`.

**Права по ролям** (из `03-data-model.md`): `VIEWER` читает, `EDITOR` ещё и меняет события, `OWNER` ещё и меняет настройки календаря. Роли упорядочены: каждая следующая включает права предыдущей. Поэтому проще сравнивать роли по числовому рангу, чем перечислять разрешённые роли в каждом месте.

**404 или 403.** Если пользователь **не участник** календаря, отвечаем `404`, а не `403`: так мы не подтверждаем, что такой id вообще существует. `403` только когда пользователь участник, но роли не хватает.

**Каркас:**

```ts
// TODO: ranks of roles: VIEWER < EDITOR < OWNER. A plain object typed Record<CalendarRole, number>.
const ROLE_RANK: Record<CalendarRole, number> = {
  /* ... */
};

@Injectable()
export class CalendarAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the membership if the user has at least `minRole` in the calendar, otherwise throws. */
  async requireRole(
    userId: string,
    calendarId: string,
    minRole: CalendarRole,
  ): Promise<CalendarMember> {
    // TODO 1: find the membership by the pair (calendarId, userId).
    //         Hint: for @@id([calendarId, userId]) Prisma generates a composite key named
    //         calendarId_userId, you pass it to findUnique's where.
    // TODO 2: no membership -> NotFoundException (hint: it comes from @nestjs/common and gives a 404).
    // TODO 3: membership role ranks lower than minRole -> ForbiddenException (403).
    // TODO 4: return the membership.
  }

  /** Same check for an event: finds its calendar first. Returns the event. */
  async requireEventRole(
    userId: string,
    eventId: string,
    minRole: CalendarRole,
  ): Promise<Event> {
    // TODO 1: find the event by id.
    // TODO 2: not found -> NotFoundException.
    // TODO 3: reuse requireRole with event.calendarId, do not copy the check.
    // TODO 4: return the event.
  }
}
```

**На что смотреть при проверке:**

- `requireEventRole` для чужого события и для несуществующего должен отвечать одинаково (`404`). Если ответы различаются, по ним можно угадывать, какие id существуют.
- Сравнение рангов: `EDITOR` не проходит при `minRole = OWNER`, `OWNER` проходит везде.

**Проверка:** `npx tsc --noEmit` чистый, `npm run back` стартует. Тестов не пишем: проверим вручную на шаге 5, когда будут эндпоинты.

---

## Шаг 3. Модуль `calendars`

**Что:** `GET /api/calendars`, `GET /api/calendars/:id`, `POST /api/calendars`, `PATCH /api/calendars/:id`, `DELETE /api/calendars/:id`.

**Файлы:**

| Файл                                          | Что внутри                                       |
| --------------------------------------------- | ------------------------------------------------ |
| `src/calendars/calendars.constants.ts`        | допустимые ключи цвета, лимиты длины             |
| `src/calendars/create-calendar.dto.ts`        | тело `POST`                                      |
| `src/calendars/update-calendar.dto.ts`        | тело `PATCH`                                     |
| `src/calendars/calendar.dto.ts`               | ответ: календарь **и моя роль в нём**            |
| `src/calendars/calendars.service.ts`          | логика                                           |
| `src/calendars/calendars.controller.ts`       | маршруты                                         |

### 3.1. Константы и DTO

Ключи цвета: список строк из решения 2 (`CALENDAR_COLORS`), по нему же валидируем. Лимит имени, например 100 символов.

```ts
export class CreateCalendarDto {
  // TODO: name: string, not empty, up to the limit from the constants.
  // TODO: color: optional, one of CALENDAR_COLORS.
  //       Hint: @IsIn takes an array of allowed values; @IsOptional skips the rules for undefined AND null.
}

// TODO: UpdateCalendarDto: the same fields, all optional.
//       Hint: PartialType from @nestjs/swagger builds such a class from another one and keeps its validators
//       (the one from @nestjs/mapped-types would hide the fields from Swagger).

export class CalendarDto {
  // TODO: id, name, color (string | null), role (CalendarRole).
  //       It is a class, not an interface, so that Swagger sees it. Fields are plain, no decorators needed
  //       (the plugin from step 1 reads the types).
}
```

**Почему в ответе есть `role`.** Фронтенду нужно знать, что можно показывать: `VIEWER` не должен видеть «+» и галочки. Роль живёт в `CalendarMember`, а не в `Calendar`, поэтому сервис отдаёт «календарь плюс моя роль».

**Название личного календаря пустое** (`name: ''`, см. `UserService`). Бэкенд ничего не подставляет, фронтенд покажет переведённое «Личный календарь». Валидация `name` при `PATCH` пустую строку не пропустит: это правка пользователем, а не системное значение.

### 3.2. Сервис

```ts
@Injectable()
export class CalendarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  async list(userId: string): Promise<CalendarDto[]> {
    // TODO: take the user's memberships with their calendars (include), oldest first,
    //       limited with take (a list from the DB is never unbounded, pick a constant like 100),
    //       map each membership to a CalendarDto.
    //       Hint: findMany returns an array; orderBy sorts; take limits the count.
  }

  async get(userId: string, id: string): Promise<CalendarDto> {
    // TODO: requireRole(VIEWER) already loads the membership; load the calendar itself and return CalendarDto
    //       with the role from the membership. The calendar page needs the role, the color and the name.
  }

  async create(userId: string, dto: CreateCalendarDto): Promise<CalendarDto> {
    // TODO: create the calendar and the OWNER membership for this user in one nested create,
    //       the same way UserService.upsertFromGoogle does it. Map to CalendarDto.
    // ponytail: no limit on the number of calendars yet. When monetization is decided, the limit check
    //           goes here, before the create, and nowhere else.
  }

  async update(userId: string, id: string, dto: UpdateCalendarDto): Promise<CalendarDto> {
    // TODO 1: only OWNER may change settings: requireRole first, before any write.
    // TODO 2: update the calendar from the dto. A field that is undefined is not touched by Prisma,
    //         null clears it, so passing the dto fields as they are works.
    // TODO 3: return CalendarDto with the role from the membership you got in TODO 1.
  }

  async remove(userId: string, id: string): Promise<void> {
    // TODO 1: only OWNER may delete: requireRole first.
    // TODO 2: delete the calendar. Members and events go with it: the schema has onDelete: Cascade.
    //         Hint: delete removes one row by a unique key (here the id). Unlike deleteMany it throws when
    //         the row is missing, which is fine here: requireRole has just proved it exists.
    //         Deleting the last calendar is allowed: the user then sees an empty picker with only "+".
  }
}
```

### 3.3. Контроллер

```ts
@Controller('calendars')
export class CalendarsController {
  constructor(private readonly calendars: CalendarsService) {}

  // TODO: GET /calendars -> list
  // TODO: GET /calendars/:id -> get
  // TODO: POST /calendars -> create. A created resource should answer 201 (Nest's @Post does it by default).
  // TODO: DELETE /calendars/:id -> remove, answer 204 (see @HttpCode in AuthController.logout).
  // TODO: PATCH /calendars/:id -> update.
  //       Hint: ParseUUIDPipe in @Param('id', ParseUUIDPipe) rejects ids that are not UUIDs with a 400
  //       before your code runs; @Param reads a path segment, @Patch declares the verb.
  // User comes from @CurrentUser(). The controller does not check roles: that is the service's job.
}
```

**Проверка:** модули зарегистрированы (`CalendarsModule` в `imports` у `AppModule`), `npm run back` стартует. В Swagger UI: `GET /calendars` возвращает твой личный календарь с `role: "OWNER"` и `name: ""`. `POST` с пустым именем даёт `400`, с цветом не из списка тоже `400`. `PATCH` и `DELETE` чужого (случайного) UUID дают `404`.

---

## Шаг 4. Модуль `events`

**Что:** `GET /api/calendars/:calendarId/events?from=&to=`, `POST /api/calendars/:calendarId/events`, `PATCH /api/events/:id`, `DELETE /api/events/:id`.

```bash
cd apps/backend
npx nest g module events && npx nest g service events --flat && npx nest g controller events --flat
```

`EventsModule` импортирует `CalendarsModule` (там экспорт сервиса доступа).

### 4.0. Миграция `completedAt`

В модель `Event` в `schema.prisma` добавь необязательное поле `completedAt` с типом `DateTime?` и `@db.Timestamptz(3)`, как у остальных дат (комментарий: `null` = не выполнено). Затем `npm run prisma:migrate -- --name add_event_completed_at`. Клиент пересоздастся сам, но если типы не обновились, запусти `npm run prisma:generate`.

**Почему дата, а не boolean.** Тот же флаг «выполнено», но с моментом отметки: бесплатно получаем «когда выполнил» для будущих отчётов, а цена нулевая. API при этом простой: клиент шлёт `completed: true/false`, а сервер сам ставит время.

**Файлы:** `events.constants.ts`, `create-event.dto.ts`, `update-event.dto.ts`, `events-range.dto.ts` (query), `event.dto.ts` (ответ), `events.service.ts`, `events.controller.ts`.

### 4.1. Константы и DTO

```ts
// events.constants.ts
// TODO: TITLE_MAX (e.g. 200), DESCRIPTION_MAX (e.g. 5000),
//       RANGE_MAX_DAYS (the widest range one request may ask for: a 6-week month grid is 42 days, give some room),
//       RANGE_MAX_ITEMS (hard take for the query, a safety net on top of the range limit).
```

```ts
export class CreateEventDto {
  // TODO: title: string, not empty, max TITLE_MAX.
  // TODO: description: optional string, max DESCRIPTION_MAX.
  // TODO: startAt: ISO 8601 string. Hint: @IsISO8601 checks the format; with { strict: true } it also rejects impossible dates.
  // TODO: endAt: optional ISO 8601 string.
  // TODO: allDay: optional boolean.
  // TODO: completed: optional boolean (the client sends a flag, the server turns it into completedAt).
}

// TODO: UpdateEventDto: all fields optional (PartialType again).
//       The client can send endAt: null or description: null to clear them: @IsOptional lets null through.

export class EventsRangeDto {
  // TODO: from and to: ISO 8601 strings, both required.
  //       Hint: @Query() fills this DTO from the query string; the ValidationPipe checks it like a body.
}

export class EventDto {
  // TODO: id, calendarId, title, description (string | null), startAt, endAt (| null), allDay,
  //       completedAt (| null), createdAt, updatedAt.
  //       Date fields are typed Date here; JSON turns them into ISO strings.
}
```

### 4.2. Договорённости о датах

Обычные события: `startAt`/`endAt` это мгновения (ISO с `Z` или смещением).

События на весь день (решение 1): `startAt` и, если есть, `endAt` строго **полночь UTC**; `endAt` эксклюзивный. Событие без `endAt` занимает один день.

Правила, которые нельзя выразить декораторами одного поля, проверяет сервис (они зависят от нескольких полей, а при `PATCH` ещё и от того, что уже лежит в БД):

- `endAt`, если задан, строго позже `startAt`;
- при `allDay = true` обе даты ровно в полночь UTC.

При ошибке: `BadRequestException` с понятным сообщением.

### 4.3. Выборка за диапазон

Самое хрупкое место: границы. Условие попадания в период `[from, to)`:

- событие начинается **строго до** `to`;
- и либо у него есть `endAt` и он заканчивается **строго после** `from`, либо `endAt` нет и `startAt >= from`.

**Почему «строго после `from`», а не «не раньше», как написано в `03-data-model.md`.** Конец у многодневных событий на весь день эксклюзивный. Событие 28–30 сентября хранится как `endAt = 1 октября 00:00`. Запрос за октябрь имеет `from = 1 октября 00:00`. Условие «`endAt >= from`» подтянет это событие в октябрь, хотя в октябре у него нет ни одного дня. Условие «`endAt > from`» верное для обоих типов событий. После реализации поправь формулировку в `03-data-model.md`.

Повторяющихся событий пока нет (`recurrenceRule` в схеме появится на этапе 4), поэтому добавлять условия для них не нужно.

### 4.4. Сервис

```ts
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  async listRange(userId: string, calendarId: string, query: EventsRangeDto): Promise<EventDto[]> {
    // TODO 1: requireRole(VIEWER) first.
    // TODO 2: parse from/to to Date. Throw BadRequestException when: from is not before to,
    //         or the range is wider than RANGE_MAX_DAYS. (date-fns is not in the backend yet; plain arithmetic
    //         on milliseconds is enough for one comparison, do not add a dependency for it.)
    // TODO 3: query the events of this calendar by the rule from 4.3, sorted by startAt, limited by RANGE_MAX_ITEMS.
    //         Hint: in a Prisma where you combine conditions with AND / OR, and compare dates with lt / gt / gte.
    //         The existing index (calendarId, startAt) serves this query.
    // TODO 4: return them as EventDto[].
  }

  async create(userId: string, calendarId: string, dto: CreateEventDto): Promise<EventDto> {
    // TODO 1: requireRole(EDITOR).
    // TODO 2: parse the dates, run assertDates (below).
    // TODO 3: create the event with calendarId from the URL (never from the body: the DTO has no such field).
    //         completed: true -> completedAt = now, otherwise null.
  }

  async update(userId: string, id: string, dto: UpdateEventDto): Promise<EventDto> {
    // TODO 1: requireEventRole(EDITOR): it also gives you the current event.
    // TODO 2: build the resulting startAt / endAt / allDay: dto value if present, else the stored one.
    //         Careful: endAt: null in the dto means "clear it", undefined means "leave as is".
    // TODO 3: assertDates on the RESULT, not on the dto alone
    //         (moving a stored all-day event to a time, or changing only startAt past the stored endAt, must fail too).
    // TODO 4: completed: true -> completedAt = now, but ONLY if the stored one is null (a repeated "true" must not
    //         move the time); false -> null; undefined -> leave as is.
    // TODO 5: update and return. The calendar of an event never changes: do not let calendarId in.
  }

  async remove(userId: string, id: string): Promise<void> {
    // TODO: requireEventRole(EDITOR), then delete. Hint: deleteMany by id does not fail if the row
    //       is already gone (the same reason SessionService.delete uses it): a repeated DELETE is harmless.
  }

  private assertDates(startAt: Date, endAt: Date | null, allDay: boolean): void {
    // TODO: the two rules from 4.2. BadRequestException with a clear message on violation.
  }
}
```

### 4.5. Контроллер

Маршруты принадлежат двум разным префиксам (`calendars/:calendarId/events` и `events/:id`), поэтому контроллер объявляется **без префикса**, а полный путь пишется в декораторах методов.

```ts
@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // TODO: GET calendars/:calendarId/events        -> listRange  (@Query() EventsRangeDto)
  // TODO: POST calendars/:calendarId/events       -> create
  // TODO: PATCH events/:id                        -> update
  // TODO: DELETE events/:id                       -> remove, answer 204 (see @HttpCode in AuthController.logout)
  // Every id param goes through ParseUUIDPipe.
}
```

**Проверка:** сборка и старт без ошибок, в Swagger UI видны маршруты и у `EventDto` и `EventsRangeDto` есть поля (подробный список проверок в шаге 5).

---

## Шаг 5. Ручная проверка бэкенда

Тестов нет по решению проекта, поэтому проверка сценариями. Нужны два пользователя: ты и второй тестовый аккаунт из списка Google Test users (или вторая запись `User`, добавленная в `prisma:studio` вместе с `Session`... но проще войти вторым аккаунтом).

| Сценарий                                                                           | Ожидание                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| Без cookie любой маршрут                                                           | 401                                              |
| `GET /calendars` у двух пользователей                                              | у каждого только свой календарь                  |
| `GET`, `PATCH`, `DELETE /calendars/:id` чужого календаря                           | 404                                              |
| Роль `EDITOR` (через `prisma:studio`): `PATCH` и `DELETE` календаря                | 403                                              |
| `DELETE` своего календаря с событиями                                              | 204, события и участие исчезли (проверь в `prisma:studio`) |
| `PATCH { completed: true }` дважды подряд                                          | `completedAt` не меняется на втором запросе      |
| `PATCH { completed: false }`                                                       | `completedAt` равен `null`                       |
| Пользователь B читает события календаря A                                          | 404, не 403                                      |
| Пользователь B делает `PATCH /events/:id` по id события из календаря A             | 404                                              |
| В `prisma:studio` сменить свою роль в календаре на `VIEWER`: `POST` события        | 403, `GET` работает                              |
| Событие 28–30 сентября на весь день, запрос с `from = 1 октября`                   | не возвращается                                  |
| То же событие, запрос с `from = 30 сентября`                                       | возвращается                                     |
| Событие без `endAt`, начало ровно в `from`                                         | возвращается; в `to` ровно: нет                  |
| `from >= to`, диапазон шире лимита, не-ISO строка                                  | 400                                              |
| `allDay: true` с временем не в полночь UTC                                         | 400                                              |
| `PATCH` только `startAt` позже сохранённого `endAt`                                | 400                                              |
| `PATCH { endAt: null }`                                                            | конец очищен                                     |
| `POST` с лишним полем `calendarId` в теле                                          | поле проигнорировано (событие в календаре из URL) |
| Повторный `DELETE`                                                                 | 204 оба раза                                     |

После проверки верни роль `OWNER`.

---

## Шаг 6. Фронтенд: цвета календаря и ключи переводов

**Что:** палитра цветов календаря в токенах и заготовка ключей переводов для всего этапа.

**Палитра (решение 2).** В `src/styles/_tokens.scss` завести токены вида `--calendar-color-<ключ>` для каждого ключа из `CALENDAR_COLORS`, **значения для обеих тем** (светлая на `:root`, тёмная на `:root[data-theme='dark']`). Если цвет используется как фон с текстом, нужен парный токен `--color-on-*`. Проверь оба режима глазами.

**Переводы.** Ключи добавляются сразу в **три** файла `public/i18n/{ru,en,es}.json` по мере появления в шагах 7–13: наборы должны совпадать. Предлагаю корни `calendars.*` (экран плиток, название личного календаря, диалог календаря, названия цветов), `calendar.*` (страница календаря), `event.*` (диалог и карточка).

**Проверка:** переключение темы меняет цвета образцов (можно временно вывести квадратики на странице календаря и убрать).

---

## Шаг 7. Маршруты и экран выбора календаря

**Что:** после входа открывается экран с плитками календарей. Клик по плитке ведёт на `/calendars/:id`. В шапке на странице календаря появляется кнопка «К календарям».

**Почему выбранный календарь в адресе, а не в состоянии.** `/calendars/<id>` можно обновить, открыть в другой вкладке, вернуться «назад» браузера. Не нужен ни общий сервис, ни `localStorage`: страница календаря берёт id из маршрута и сама запрашивает данные. Это проще, чем хранить «выбранный» календарь, и именно так работают закладки браузера.

### 7.1. Маршруты

- В `routePaths` (`core/constants/routePaths.ts`) вместо `calendar` заведи `calendars` (`/calendars`, экран плиток) и путь страницы календаря с параметром.
- В `app.routes.ts` оба маршрута внутри `MainLayout`, под `authGuard`. `''` перенаправляет на `calendars`.
- Проверь, куда ведут `guestGuard` и страница входа после успешного входа: должно быть `calendars`.
- Чтобы получить `:id` во входном параметре компонента, включи привязку параметров маршрута к `input()`. Подсказка: `withComponentInputBinding()` в `provideRouter` в `app.config.ts`. Альтернатива: `ActivatedRoute`, но она даёт Observable, а входной параметр сразу signal и удобнее для `rxResource`.

### 7.2. Экран плиток

Новая страница `features/calendar/pages/calendars/calendars.ts`. Данные страницы грузит `rxResource`, без общего сервиса.

```ts
export class Calendars {
  private readonly api = inject(/* the generated calendars service, step 8 */);

  readonly calendars = rxResource({
    stream: () => {
      // TODO: the list of calendars from the API.
    },
  });
  // TODO: tile click -> navigate to the calendar page (Router with the path from routePaths).
  // TODO: "+" tile -> opens the calendar dialog (step 13).
}
```

Шаблон:
- Плитка календаря: имя (пустое имя заменяется переводом «Личный календарь»), цветная полоса или фон цвета календаря из токенов, парный `--color-on-*` для текста на цвете.
- Последней идёт плитка «+». У `VIEWER`-календарей плитка обычная, создавать новые можно всегда.
- Пока грузится: заглушка. Ошибка: сообщение через `SnackbarService`. Календарей нет: видна только плитка «+».
- Только токены, обе темы. Тексты через Transloco.

### 7.3. Кнопка в шапке

В `Header` на странице календаря показывай кнопку «К календарям» (ведёт на `/calendars`) и имя текущего календаря. Как шапка узнаёт, что она на странице календаря, выбери сам (данные маршрута, или страница кладёт имя в простой общий signal) и объясни выбор. Дешевле всего первое.

**Проверка:** вход ведёт на `/calendars`, виден «Личный календарь» и плитка «+». Клик по плитке открывает `/calendars/<id>` (пока пустая страница). Обновление страницы остаётся на том же календаре. Кнопка в шапке возвращает на плитки.

---

## Шаг 8. Клиент API из OpenAPI

**Что:** сгенерировать из спецификации бэкенда типы и методы для Angular, чтобы не описывать их вручную (правило из `CLAUDE.md`).

**Что нужно решить (и это новая зависимость, её нужно обосновать):** какой генератор. Критерии выбора:

- умеет Angular `HttpClient` и отдаёт `Observable` (у нас методы возвращают Observable);
- работает с Angular 22 и не ломает стиль проекта (`@Service()`, standalone);
- генерируется одной командой из URL спецификации (`http://localhost:3000/api/docs-json`), лежит в devDependencies, результат в понятной папке.

**Кандидаты** (по беглому поиску, совместимость с Angular 22 ни у одного не подтверждена, это надо проверять перед установкой по их README и changelog): [ng-openapi-gen](https://github.com/cyclosproject/ng-openapi-gen) (заточен именно под Angular, генерирует отдельные функции и один сервис `Api`), [Orval](https://orval.dev/docs/guides/angular) (может генерировать сервисы на `HttpClient` или на `httpResource`), hey-api/openapi-ts (в поиске не нашёлся, смотреть в его документации). Выбери, обоснуй, потом ставь. Если захочешь, я сверю детали по документации вместе с тобой.

**Куда генерировать и коммитить ли.** Рекомендую `src/app/core/api/`, добавить в `.gitignore` (как клиент Prisma) и запускать скриптом `npm run api:gen` из `apps/frontend`. Минус: нужен работающий бэкенд при генерации. Реши, подходит ли тебе это, или лучше коммитить результат.

**Правило работы.** После любой правки DTO или ответа на бэкенде: перезапусти бэкенд, запусти `npm run api:gen`, проверь `npm run build`. Ошибки типов покажут, что на фронтенде сломалось.

**Проверка:** в сгенерированных типах есть календарь и событие (имена по генератору) и методы для маршрутов из шагов 3–4, у ответов нет `any`. Ниже в гайде события названы `ApiEvent`, а запросы создания `CreateEventPayload`: подставь реальные имена генератора (или заведи псевдонимы в одном файле).

**Нужен ли свой `EventsApi`-сервис поверх?** Если сгенерированные методы отдают `Observable` и принимают простые параметры, **они и есть сервис-API**, оборачивать их не нужно (пока не появится причина). Преобразование API ↔ FullCalendar (см. шаг 9) живёт в отдельных функциях-мапперах, а не в слое запросов.

---

## Шаг 9. Страница календаря: события из API и навигация

**Что:** месячный вид на всю высоту, понедельник первым, русская локаль, события приходят из API за видимый диапазон, листание кнопками и «Сегодня».

**Про FullCalendar v7.** Сверяйся с документацией v7, не с туториалами (почти все они под v6). В этом шаге пять вещей, которые нужно проверить по докам v7: как задать локаль, как выставить первым днём понедельник, какой колбэк сообщает о смене видимых дат (у v6 это `datesSet`), как задать динамические события (функция-источник или реактивное обновление опций) и что приходит в аргументе (в v7 даты могут быть `Temporal`-объектами, а не `Date`; помни правило проекта: в состоянии только ISO-строки).

### 9.1. Загрузка

Данные страницы грузит `rxResource` в компоненте (`01-stack.md`). Календарь определяется адресом (шаг 7). Для страницы два ресурса: сам календарь (имя, роль, цвет) и его события за видимый диапазон. При смене параметров запрос повторяется, а устаревший отменяется.

```ts
export class Calendar {
  readonly id = input.required<string>(); // bound from the route (step 7.1)
  // the generated calendars and events services from step 8: inject them here

  readonly calendar = rxResource({
    params: () => this.id(),
    stream: ({ params }) => {
      // TODO: GET the calendar by id (name, role, color).
    },
  });
  readonly canEdit = computed(() => {
    // TODO: true when the calendar's role is OWNER or EDITOR. The UI uses it to hide "+", disable drag and the like.
    //       This is a convenience for the user: the backend checks the role anyway.
  });

  readonly range = signal<{ from: string; to: string } | null>(null); // ISO strings

  readonly events = rxResource({
    params: () => {
      // TODO: return { calendarId, from, to } when both the id and the range are known,
      //       otherwise undefined (the resource then stays idle and does not request).
    },
    stream: ({ params }) => {
      // TODO: ask the API for the events of that calendar in that range. Returns an Observable.
    },
  });

  // TODO: the FullCalendar options (plugins, month view, Monday first, ru locale, fill the parent's height).
  //       When the visible dates change, write the new range into `range` as ISO strings.
}
```

**На что смотреть при проверке:**

- Что делает `events.value()` на время загрузки после смены `params`? Если оно становится `undefined`, события на секунду пропадут при каждом листании, и это будет выглядеть как мигание. Посмотри в документации Angular по `resource`, как этого избежать (например, помнить последнее значение в `computed`/`linkedSignal`).
- Запрос не должен уходить, пока диапазон не известен. Переход на другой календарь (другой `:id`) перезапрашивает события.
- Календарь по чужому или несуществующему id отвечает `404`: страница показывает понятное сообщение или уводит на `/calendars`, а не остаётся пустой.
- Ошибка загрузки: `events.error()` показывается пользователю через `SnackbarService` с переведённым текстом, а не молча.
- Быстрое листание: устаревший запрос отменяется (это даёт `rxResource`, убедись в Network).

### 9.2. Маппер

Одна пара функций в `features/calendar/utils/event.mapper.ts`, единственное место, где API ↔ FullCalendar.

```ts
export function toCalendarEvent(event: ApiEvent): EventInput {
  // TODO: API event -> FullCalendar input. Neutral card (no own colour, see 04-calendar-frontend.md); completed comes from completedAt.
  //       For allDay events FullCalendar wants a plain date (YYYY-MM-DD) and an exclusive end: the API already
  //       stores exactly that (decision 1), so cut the ISO strings to the date part.
  //       For timed events pass the ISO instants as they are.
}
```

**Проверка:** событие, созданное в Swagger UI (или в `prisma:studio`), появляется на нужной дате; многодневное событие на весь день рисуется полосой на нужное число дней, а не на день больше или меньше (если на день больше: конец не эксклюзивный где-то по пути). Перелистывание вперёд и назад подгружает события. «Сегодня» возвращает к текущему месяцу.

### 9.3. Навигация

Свои кнопки на панели над календарём (Material, переведённые подписи): «назад», «вперёд», «Сегодня», заголовок текущего месяца. Они вызывают методы API компонента календаря (`prev`, `next`, `today`; как получить ссылку на календарь в Angular-обёртке v7, смотри в доках обёртки). Заголовок месяца берётся из данных календаря и обновляется при смене дат. Цвет календаря показывается акцентом в этой панели.

---

## Шаг 10. Диалог события, «+» на дате и «выполнено»

**Что:** диалог создания и редактирования (Material), выбор дат через datepicker, кнопка «+» на дате.

### 10.1. Зависимости

- `date-fns` (по `01-stack.md`) для вычислений с датами: `npm i date-fns` в `apps/frontend`.
- Datepicker Material требует **адаптер дат**. Подсказка: `provideNativeDateAdapter()` подключает встроенный адаптер на `Date`, отдельный пакет не нужен. `Date` при этом живёт только внутри значения формы, а в состоянии приложения и в API везде ISO-строки. Конвертация на границе диалога.
- Локаль datepicker по выбранному языку: этап 5.

### 10.2. Контракт диалога

```ts
export type EventDialogData =
  | { mode: 'create'; date: string } // date: ISO date of the clicked cell
  | { mode: 'edit'; event: ApiEvent };

export type EventDialogResult =
  | { action: 'save'; value: CreateEventPayload } // the request type from step 8
  | { action: 'delete' }
  | undefined; // cancelled
```

Диалог **не ходит в API сам**: он возвращает результат, а страница календаря выполняет запрос и обновляет данные. Так откат, ошибки и локальное обновление остаются в одном месте, а диалог легко править. Открывается через `MatDialog` (по образцу `DialogService`).

### 10.3. Форма

Поля: название (обязательное), описание, «выполнено», «на весь день», начало (дата и время), окончание (дата и время). Время: нативный `<input type="time">`, отдельная библиотека не нужна. При `allDay` поля времени скрыты.

```ts
export class EventDialog {
  // TODO: the form. Pick the approach yourself (reactive forms or Angular 22 signal forms) and check it in the Angular 22 docs;
  //       be ready to explain the choice. Validation: title is required, the end is not before the start.
  // TODO: on create, the start date is the clicked date; on edit the form is filled from the event.
  // TODO: submit -> build the payload (see the trap below) and close with { action: 'save', value }.
}
```

**Ловушка с концом на весь день.** В форме пользователь выбирает **последний день включительно** (так он думает). В API конец эксклюзивный (решение 1). Значит, при отправке `allDay`-события конец сдвигается на `+1 день`, при открытии существующего `-1 день`. Это единственное место в приложении, где конец сдвигается. Вынеси обе операции в две функции рядом с маппером и используй `date-fns`.

Другая ловушка: даты `allDay` это «календарные даты без пояса». Собирая `startAt`, не создавай полночь **локального** пояса и не вызывай `toISOString()`: в поясе восточнее UTC получится предыдущий день. Бери год, месяц и день выбранной даты и строй полночь UTC.

### 10.4. Кнопка «+»

В v7 проверь по документации, как вставить свою разметку в ячейку дня (в roadmap это помечено «проверить»). Запасной вариант: клик по пустой дате (`dateClick` из плагина interaction) открывает диалог создания, а «+» появляется на hover как оформление ячейки. Показывай «+» и разрешай создание, только если `canEdit()`. Клик по событию (`eventClick`) открывает диалог редактирования.

### 10.5. Галочка «выполнено» на карточке

Отметка нужна у каждого события (решение 4). На карточке слева от названия маленький чекбокс, выполненное событие приглушено и зачёркнуто (цвета и перечёркивание через токены, оба режима темы).

- Проверь по документации v7, как задать содержимое карточки (`eventContent` в roadmap), и как получить в нём данные события. Карточка из spike этапа 0 уже есть, продолжай её.
- Клик по чекбоксу **не открывает диалог**: останови всплытие, иначе сработает `eventClick`.
- Переключение это оптимистичное обновление, как перенос в шаге 11: сначала меняем локально, потом `PATCH { completed }`, при ошибке возвращаем назад и показываем сообщение. Общий код с шагом 11 выноси в один метод страницы.
- У `VIEWER` чекбокс отключён (`canEdit()`).
- Подпись для скринридера: у чекбокса должен быть переведённый `aria-label`.

### 10.6. Сохранение

После закрытия диалога страница делает запрос. Для создания и правки: на успех обновить `events` локально (`events.update(...)`, без полной перезагрузки списка), на ошибку показать `SnackbarService.error` с переводом. Диалог при ошибке закрыт, поэтому введённое пользователем пропадёт: подумай, как это смягчить (например, не закрывать диалог, пока запрос не завершился). Это твоё решение, объясни выбор.

**Проверка:** создание события кликом по дате, редактирование по клику на событие, многодневное событие на весь день сохраняется и показывается ровно на выбранные дни, событие со временем сохраняет время, у `VIEWER` нет «+», нет сохранения и чекбокс отключён. Отметка «выполнено» ставится с карточки и из диалога, держится после перезагрузки и откатывается при ошибке сети. В Network нет повторной полной перезагрузки после сохранения.

---

## Шаг 11. Drag-and-drop и ресайз

**Что:** перенос события на другую дату и изменение длительности, с оптимистичным обновлением и откатом.

**Идея.** FullCalendar при перетаскивании уже показал событие на новом месте. Твоя задача: отправить изменение и, если сервер отказал, вернуть событие назад. В колбэках переноса и ресайза аргумент содержит функцию `revert()` для этого. Проверь по докам v7 точные названия колбэков и поля аргумента (в v6 это `eventDrop` и `eventResize`).

```ts
// editable only when canEdit()
onEventChanged(arg: /* drop or resize argument, check v7 types */): void {
  // TODO 1: build the PATCH payload from the new start/end/allDay of arg.event
  //         (the reverse of the mapper; remember an all-day end is already exclusive on both sides).
  // TODO 2: send it. On success, update the event in `events` locally.
  // TODO 3: on error -> arg.revert() and SnackbarService.error with a translated message.
  // Watch for: a timed event dragged into the all-day row (allDay changes) and back.
}
```

**На что смотреть:**

- Что уходит в `PATCH` при переносе всего-дневного события: `startAt`, `endAt` (если есть) и `allDay`. Конец не должен «уехать» на день.
- Подписка с обработкой ошибки обязательна (правило проекта), `takeUntilDestroyed` или оператор, который сам завершается.
- Перенос на соседний месяц: из-за прокрутки это уже проверено в spike (этап 0); убедись, что запрос и откат работают и там.
- Сеть выключена (DevTools → Offline): событие возвращается на место и показывается ошибка.

---

## Шаг 12. Удаление с отменой

**Что:** удалить событие из диалога, показать уведомление «Удалено» с кнопкой «Отменить»; запрос `DELETE` уходит только после закрытия уведомления (`03-data-model.md`, «Удаление»).

**Зачем так.** Окончательное удаление без корзины опасно. Откладывая запрос, мы получаем отмену бесплатно: пока уведомление видно, на сервере ничего не изменилось. Если вкладку закрыть раньше, событие просто останется, это безопасная сторона.

**Что нужно доработать в `SnackbarService`.** Сейчас его методы ничего не возвращают и умеют только кнопку-крестик (`'✕'`). Нужен метод, который показывает уведомление с **действием** и сообщает, закрылось ли оно кнопкой действия или само. Подсказка: `MatSnackBar.open` возвращает `MatSnackBarRef`; у него есть `afterDismissed()` с флагом `dismissedByAction`. Стиль уведомления (`app-snack-bar--*`) и конфиг не меняй. Сделай метод, не ломающий существующие четыре.

```ts
// SnackbarService: add a method with an action. Return an Observable<boolean> (true = the action was pressed).

// Calendar page
onDelete(event: ApiEvent): void {
  // TODO 1: remove the event from `events` locally (the user sees it disappear at once).
  // TODO 2: show the snackbar with "Undo".
  // TODO 3: undo pressed -> put the event back locally, no request.
  // TODO 4: dismissed without undo -> send DELETE; on error put the event back and show an error.
}
```

**Крайние случаи для обдумывания:** два удаления подряд (второе уведомление заменит первое: что станет с запросом первого? он должен уйти, а не потеряться); навигация на другой месяц, пока уведомление ещё висит.

**Проверка:** удалить, нажать «Отменить»: событие вернулось, в Network нет `DELETE`. Удалить и подождать: `DELETE` ушёл один раз. Удалить два события подряд: оба удалены на сервере.

---

## Шаг 13. Диалог календаря: создание, цвет, удаление

**Что:** на экране плиток (шаг 7) плитка «+» создаёт календарь, у существующей плитки можно сменить название и цвет и удалить календарь.

- Один небольшой диалог «Календарь»: название и выбор цвета из палитры (`CALENDAR_COLORS`). Используется и для создания (`POST`), и для правки (`PATCH`). Как и диалог события, он **не ходит в API сам**, а возвращает результат странице.
- Правка и удаление только для `OWNER`: у остальных пунктов меню на плитке нет. Это удобство, бэкенд всё равно ответит `403`.
- Меню на плитке (три точки, на hover или всегда) с пунктами «Изменить» и «Удалить». Клик по самой плитке открывает календарь, поэтому меню останавливает всплытие клика.
- **Удаление** идёт через `DialogService.confirm` (он уже есть). Текст подтверждения прямо говорит, что события календаря удалятся безвозвратно. Здесь нет отмены как у события: календарь с событиями слишком большая потеря, подтверждения достаточно.
- После успешного ответа список плиток обновляется локально (`calendars.update(...)`), без перезагрузки. Создание нового календаря сразу открывает его.
- Подписи цветов переводятся, цвета берутся из токенов (шаг 6), не из hex в шаблонах.

**Проверка:** создать второй календарь, открыть его и вернуться: события календарей не смешиваются. Сменить цвет: плитка обновилась в обеих темах. Удалить календарь с событиями: подтверждение, плитка исчезла, через `prisma:studio` событий нет. Удалить последний календарь: остаётся только «+», создание нового работает.

---

## Шаг 14. Сквозная проверка этапа

Пройди сценарии руками, в обеих темах и на всех трёх языках (без захардкоженных строк в шаблонах).

1. Вход → экран плиток с «Личный календарь» и «+». Клик по плитке: пустой месяц на всю высоту, неделя начинается с понедельника.
2. Создание обычного события, события на весь день и многодневного. Все видны на своих датах после перезагрузки страницы.
3. Листание по месяцам, «Сегодня». Многодневное событие на стыке месяцев видно в обоих.
4. Перенос и ресайз, затем откат при выключенной сети.
5. Удаление с отменой и без.
6. Второй календарь: создание, цвет, возврат на плитки кнопкой в шапке, удаление (в том числе последнего). Второй пользователь не видит ничего чужого.
7. `VIEWER` (роль из `prisma:studio`): интерфейс без «+», без переноса, сохранения и отметки «выполнено», бэкенд всё равно отвечает 403.
8. Набор ключей во всех трёх `i18n` одинаков, `npm run lint` и `npm run format:check` чистые, `npm run build` в обоих приложениях проходит.

После этого в `07-tasks.md` отмечаются пункты этапа 2 (пункт про сайдбар заменяется экраном плиток, добавляются «выполнено» и удаление календаря), а в `03-data-model.md` исправляется формулировка про границу диапазона (шаг 4.3), и `completedAt` переходит из порции 3 в применённые.
