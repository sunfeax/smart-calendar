# Модель данных

Целевая схема Prisma (Prisma 7, PostgreSQL). Добавляется порциями, см. раздел «Порядок внедрения». Синтаксис проверяйте командами `npx prisma format` и `npx prisma validate`.

## Сущности

- **User**: профиль из Google. Пароля нет.
- **Session**: сессия входа (хеш токена из cookie, срок, устройство).
- **Calendar**: календарь (личный, с коллегами, с близким человеком).
- **CalendarMember**: участие пользователя в календаре и его роль.
- **TagCategory**: категория тегов внутри календаря.
- **Tag**: тег в категории, с цветом.
- **Event**: событие в календаре.
- **EventTag**: связь событий и тегов (многие ко многим).
- **EventException**: исключения для повторяющихся событий (пропущенное или изменённое повторение).

## Как читать схему

- **Колонки** это обычные поля со скалярным типом (`String`, `DateTime`, `Boolean`...). Они реально есть в таблице. Внешний ключ, например `calendarId`, тоже колонка.
- **Поля-связи** (`calendar`, `members`, `tags`, `createdBy`...) колонок не создают. Это виртуальные поля Prisma, чтобы переходить по связи в коде через `include`. Сторона, где есть `@relation(fields: [...], references: [...])`, хранит внешний ключ.
- **`@id`** первичный ключ, **`@@id([a, b])`** составной ключ (пара должна быть уникальной).
- **`@@index`** ускоряет поиск по полям. Индексы ставим под реальные запросы, а не везде.
- **`@@unique`** запрещает дубликаты по сочетанию полей.
- Идентификаторы везде строки `uuid()`. В контроллерах Nest для них используется `ParseUUIDPipe`.

## Схема

```prisma
enum CalendarRole {
  OWNER
  EDITOR
  VIEWER
}

enum TagColor {
  GRAY
  RED
  ORANGE
  YELLOW
  GREEN
  TEAL
  BLUE
  VIOLET
  PINK
}

model User {
  id          String           @id @default(uuid())
  googleId    String           @unique // поле sub из Google ID token
  email       String           @unique
  name        String
  avatarUrl   String?
  createdAt   DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime         @updatedAt @db.Timestamptz(3)
  memberships CalendarMember[]
  sessions    Session[]
  events      Event[]          @relation("EventCreator")
}

model Session {
  id         String   @id @default(uuid())
  tokenHash  String   @unique // SHA-256 of the cookie token, the token itself is not stored
  userId     String
  userAgent  String?
  lastUsedAt DateTime @default(now()) @db.Timestamptz(3) // last sliding renewal
  expiresAt  DateTime @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model Calendar {
  id            String           @id @default(uuid())
  name          String
  createdAt     DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime         @updatedAt @db.Timestamptz(3)
  members       CalendarMember[]
  events        Event[]
  tagCategories TagCategory[]
}

model CalendarMember {
  calendarId String
  userId     String
  role       CalendarRole @default(EDITOR)
  createdAt  DateTime     @default(now()) @db.Timestamptz(3)
  calendar   Calendar     @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([calendarId, userId])
  @@index([userId])
}

model TagCategory {
  id         String   @id @default(uuid())
  calendarId String
  name       String
  multiple   Boolean  @default(true) // можно ли выбрать несколько тегов категории
  sortOrder  Int      @default(0) // ручной порядок внутри календаря, ставит сервер
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  updatedAt  DateTime @updatedAt @db.Timestamptz(3)
  calendar   Calendar @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  tags       Tag[]

  @@index([calendarId])
}

model Tag {
  id         String      @id @default(uuid())
  categoryId String
  name       String
  color      TagColor    @default(GRAY) // ключ палитры
  sortOrder  Int         @default(0) // ручной порядок внутри категории, ставит сервер
  createdAt  DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt  DateTime    @updatedAt @db.Timestamptz(3)
  category   TagCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  events     EventTag[]

  @@index([categoryId])
}

model Event {
  id             String           @id @default(uuid())
  calendarId     String
  createdById    String?
  title          String
  description    String?
  startAt        DateTime         @db.Timestamptz(3)
  endAt          DateTime         @db.Timestamptz(3)
  allDay         Boolean          @default(false)
  completedAt    DateTime?        @db.Timestamptz(3) // отметка «выполнено», null = не выполнено
  icon           String? // "emoji:🎉", "brand:telegram", "url:https://..."
  recurrenceRule String? // строка rrule (RFC 5545)
  createdAt      DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime         @updatedAt @db.Timestamptz(3)
  calendar       Calendar         @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  createdBy      User?            @relation("EventCreator", fields: [createdById], references: [id], onDelete: SetNull)
  tags           EventTag[]
  exceptions     EventException[]

  @@index([calendarId, startAt])
}

model EventTag {
  eventId String
  tagId   String
  event   Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  tag     Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([eventId, tagId])
  @@index([tagId])
}

model EventException {
  id            String   @id @default(uuid())
  eventId       String
  originalStart DateTime @db.Timestamptz(3) // дата повторения, к которому относится исключение
  cancelled     Boolean  @default(false)
  overrides     Json? // изменённые поля этого повторения (название, время и т.д.)
  event         Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, originalStart])
}
```

У `User` добавится поле `timeZone String` (IANA, например `Europe/Madrid`), см. «Даты».

Тема и язык в профиле не хранятся, только в браузере. Язык добавим в `User`, когда сервер начнёт отправлять письма и напоминания.

## Порядок внедрения

Схему добавляем порциями, каждая порция отдельной миграцией: `npm run prisma:migrate -- --name <описание>`, затем `npx prisma generate`. Добавлять поля и таблицы потом дёшево, дороже всего менять устройство связей, поэтому оно выбрано в первой порции.

| Порция | Что добавляется                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `CalendarRole`, `User`, `Calendar`, `CalendarMember`, `Event` (поля `id`, `calendarId`, `title`, `description`, `startAt`, `endAt`, `allDay`, `createdAt`, `updatedAt`) |
| 1а     | `Session` и связь `sessions` у `User` (вход через Google)                                                                                                               |
| 2      | `TagCategory`, `Tag`, `EventTag` (теги и категории)                                                                                                                     |
| 3      | `icon` и `completedAt` у события, `timeZone` у пользователя                                                                                                             |
| 4      | `recurrenceRule` и `EventException` (повторы)                                                                                                                           |
| 5      | `createdById` у события, если понадобится                                                                                                                               |

Применены порции 1, 1а и 2, из порции 3 поле `completedAt`.

В каждой порции в схему входят только перечисленные модели и поля. Обратные связи, которые указывают на ещё не добавленные модели (например, `tagCategories` в `Calendar` или `exceptions` в `Event`), добавляются вместе с этими моделями.

## Правила

### Доступ

- Любой запрос к событиям, тегам и категориям проходит проверку членства: пользователь должен быть участником календаря с нужной ролью.
- Права ролей:

| Действие                                                  | OWNER | EDITOR              | VIEWER |
| --------------------------------------------------------- | ----- | ------------------- | ------ |
| Смотреть события и теги                                   | да    | да                  | да     |
| Создавать, менять, удалять события, отмечать выполненными | да    | да                  | нет    |
| Создавать теги и назначать их событиям                    | да    | да                  | нет    |
| Создавать ссылку-приглашение                              | да    | да                  | нет    |
| Удалять участников                                        | да    | да, кроме владельца | нет    |
| Настройки календаря (название), удаление календаря        | да    | нет                 | нет    |
| Удалить владельца из календаря                            | нет   | нет                 | нет    |
| Передать владение                                         | позже | нет                 | нет    |

- EDITOR никогда не может действовать на OWNER и не может выдать роль выше своей. Новые участники по ссылке получают EDITOR.
- Это единое место проверки (сервис доступа), а не фильтры, разбросанные по запросам.
- Теги и категории принадлежат календарю. Событие может использовать теги только своего календаря (проверка в сервисе).
- Для категории с `multiple = false` сервис не даёт выбрать больше одного тега. Переключить категорию на `multiple = false` нельзя (409), пока у какого-то события больше одного её тега.
- При первом входе создаём личный календарь и запись `CalendarMember` с ролью OWNER.

### Теги и категории

- Цвет тега хранится ключом палитры, enum `TagColor` в схеме: база сама не принимает другие значения, в DTO проверка `@IsEnum(TagColor)`, Swagger выводит список из типа. Сами цвета для обеих тем лежат в токенах `--color-tag-<key>` и `--color-on-tag-<key>` в `_tokens.scss`, ключ в токене в нижнем регистре (`BLUE` → `--color-tag-blue`). Новый цвет: значение в enum (миграция `ADD VALUE`) и пара токенов. Удалять и переименовывать значения enum дорого, поэтому палитру только расширяем.
- Лимиты: `MAX_TAG_CATEGORIES_PER_CALENDAR` категорий в календаре (`tag-category.constants.ts`), `MAX_TAGS_PER_CATEGORY` тегов в категории (`tag.constants.ts`).
- Родитель передаётся в URL, а не в теле: `calendars/:calendarId/tag-categories`, `tag-categories/:categoryId/tags`. Перенос тега в другую категорию не поддерживается.
- Список категорий отдаётся вместе с тегами одним запросом: категории с вложенным `tags`. Сортировка по `sortOrder`, затем по `createdAt`.
- `multiple` при создании категории и `color` при создании тега обязательны: форма всегда отправляет значение, default в схеме через API не используется. Необязательные поля в create-DTO не помечаем `@IsOptional()`, если колонка `NOT NULL`: этот декоратор пропускает `null`, и запрос падает в Prisma с 500.
- `sortOrder` клиент не присылает и не получает. При создании сервер ставит запись в конец (максимум + 1). Порядок меняется отдельным эндпоинтом, который принимает весь список `ids` и переписывает номера по порядку.
- Теги события меняются по одному (`POST` и `DELETE events/:id/tags/:tagId`), без общего списка: быстрые клики не перезаписывают друг друга. Тег из другого календаря даёт 404. Для категории с `multiple = false` `POST` в одной транзакции снимает с события другой тег этой категории, поэтому в интерфейсе такая категория работает как радиокнопки. Повторный `POST` и `DELETE` безопасны.
- Событие отдаёт только `tagIds`. Клиент строит словарь тегов из списка категорий, загруженного один раз на календарь: так тег не дублируется в каждом событии, а переименование сразу видно на всех карточках. Удалённый тег пропадает из `tagIds` каскадом.

### Даты

- Все поля с датами имеют атрибут `@db.Timestamptz(3)`. Без него Prisma создаёт в Postgres тип `timestamp(3)` без часового пояса, а календарю нужен `timestamptz`.
- События на весь день: `allDay = true`, хранится дата (полночь UTC), время игнорируется. В FullCalendar конец такого события «эксклюзивный» (следующий день после последнего), нужно единообразно конвертировать при сохранении и отображении.
- Не хранить в состоянии `Date`, лучше ISO-строки.
- Часовой пояс задаётся на пользователя: поле `timeZone` (IANA), при первом входе берётся из браузера (`Intl.DateTimeFormat().resolvedOptions().timeZone`), потом меняется в настройках. Календарь показывает время в поясе пользователя. Решение можно пересмотреть, `timestamptz` хранит абсолютное время и от выбора пояса не зависит.

### Выборка по диапазону

- Фронтенд запрашивает события только за видимый период: `from` и `to`.
- Индекс `(calendarId, startAt)` обслуживает этот запрос.
- Событие попадает в период `[from, to)`, если оно начинается до `to` и заканчивается после `from`. Поле `endAt` обязательно и должно быть позже `startAt`. На границах периода чаще всего делают ошибки.
- Повторяющиеся события с `startAt` в прошлом тоже должны попадать в выборку: запрос должен включать события с `recurrenceRule IS NOT NULL` и `startAt <= to`. Развёртывание повторений делается на клиенте (плагин rrule) или на сервере.

### Иконка

- Одно строковое поле с префиксом: `emoji:`, `brand:` (ключ из набора Simple Icons), `url:` (только `https://`).
- На сервере проверяется префикс, схема и длина ссылки.
- На клиенте: `loading="lazy"`, `referrerpolicy="no-referrer"`, запасная иконка при ошибке загрузки.
- Загрузка файлов не поддерживается.

### Повторы

- Основная запись события хранит правило в `recurrenceRule`.
- Событие хранится один раз, конкретные повторения вычисляются на лету.
- Действия с повторяющимся событием как в Google Calendar, пользователь выбирает область:
  - **только это событие**: пропуск создаёт `EventException` с `cancelled = true`, изменение создаёт `EventException` с `overrides` (новое время, название и т.д.);
  - **это и последующие**: серия делится. У исходной записи в `recurrenceRule` ставится `UNTIL` до этой даты, с этой даты создаётся новая запись со своим правилом и изменениями. Исключения после точки разделения переносятся или удаляются;
  - **все события**: меняется сама исходная запись (удаление удаляет всю серию).

### Удаление

- Удаление окончательное, мягкого удаления нет. Кнопка «Отменить» работает на клиенте: запрос `DELETE` отправляется только после того, как уведомление закрылось (несколько секунд). Если вкладку закрыть раньше, событие останется. Это безопасная сторона.
- Архив или корзина: возможно позже (`02-features.md`).
- Удаление календаря и пользователя каскадно удаляет связанные данные.
