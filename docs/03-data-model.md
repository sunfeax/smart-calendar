# Модель данных

Эскиз схемы Prisma. Синтаксис нужно проверить под актуальную версию Prisma при создании проекта.

## Сущности

- **User**: профиль из Google. Пароля нет.
- **Calendar**: календарь (личный, с коллегами, с близким человеком).
- **CalendarMember**: участие пользователя в календаре и его роль.
- **TagCategory**: категория тегов внутри календаря.
- **Tag**: тег в категории, с цветом.
- **Event**: событие в календаре.
- **EventTag**: связь событий и тегов (многие ко многим).
- **EventException**: исключения для повторяющихся событий (пропущенное или изменённое повторение).

## Схема (эскиз)

```prisma
enum CalendarRole {
  OWNER
  EDITOR
  VIEWER
}

model User {
  id          String           @id @default(uuid())
  googleId    String           @unique   // поле sub из Google ID token
  email       String           @unique
  name        String
  avatarUrl   String?
  locale      String           @default("ru")
  theme       String           @default("system")
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  memberships CalendarMember[]
  events      Event[]          @relation("EventCreator")
}

model Calendar {
  id            String           @id @default(uuid())
  name          String
  color         String?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  members       CalendarMember[]
  events        Event[]
  tagCategories TagCategory[]
}

model CalendarMember {
  calendarId String
  userId     String
  role       CalendarRole @default(EDITOR)
  createdAt  DateTime     @default(now())
  calendar   Calendar     @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([calendarId, userId])
  @@index([userId])
}

model TagCategory {
  id         String   @id @default(uuid())
  calendarId String
  name       String
  multiple   Boolean  @default(true)   // можно ли выбрать несколько тегов категории
  sortOrder  Int      @default(0)
  calendar   Calendar @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  tags       Tag[]

  @@index([calendarId])
}

model Tag {
  id         String      @id @default(uuid())
  categoryId String
  name       String
  color      String                    // ключ палитры, например "red", "blue"
  sortOrder  Int         @default(0)
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
  startAt        DateTime
  endAt          DateTime?
  allDay         Boolean          @default(false)
  deadline       DateTime?
  icon           String?                    // "emoji:🎉", "brand:telegram", "url:https://..."
  recurrenceRule String?                    // строка rrule (RFC 5545)
  deletedAt      DateTime?                  // мягкое удаление
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
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
  originalStart DateTime            // дата повторения, к которому относится исключение
  cancelled     Boolean  @default(false)
  overrides     Json?               // изменённые поля (на будущее)
  event         Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, originalStart])
}
```

Необязательные поля, которые можно добавить позже: `done` (выполнено) у события, `timezone` у пользователя или календаря.

## Правила

### Доступ

- Любой запрос к событиям, тегам и категориям проходит проверку членства: пользователь должен быть участником календаря с нужной ролью (VIEWER читает, EDITOR и OWNER меняют, управление участниками только OWNER).
- Это единое место проверки (сервис доступа), а не фильтры, разбросанные по запросам.
- Теги и категории принадлежат календарю. Событие может использовать теги только своего календаря (проверка в сервисе).
- Для категории с `multiple = false` сервис не даёт выбрать больше одного тега.
- При первом входе создаём личный календарь и запись `CalendarMember` с ролью OWNER.

### Даты

- Все моменты времени хранятся как `timestamptz`.
- События на весь день: `allDay = true`, хранится дата (полночь UTC), время игнорируется. В FullCalendar конец такого события «эксклюзивный» (следующий день после последнего), нужно единообразно конвертировать при сохранении и отображении.
- Не хранить в состоянии `Date`, лучше ISO-строки.
- Политику часовых поясов нужно решить (`08-open-questions.md`).

### Выборка по диапазону

- Фронтенд запрашивает события только за видимый период: `from` и `to`.
- Индекс `(calendarId, startAt)` обслуживает этот запрос.
- Повторяющиеся события с `startAt` в прошлом тоже должны попадать в выборку: запрос должен включать события с `recurrenceRule IS NOT NULL` и `startAt <= to`. Развёртывание повторений делается на клиенте (плагин rrule) или на сервере.

### Иконка

- Одно строковое поле с префиксом: `emoji:`, `brand:` (ключ из набора Simple Icons), `url:` (только `https://`).
- На сервере проверяется префикс, схема и длина ссылки.
- На клиенте: `loading="lazy"`, `referrerpolicy="no-referrer"`, запасная иконка при ошибке загрузки.
- Загрузка файлов не поддерживается.

### Повторы

- Основная запись события хранит правило в `recurrenceRule`.
- Удаление одного повторения создаёт `EventException` с `cancelled = true`.
- Редактирование одного повторения (через `overrides`) откладываем.

### Удаление

- События удаляются мягко (`deletedAt`), чтобы работала отмена. Периодически можно чистить окончательно.
- Удаление календаря и пользователя каскадно удаляет связанные данные.
