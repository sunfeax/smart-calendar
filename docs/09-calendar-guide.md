# Гайд: календарь на API (бэкенд + фронтенд)

Пособие для этапа 2 из `06-roadmap.md`. Каждый шаг объясняет, **что** делаем, **почему** именно так и **как**, и заканчивается проверкой. Код дан каркасами: сигнатуры и структура готовы, а то, что пишешь ты, помечено комментариями `// TODO`. В них описана цель и критерий, а подсказка («Подсказка: …») дана только для API, которого в проекте ещё не было. Готового кода в TODO нет: его пишешь сам. Пока каркас не дописан, TypeScript ругается на отсутствующий `return`: это нормально. Схема API: `05-backend-auth.md`, схема БД и правила: `03-data-model.md`.

Читать по порядку: каждый шаг опирается на предыдущие. Образец стиля, на который стоит оглядываться: `apps/backend/src/session/session.service.ts` и `apps/backend/src/user/user.service.ts`.

**Статус:** схема Prisma и миграция есть (`Calendar`, `CalendarMember`, `Event`). Всё остальное в этом гайде ещё не сделано.

## Решения, которые нужны от тебя до старта

Эти вопросы не закрыты в `08-open-questions.md`, но от них зависит код. Ниже моя рекомендация по каждому, но решаешь ты.

1. **События «на весь день»: как хранить конец.** Рекомендую хранить ровно так, как отдаёт и ждёт FullCalendar: `startAt` = полночь UTC первого дня, `endAt` = полночь UTC дня **после** последнего (эксклюзивный конец). Тогда между API и календарём конвертировать нечего, а единственное место, где конец сдвигается на день, это диалог (пользователь выбирает последний день включительно). Альтернатива (хранить последний день включительно) заставит сдвигать конец в каждом месте, где событие едет в календарь или обратно.
2. **Цвет календаря.** Рекомендую хранить **ключ палитры** (`blue`, `green`...), как для тегов, а не hex: так работают обе темы. Палитру из ~8 цветов нужно будет завести токенами в `_tokens.scss` (по паре на тему), этап 3 её переиспользует. Если выберешь hex, придётся потом переделывать.
3. **Удаление календаря.** В этот гайд не входит: в `07-tasks.md` его нет, а ему нужны решения (можно ли удалить последний календарь, какое подтверждение, что с событиями). Бэкенд делает `GET`, `POST`, `PATCH` календарей. Вернёмся, когда появятся общие календари.
4. **Поле «выполнено».** В roadmap оно упомянуто в диалоге, но колонки `completedAt` в схеме ещё нет (порция 3 в `03-data-model.md`). В гайд не включаю: добавим миграцией, когда скажешь.
5. **Генератор клиента из OpenAPI.** Конкретный инструмент выбираем на шаге 8: нужна проверка совместимости с Angular 22, это новая зависимость и её надо обосновать.

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
3. **Фронтенд не дублирует типы.** Типы запросов и ответов приходят из OpenAPI. Поэтому ответы бэкенда описываются **классами**, а не `interface` (Swagger не видит интерфейсы). Это касается и существующего `UserProfile`.
4. **Даты везде ISO-строки.** На бэкенде `Date` допустим, в состоянии фронтенда нет.
5. **Все списки ограничены.** События: диапазон дат (не шире N дней) плюс жёсткий `take`. Календари: `take`.

### Карта шагов

| Шаг | Где      | Результат                                                    |
| --- | -------- | ------------------------------------------------------------ |
| 1   | бэкенд   | Swagger, `/api/docs`, ответы классами                        |
| 2   | бэкенд   | `CalendarAccessService`: членство и роль                     |
| 3   | бэкенд   | модуль `calendars`: список, создание, правка                 |
| 4   | бэкенд   | модуль `events`: выборка за диапазон, создание, правка, удаление |
| 5   | бэкенд   | ручная проверка доступа и границ диапазона                   |
| 6   | фронтенд | цвета календаря в токенах, ключи переводов                   |
| 7   | фронтенд | раскладка с сайдбаром, состояние выбранного календаря        |
| 8   | фронтенд | клиент API из OpenAPI                                        |
| 9   | фронтенд | страница календаря: события из API, навигация                |
| 10  | фронтенд | диалог события, «+» на дате                                  |
| 11  | фронтенд | drag-and-drop, ресайз, откат                                 |
| 12  | фронтенд | удаление с отменой                                           |
| 13  | фронтенд | переключатель календарей и цвет                              |
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

## Шаг 3. Модуль `calendars`: список, создание, правка

**Что:** `GET /api/calendars`, `POST /api/calendars`, `PATCH /api/calendars/:id`.

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

Ключи цвета: список строк из решения 2 выше (`CALENDAR_COLORS`), по нему же валидируем. Лимит имени, например 100 символов.

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

**Почему в ответе есть `role`.** Фронтенду нужно знать, что можно показывать: `VIEWER` не должен видеть кнопку «+». Роль живёт в `CalendarMember`, а не в `Calendar`, поэтому сервис отдаёт «календарь плюс моя роль».

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

  async create(userId: string, dto: CreateCalendarDto): Promise<CalendarDto> {
    // TODO: create the calendar and the OWNER membership for this user in one nested create,
    //       the same way UserService.upsertFromGoogle does it. Map to CalendarDto.
  }

  async update(userId: string, id: string, dto: UpdateCalendarDto): Promise<CalendarDto> {
    // TODO 1: only OWNER may change settings: requireRole first, before any write.
    // TODO 2: update the calendar from the dto. A field that is undefined is not touched by Prisma,
    //         null clears it, so passing the dto fields as they are works.
    // TODO 3: return CalendarDto with the role from the membership you got in TODO 1.
  }
}
```

### 3.3. Контроллер

```ts
@Controller('calendars')
export class CalendarsController {
  constructor(private readonly calendars: CalendarsService) {}

  // TODO: GET /calendars -> list
  // TODO: POST /calendars -> create. A created resource should answer 201 (Nest's @Post does it by default).
  // TODO: PATCH /calendars/:id -> update.
  //       Hint: ParseUUIDPipe in @Param('id', ParseUUIDPipe) rejects ids that are not UUIDs with a 400
  //       before your code runs; @Param reads a path segment, @Patch declares the verb.
  // User comes from @CurrentUser(). The controller does not check roles: that is the service's job.
}
```

**Проверка:** модули зарегистрированы (`CalendarsModule` в `imports` у `AppModule`), `npm run back` стартует. В Swagger UI: `GET /calendars` возвращает твой личный календарь с `role: "OWNER"` и `name: ""`. `POST` с пустым именем даёт `400`, с цветом не из списка тоже `400`. `PATCH` чужого (случайного) UUID даёт `404`.

---

## Шаг 4. Модуль `events`

**Что:** `GET /api/calendars/:calendarId/events?from=&to=`, `POST /api/calendars/:calendarId/events`, `PATCH /api/events/:id`, `DELETE /api/events/:id`.

```bash
cd apps/backend
npx nest g module events && npx nest g service events --flat && npx nest g controller events --flat
```

`EventsModule` импортирует `CalendarsModule` (там экспорт сервиса доступа).

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
}

// TODO: UpdateEventDto: all fields optional (PartialType again).
//       The client can send endAt: null or description: null to clear them: @IsOptional lets null through.

export class EventsRangeDto {
  // TODO: from and to: ISO 8601 strings, both required.
  //       Hint: @Query() fills this DTO from the query string; the ValidationPipe checks it like a body.
}

export class EventDto {
  // TODO: id, calendarId, title, description (string | null), startAt, endAt (| null), allDay, createdAt, updatedAt.
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
  }

  async update(userId: string, id: string, dto: UpdateEventDto): Promise<EventDto> {
    // TODO 1: requireEventRole(EDITOR): it also gives you the current event.
    // TODO 2: build the resulting startAt / endAt / allDay: dto value if present, else the stored one.
    //         Careful: endAt: null in the dto means "clear it", undefined means "leave as is".
    // TODO 3: assertDates on the RESULT, not on the dto alone
    //         (moving a stored all-day event to a time, or changing only startAt past the stored endAt, must fail too).
    // TODO 4: update and return. The calendar of an event never changes: do not let calendarId in.
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

**Проверка:** сборка и старт без ошибок, в Swagger UI видны четыре маршрута, а у `EventDto` и `EventsRangeDto` есть поля.

---

## Шаг 5. Ручная проверка бэкенда

Тестов нет по решению проекта, поэтому проверка сценариями. Нужны два пользователя: ты и второй тестовый аккаунт из списка Google Test users (или вторая запись `User`, добавленная в `prisma:studio` вместе с `Session`... но проще войти вторым аккаунтом).

| Сценарий                                                                           | Ожидание                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| Без cookie любой маршрут                                                           | 401                                              |
| `GET /calendars` у двух пользователей                                              | у каждого только свой календарь                  |
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

**Переводы.** Ключи добавляются сразу в **три** файла `public/i18n/{ru,en,es}.json` по мере появления в шагах 7–13: наборы должны совпадать. Предлагаю корни `sidebar.*`, `calendar.*`, `event.*`, `calendars.*` (название личного календаря, диалог календаря, названия цветов).

**Проверка:** переключение темы меняет цвета образцов (можно временно вывести квадратики на странице календаря и убрать).

---

## Шаг 7. Раскладка с сайдбаром и состояние выбранного календаря

**Что:** слева панель со списком календарей, справа страница. Выбранный календарь известен и сайдбару, и странице календаря.

**Почему состояние в сервисе, а не в компоненте.** Его читают два независимых компонента (сайдбар и страница), это «общее состояние приложения»: signal в сервисе (`01-stack.md`).

### 7.1. Состояние

Типы календаря берутся из сгенерированного клиента (шаг 8). Поэтому **этот шаг удобно сделать после шага 8**, а сейчас сделать только вёрстку сайдбара и пустой каркас. Либо поменяй порядок шагов 7 и 8: решай сам.

```ts
@Service()
export class CalendarsState {
  readonly calendars = signal<Calendar[]>([]); // Calendar: the generated type
  readonly selectedId = signal<string | null>(null);

  readonly selected = computed(() => {
    // TODO: the calendar with selectedId from the list, or null.
  });
  readonly canEdit = computed(() => {
    // TODO: true when the selected calendar's role is OWNER or EDITOR. The UI uses it to hide "+", disable drag and the like.
    //       This is a convenience for the user: the backend checks the role anyway.
  });

  load(): Observable<Calendar[]> {
    // TODO 1: fetch the list from the API.
    // TODO 2: put it into `calendars`.
    // TODO 3: choose selectedId: the id remembered in localStorage if that calendar still exists, otherwise the first one.
    //         localStorage can throw or be empty (private window): wrap it in try/catch, the app must work without it.
  }

  select(id: string): void {
    // TODO: set selectedId and remember it in localStorage (same try/catch).
  }
}
```

**Где вызывать `load()`.** `MainLayout` создаётся только для вошедших пользователей, это подходящее место: список нужен всей внутренней части приложения. Выбери способ подписки (с закрытием через `takeUntilDestroyed`, или `toSignal`) и объясни себе почему.

### 7.2. Раскладка

- В `MainLayout` рядом с `<main>` добавить `<aside>` сайдбара (отдельный компонент в `shared/components/sidebar/`). Простая сетка из двух колонок: узкая постоянная панель, широкое содержимое. Сворачивание и телефон делаем на этапе 5.
- Список календарей: имя (пустое имя заменяется переводом), цветная метка, активный выделен. Клик вызывает `select`.
- Цвета, отступы, радиусы и шрифты только из токенов, оба режима темы.

**Проверка:** после входа слева виден «Личный календарь», он выбран. Перезагрузка страницы сохраняет выбор (когда календарей будет больше одного).

---

## Шаг 8. Клиент API из OpenAPI

**Что:** сгенерировать из спецификации бэкенда типы и методы для Angular, чтобы не описывать их вручную (правило из `CLAUDE.md`).

**Что нужно решить (и это новая зависимость, её нужно обосновать):** какой генератор. Критерии выбора:

- умеет Angular `HttpClient` и отдаёт `Observable` (у нас методы возвращают Observable);
- совместим с Angular 22 и с `@Service()`-стилем проекта, либо не мешает ему;
- генерируется одной командой из URL спецификации (`http://localhost:3000/api/docs-json`), лежит в devDependencies, а результат в понятной папке.

Перед установкой дай мне знать: я сверю актуальные версии и совместимость, чтобы не ставить наугад. Тут легко ошибиться, много инструментов, часть уже не поддерживается.

**Куда генерировать и коммитить ли.** Рекомендую `src/app/core/api/`, добавить в `.gitignore` (как клиент Prisma) и запускать скриптом `npm run api:gen` из `apps/frontend`. Минус: нужен работающий бэкенд при генерации. Реши, подходит ли тебе это, или лучше коммитить результат.

**Проверка:** в сгенерированных типах есть `Calendar`, `Event` (имена по генератору) и методы для маршрутов из шагов 3–4, у ответов нет `any`.

**Нужен ли свой `EventsApi`-сервис поверх?** Если сгенерированные сервисы отдают `Observable` и принимают простые параметры, **они и есть сервис-API**, оборачивать их не нужно (пока не появится причина). Преобразование API ↔ FullCalendar (см. шаг 9) живёт в отдельных функциях-мапперах, а не в слое запросов.

---

## Шаг 9. Страница календаря: события из API и навигация

**Что:** месячный вид на всю высоту, понедельник первым, русская локаль, события приходят из API за видимый диапазон, листание кнопками и «Сегодня».

**Про FullCalendar v7.** Сверяйся с документацией v7, не с туториалами (почти все они под v6). В этом шаге пять вещей, которые нужно проверить по докам v7: как задать локаль, как выставить первым днём понедельник, какой колбэк сообщает о смене видимых дат (у v6 это `datesSet`), как задать динамические события (функция-источник или реактивное обновление опций) и что приходит в аргументе (в v7 даты могут быть `Temporal`-объектами, а не `Date`; помни правило проекта: в состоянии только ISO-строки).

### 9.1. Загрузка

Данные страницы грузит `rxResource` в компоненте (`01-stack.md`). Параметры: выбранный календарь и видимый диапазон; при их смене запрос повторяется, а устаревший отменяется.

```ts
export class Calendar {
  private readonly state = inject(CalendarsState);
  // the generated events service: inject it here

  readonly range = signal<{ from: string; to: string } | null>(null); // ISO strings

  readonly events = rxResource({
    params: () => {
      // TODO: return { calendarId, from, to } when both the calendar and the range are known,
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
- Запрос не должен уходить, пока календарь не выбран.
- Ошибка загрузки: `events.error()` показывается пользователю через `SnackbarService` с переведённым текстом, а не молча.
- Быстрое листание: устаревший запрос отменяется (это даёт `rxResource`, убедись в Network).

### 9.2. Маппер

Одна пара функций в `features/calendar/utils/event.mapper.ts`, единственное место, где API ↔ FullCalendar.

```ts
export function toCalendarEvent(event: ApiEvent): EventInput {
  // TODO: API event -> FullCalendar input. Neutral card (no own colour, see 04-calendar-frontend.md).
  //       For allDay events FullCalendar wants a plain date (YYYY-MM-DD) and an exclusive end: the API already
  //       stores exactly that (decision 1), so cut the ISO strings to the date part.
  //       For timed events pass the ISO instants as they are.
}
```

**Проверка:** событие, созданное в Swagger UI (или в `prisma:studio`), появляется на нужной дате; многодневное событие на весь день рисуется полосой на нужное число дней, а не на день больше или меньше (если на день больше: конец не эксклюзивный где-то по пути). Перелистывание вперёд и назад подгружает события. «Сегодня» возвращает к текущему месяцу.

### 9.3. Навигация

Свои кнопки на панели над календарём (Material, переведённые подписи): «назад», «вперёд», «Сегодня», заголовок текущего месяца. Они вызывают методы API компонента календаря (`prev`, `next`, `today`; как получить ссылку на календарь в Angular-обёртке v7, смотри в доках обёртки). Заголовок месяца берётся из данных календаря и обновляется при смене дат.

---

## Шаг 10. Диалог события и «+» на дате

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
  | { action: 'save'; value: CreateEventPayload } // the generated request type
  | { action: 'delete' }
  | undefined; // cancelled
```

Диалог **не ходит в API сам**: он возвращает результат, а страница календаря выполняет запрос и обновляет данные. Так откат, ошибки и локальное обновление остаются в одном месте, а диалог легко править. Открывается через `MatDialog` (по образцу `DialogService`).

### 10.3. Форма

Поля: название (обязательное), описание, «на весь день», начало (дата и время), окончание (дата и время). Время: нативный `<input type="time">`, отдельная библиотека не нужна. При `allDay` поля времени скрыты.

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

В v7 проверь по документации, как вставить свою разметку в ячейку дня (в roadmap это помечено «проверить»). Запасной вариант: клик по пустой дате (`dateClick` из плагина interaction) открывает диалог создания, а «+» появляется на hover как оформление ячейки. Показывай «+» и разрешай создание, только если `state.canEdit()`. Клик по событию (`eventClick`) открывает диалог редактирования.

### 10.5. Сохранение

После закрытия диалога страница делает запрос. Для создания и правки: на успех обновить `events` локально (`events.update(...)`, без полной перезагрузки списка), на ошибку показать `SnackbarService.error` с переводом. Диалог при ошибке закрыт, поэтому введённое пользователем пропадёт: подумай, как это смягчить (например, не закрывать диалог, пока запрос не завершился). Это твоё решение, объясни выбор.

**Проверка:** создание события кликом по дате, редактирование по клику на событие, многодневное событие на весь день сохраняется и показывается ровно на выбранные дни, событие со временем сохраняет время, у `VIEWER` нет «+» и нет сохранения. В Network нет повторной полной перезагрузки после сохранения.

---

## Шаг 11. Drag-and-drop и ресайз

**Что:** перенос события на другую дату и изменение длительности, с оптимистичным обновлением и откатом.

**Идея.** FullCalendar при перетаскивании уже показал событие на новом месте. Твоя задача: отправить изменение и, если сервер отказал, вернуть событие назад. В колбэках переноса и ресайза аргумент содержит функцию `revert()` для этого. Проверь по докам v7 точные названия колбэков и поля аргумента (в v6 это `eventDrop` и `eventResize`).

```ts
// editable only when state.canEdit()
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

## Шаг 13. Переключатель календарей и цвет

**Что:** выбор календаря в сайдбаре уже есть (шаг 7). Остаётся: показать цвет календаря и дать его менять, и создать новый календарь.

- На карточках событий цвет календаря не применяется (карточка нейтральная, см. `04-calendar-frontend.md`). Цвет виден как метка в сайдбаре и, например, как акцент в шапке страницы.
- Один небольшой диалог «Календарь»: название и выбор цвета из палитры (`CALENDAR_COLORS`). Используется и для создания (`POST`), и для правки (`PATCH`, только `OWNER`: для остальных пункт скрыт или отключён).
- После успешного ответа список в `CalendarsState` обновляется локально (без перезагрузки). Создание нового календаря выбирает его.
- Подписи цветов переводятся, цвета берутся из токенов (шаг 6), не из hex в шаблонах.

**Проверка:** создать второй календарь, переключиться: события разных календарей не смешиваются, выбор сохраняется после перезагрузки. Сменить цвет: метка в сайдбаре обновилась в обеих темах.

---

## Шаг 14. Сквозная проверка этапа

Пройди сценарии руками, в обеих темах и на всех трёх языках (без захардкоженных строк в шаблонах).

1. Вход → виден «Личный календарь» и пустой месяц на всю высоту, неделя начинается с понедельника.
2. Создание обычного события, события на весь день и многодневного. Все видны на своих датах после перезагрузки страницы.
3. Листание по месяцам, «Сегодня». Многодневное событие на стыке месяцев видно в обоих.
4. Перенос и ресайз, затем откат при выключенной сети.
5. Удаление с отменой и без.
6. Второй календарь и переключение. Второй пользователь не видит ничего чужого.
7. `VIEWER` (роль из `prisma:studio`): интерфейс без «+», без переноса и сохранения, бэкенд всё равно отвечает 403.
8. Набор ключей во всех трёх `i18n` одинаков, `npm run lint` и `npm run format:check` чистые, `npm run build` в обоих приложениях проходит.

После этого в `07-tasks.md` отмечаются пункты этапа 2, а в `03-data-model.md` исправляется формулировка про границу диапазона (шаг 4.3).
