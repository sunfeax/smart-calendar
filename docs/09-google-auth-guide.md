# Гайд: вход через Google (бэкенд + фронтенд)

Пособие для этапа 1 из `06-roadmap.md`. Каждый шаг объясняет, **что** делаем, **почему** именно так и **как**, и заканчивается проверкой. Код дан каркасами: сигнатуры и структура готовы, а то, что пишешь ты, помечено комментариями `// TODO`. В них описана цель и критерий, а подсказка («Подсказка: …») дана только для API, которого в проекте ещё не было. Готового кода в TODO нет: его пишешь сам. Пока каркас не дописан, TypeScript ругается на отсутствующий `return`: это нормально. Общая схема API описана в `05-backend-auth.md`.

Читать по порядку: каждый шаг опирается на предыдущие.

**Статус:** бэкенд (шаги 1–5) сделан, в этих шагах описано, как он устроен, с фактическими именами файлов. Фронтенд (шаги 6–9) в работе.

## Как устроен вход

```
Браузер / Angular                         Nest                                Google
      │ клик по кнопке Google                │                                    │
      │ ───── GIS открывает окно Google ──────────────────────────────────────────>│
      │ <──── credential (ID token, JWT) ──────────────────────────────────────────│
      │                                      │                                    │
      │ POST /api/auth/google {credential} ─>│ verifyIdToken (подпись, срок, aud) │
      │                                      │ найти или создать User             │
      │                                      │ создать Session в БД               │
      │ <──── Set-Cookie: session=...  ──────│                                    │
      │                                      │                                    │
      │ GET /api/... (браузер сам шлёт cookie)│ guard: cookie → Session → User     │
```

Три идеи, на которых всё держится:

1. **ID token от Google нужен один раз**, чтобы узнать, кто вошёл. Это подписанное Google «удостоверение»: в нём email, имя и постоянный id аккаунта (`sub`). Мы проверяем его и выдаём **свою** сессию. Хранить токен Google или слать его с каждым запросом не нужно.
2. **Сессия живёт в httpOnly-cookie.** JavaScript на странице её не видит, поэтому XSS (внедрённый чужой скрипт) не сможет её украсть. Фронтенд вообще не работает с токенами: браузер сам прикладывает cookie к каждому запросу.
3. **Фронтенд и API на одном адресе (origin).** Локально это делает прокси `ng serve` (`/api` → `localhost:3000`), в проде reverse proxy (Caddy). Тогда браузер считает запросы к API «своими»: не нужна настройка CORS, cookie отправляется без `withCredentials`, а `SameSite=Lax` защищает от CSRF.

### Почему сессия в БД, а не JWT

Решение принято (`00-overview.md`). Коротко:

- Каждый запрос к данным и так идёт в Postgres: проверка членства в календаре. Главное преимущество JWT (проверка без БД) нам ничего не даёт.
- Несколько экземпляров бэкенда работают с одним Postgres, поэтому сессии в БД масштабированию не мешают.
- Отзыв мгновенный: выход, «выйти на всех устройствах», блокировка аккаунта. С JWT для этого нужен чёрный список или пара access + refresh, а refresh-токены всё равно хранятся в таблице.

Срок: **30 дней со скользящим продлением.** Пока пользователь заходит, сессия продлевается. Брошенное устройство теряет сессию через месяц.

### Карта шагов

| Шаг | Где                  | Результат                                           |
| --- | -------------------- | --------------------------------------------------- |
| 1   | Google Cloud Console | Client ID                                           |
| 2   | Prisma               | таблица `Session`                                   |
| 3   | бэкенд               | зависимости, `main.ts`, пустые модули               |
| 4   | бэкенд               | `POST /api/auth/google` ставит cookie               |
| 5   | бэкенд               | guard, `@Public()`, `@CurrentUser()`, `/me`, logout |
| 6   | фронтенд             | прокси, `HttpClient`, Client ID                     |
| 7   | фронтенд             | `AuthService`: состояние «кто вошёл»                |
| 8   | фронтенд             | страница входа с кнопкой Google                     |
| 9   | фронтенд             | guard маршрутов                                     |
| 10  | везде                | проверка и тесты                                    |

## Шаг 1. Google Cloud Console

**Что:** зарегистрировать приложение у Google и получить **Client ID**, идентификатор нашего приложения.

**Зачем:** кнопка Google выдаёт ID token только зарегистрированному приложению. В токен записывается наш Client ID (поле `aud`, audience), и бэкенд проверяет, что токен выдан именно нам.

**Как:**

1. [Google Cloud Console](https://console.cloud.google.com/) → создать проект.
2. **APIs & Services → OAuth consent screen**: тип **External**, режим **Testing**. В **Test users** добавить себя и тестировщиков. В режиме Testing войти могут только они (до 100 человек), проверка приложения Google не нужна. Для публичного запуска режим переключается на Production (см. `01-stack.md`).
3. **Credentials → Create credentials → OAuth client ID**, тип **Web application**.
4. **Authorized JavaScript origins**: `http://localhost` **и** `http://localhost:4200`. Для localhost с портом Google требует оба. Это список адресов, на которых разрешено показывать кнопку.
5. **Authorized redirect URIs** оставить пустым. Кнопка отдаёт токен прямо в JavaScript-callback на странице, перехода на другой адрес нет.
6. Нажать Create, скопировать **Client ID**. **Client secret** в нашей схеме не нужен, никуда его не копируй.

Client ID не секрет: он виден в коде любой страницы с кнопкой Google. Но держим его в одном месте на каждой стороне:

- бэкенд: `GOOGLE_CLIENT_ID=...` в `.env`, и та же переменная с заглушкой в `.env.example`;
- фронтенд: файл environment (шаг 6).

**Проверка:** Client ID вида `1234567890-abc...apps.googleusercontent.com` лежит в `.env`. Изменения origins у Google иногда применяются до нескольких часов: если позже кнопка пишет `origin is not allowed`, подожди.

## Шаг 2. Таблица `Session`

**Что:** модель Prisma для сессий и миграция.

**Как:**

```prisma
model Session {
  id         String   @id @default(uuid())
  tokenHash  String   @unique
  userId     String
  userAgent  String?
  expiresAt  DateTime @db.Timestamptz(3)
  lastUsedAt DateTime @default(now()) @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model User {
  // ...existing fields
  sessions Session[]
}
```

**Почему каждое поле:**

- `id`: удалить конкретную сессию («выйти на этом устройстве»).
- `tokenHash` (уникальный): по нему guard ищет сессию. Уникальный индекс делает поиск мгновенным.
- `userId` + индекс: «выйти везде» и список сессий пользователя.
- `userAgent`: строка браузера («Chrome на Windows»). Без неё пользователь в списке устройств не отличит одну сессию от другой.
- `expiresAt` + индекс: проверка срока и будущая фоновая очистка без полного сканирования таблицы.
- `lastUsedAt`: скользящее продление и «последняя активность».
- `onDelete: Cascade`: удалили пользователя, удалились и его сессии.

**Почему `tokenHash`, а не сам токен.** В cookie лежит случайная строка, в БД её SHA-256. Если утечёт дамп базы, по хешам войти нельзя. Хватает простого SHA-256: токен состоит из 256 случайных бит, перебрать их невозможно, поэтому медленные алгоритмы для паролей (bcrypt) здесь не нужны.

**Почему `sessions Session[]` в `User`.** Prisma требует описывать связь с обеих сторон. В БД это поле ничего не создаёт (внешний ключ `userId` уже есть в `Session`), только даёт доступ `user.sessions` в коде.

**Чего нет специально:** `ipAddress` (персональные данные по GDPR, хранить только под конкретную функцию) и `revokedAt` (отозванную сессию просто удаляем).

**Проверка:** `npm run prisma:migrate` с именем `add_sessions`. В `npm run prisma:studio` появилась пустая таблица `Session` со всеми полями.

## Шаг 3. Бэкенд: зависимости и каркас

### 3.1. Зависимости

```bash
cd apps/backend
npm i google-auth-library cookie-parser class-validator class-transformer
npm i -D @types/cookie-parser
```

- `google-auth-library`: официальная библиотека Google, проверяет ID token. Вручную разбирать JWT не надо: правильно проверить подпись (скачать ключи Google, обновлять их, сверить алгоритм) сложнее, чем кажется.
- `cookie-parser`: Express сам не разбирает заголовок `Cookie`. Без этого middleware в `req.cookies` будет `undefined`.
- `class-validator` и `class-transformer`: проверка тела запроса по DTO. Первый даёт декораторы правил (`@IsString()`), второй превращает JSON в экземпляр класса DTO.

### 3.2. `main.ts`

```ts
const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api');
app.use(cookieParser());
app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
app.enableShutdownHooks();
await app.listen(process.env['PORT'] ?? 3000);
```

- `setGlobalPrefix('api')`: все маршруты начинаются с `/api`. На это завязаны прокси фронтенда и reverse proxy в проде.
- `cookieParser()`: middleware, срабатывает на каждом запросе до контроллеров.
- `ValidationPipe`: перед вызовом метода контроллера проверяет тело по DTO. Нарушение правил → 400, метод не вызывается. `whitelist: true` выкидывает поля, которых нет в DTO. Так лишнее поле вроде `role: 'OWNER'` не доедет до сервиса.
- **Всё до `listen`.** `listen` запускает сервер, и настройка после него уже не применится.

Импорты: `ValidationPipe` из `@nestjs/common`, `cookieParser` по умолчанию из `cookie-parser`.

### 3.3. Модули

Модуль в Nest объявляет, какие классы в него входят и что он отдаёт наружу. **Ничего не глобально по умолчанию.** Сервис виден другим модулям, только если его модуль указал его в `exports`, а модуль-потребитель добавил этот модуль в `imports`.

Для входа нужны три модуля:

| Модуль    | Генерировать                               | Зачем                                                     |
| --------- | ------------------------------------------ | --------------------------------------------------------- |
| `user`    | `module`, `service`                        | работа с таблицей `User`. Контроллера пока нет            |
| `session` | `module`, `service`                        | создать, найти, продлить, удалить сессию. Контроллера нет |
| `auth`    | `module`, `service`, `controller`, `guard` | эндпоинты входа, проверка токена Google, guard            |

```bash
npx nest g module user && npx nest g service user
npx nest g module session && npx nest g service session
npx nest g module auth && npx nest g service auth && npx nest g controller auth && npx nest g guard auth
```

**Порядок важен: сначала `module`.** CLI регистрирует новый сервис в ближайшем модуле, который найдёт выше по папкам. Если модуля ещё нет, сервис тихо зарегистрируется в `AppModule`.

**Вручную после генерации:**

1. `exports: [UserService]` в `UserModule` и `exports: [SessionService]` в `SessionModule`, чтобы их можно было заинжектить в другом модуле.
2. `imports: [UserModule, SessionModule]` в `AuthModule`.
3. Guard CLI нигде не регистрирует, это сделаешь в шаге 5.
4. Во всех сгенерированных импортах должно быть расширение `.js`: бэкенд на ESM.

```
AppModule ── imports ──> AuthModule ── imports ──> UserModule    (exports UserService)
                                    └─ imports ──> SessionModule (exports SessionService)
все сервисы ──> PrismaService (PrismaModule помечен @Global(), импорт не нужен)
```

**Почему `user` и `session` — отдельные модули, а не часть `auth`.** Их сервисы понадобятся не только входу: профиль, приглашения, экран активных сессий. Если просто добавить `UserService` в `providers` ещё одного модуля, Nest создаст второй экземпляр: singleton действует в пределах модуля. Правильный способ делиться сервисом — `exports` + `imports`.

**Проверка:** `npm run back` стартует без ошибок, `npx tsc --noEmit` чистый.

## Шаг 4. Бэкенд: эндпоинт входа `POST /api/auth/google`

### Что строим

Один эндпоинт. На вход он получает ID token от Google, на выходе ставит cookie сессии и возвращает профиль. Внутри запрос проходит через слои, у каждого своя ответственность:

```
POST /api/auth/google  { credential: "eyJhbGciOi..." }
        │
        ▼
ValidationPipe ── проверяет тело по GoogleLoginDto, мусор → 400
        │
        ▼
AuthController ── HTTP: тело, User-Agent, cookie
        │
        ▼
AuthService ───── сценарий: проверить токен Google → пользователь → сессия
   │        │
   ▼        ▼
UserService   SessionService ── свои таблицы через PrismaService
```

Почему не всё в контроллере:

- **Контроллер знает про HTTP** (тело, заголовки, cookie), но не про Google и БД.
- **`AuthService` знает сценарий входа**, но не знает, как устроены таблицы.
- **`UserService` и `SessionService` знают только свои таблицы.** Их используют и другие места: guard, профиль, экран сессий.

Отдельного слоя репозиториев у нас нет: его роль играет `PrismaService`, он уже типизирован по схеме.

### Порядок: снизу вверх

Сначала пишем то, от чего зависят остальные. Так каждый следующий файл сразу компилируется, без заглушек.

| #   | Файл                               | Что внутри                                           |
| --- | ---------------------------------- | ---------------------------------------------------- |
| 4.1 | `src/session/session.constants.ts` | имя cookie, срок, опции cookie                       |
| 4.2 | `src/session/session.service.ts`   | `create()`: новая сессия                             |
| 4.3 | `src/user/user.service.ts`         | `upsertFromGoogle()`: найти или создать пользователя |
| 4.4 | `src/auth/auth.service.ts`         | `loginWithGoogle()`: весь сценарий                   |
| 4.5 | `src/auth/google-login.dto.ts`     | описание тела запроса                                |
| 4.6 | `src/auth/auth.controller.ts`      | эндпоинт и cookie                                    |

### 4.1. Константы сессии

**Что:** имя cookie, срок жизни и опции cookie в одном файле.

**Почему отдельно:** эти значения нужны в трёх местах: при входе (поставить cookie), в guard (продлить) и при выходе (удалить). Браузер удалит cookie, только если путь и флаги при удалении совпадают с теми, что были при установке. Если продублировать их в трёх файлах, рано или поздно копии разойдутся, и выход перестанет работать. Такую ошибку трудно заметить.

```ts
import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true, // page JS can't read it, so XSS can't steal the session
  secure: true, // HTTPS only; http://localhost counts as secure
  sameSite: 'lax', // not sent on cross-site POSTs, which blocks CSRF
  path: '/',
  maxAge: SESSION_TTL_MS,
};
```

`import type` импортирует только тип: в скомпилированном JS этой строки не будет.

### 4.2. `SessionService.create()`

**Что:** создать сессию для пользователя и вернуть токен, который уйдёт в cookie.

**Доступ к БД.** `PrismaModule` глобальный, поэтому `PrismaService` внедряется в любой сервис без импорта модуля. Внедрение через конструктор:

```ts
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}
}
```

`private readonly` в параметре конструктора — сокращение TypeScript: оно сразу объявляет поле класса и присваивает ему значение.

**Каркас:**

```ts
import { createHash, randomBytes } from 'node:crypto';

export function hashToken(token: string): string {
  // TODO: return createHash('sha256').update(token).digest('hex')
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, userAgent: string | undefined): Promise<string> {
    // TODO 1: generate the token: randomBytes(32).toString('base64url')
    // TODO 2: hash it with hashToken()
    // TODO 3: save the session: await this.prisma.session.create({ data: { ... } })
    //         data: tokenHash, userId, userAgent (max 512 chars), expiresAt (now + SESSION_TTL_MS)
    // TODO 4: return the raw token, not the hash
  }
}
```

**Откуда `userId` и `userAgent`.** Это параметры метода, `SessionService` не знает, откуда они взялись. Их передаёт `AuthService` (шаг 4.4): `user.id` он получает после `upsert`, а `userAgent` ему отдаёт контроллер из заголовка запроса.

**Как работает хеширование.** Цепочка из трёх вызовов:

| Вызов                  | Что делает                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| `createHash('sha256')` | создаёт «хешер» нужного алгоритма                                          |
| `.update(token)`       | передаёт данные. Можно вызвать несколько раз, если данные приходят частями |
| `.digest('hex')`       | завершает расчёт и возвращает строку из 64 шестнадцатеричных символов      |

Один и тот же токен всегда даёт один и тот же хеш. Поэтому guard сможет найти сессию: посчитает хеш от cookie и поищет по нему.

**Как сохранять через Prisma.** `this.prisma.session.create({ data: { ... } })` создаёт строку в таблице. В `data` перечисляются поля модели:

- `id`, `createdAt`, `lastUsedAt` **не передаём**: у них в схеме есть `@default(...)`, значения подставит БД;
- `userId` — внешний ключ, просто строка с id пользователя. Если такого пользователя нет, Prisma бросит ошибку;
- `userAgent?.slice(0, 512)`: `?.` значит «если `userAgent` есть, обрезать, иначе оставить `undefined`». Поле в схеме необязательное, `undefined` сохранится как `NULL`;
- `expiresAt` — объект `Date`: `new Date(Date.now() + SESSION_TTL_MS)`, то есть «сейчас» в миллисекундах плюс 30 дней. На бэкенде `Date` нормален, правило «не хранить `Date`» относится к состоянию фронтенда;
- если переменная называется так же, как поле, можно писать одно имя: `{ tokenHash, userId }` вместо `{ tokenHash: tokenHash, userId: userId }`.

`create` возвращает созданную запись, но она нам не нужна: наружу уходит только токен.

**Почему возвращаем токен, а храним хеш.** Токен знает только браузер. В БД лежит отпечаток, по которому токен не восстановить. Когда придёт запрос, guard посчитает хеш от cookie и найдёт сессию по нему.

**Почему `randomBytes`, а не `Math.random` или UUID.** `randomBytes` — криптографически стойкий генератор, его результат нельзя предсказать. `Math.random` предсказуем. У UUID v4 случайных только 122 бита, и он задуман как идентификатор, а не как секрет.

**Почему `hashToken` — отдельная функция.** Хеширование понадобится и в шаге 5, когда guard будет искать сессию. Алгоритм должен быть в одном месте: если при создании и при поиске хешировать по-разному, ни одна сессия не найдётся. В проекте `generateToken()` и `hashToken()` лежат в `src/session/session-token.ts`.

### 4.3. `UserService.upsertFromGoogle()`

**Что:** найти пользователя по Google-аккаунту или создать нового вместе с личным календарём.

**Вход — свой тип, а не payload Google:**

```ts
export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}
```

Почему не передать payload Google как есть: `UserService` не должен знать формат токена Google (`sub`, `picture`, `email_verified`). Переводить «язык Google» на наш — работа `AuthService`.

**Почему `upsert`.** Нужно «найти, иначе создать». Двумя запросами (`findUnique`, потом `create`) это ломается: два одновременных входа нового пользователя (двойной клик) оба увидят «не найден», и второй `create` упадёт на уникальном `googleId`. `upsert` делает это одной операцией.

**Почему искать по `googleId`.** Это `sub` из токена, постоянный id аккаунта Google. Email у аккаунта может смениться, `sub` нет.

```ts
return this.prisma.user.upsert({
  where: { googleId: profile.googleId },
  update: { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl },
  create: {
    ...profile,
    memberships: {
      create: { role: CalendarRole.OWNER, calendar: { create: { name: '' } } },
    },
  },
});
```

Как читать:

- `where`: по чему искать;
- `update`: что сделать, если нашли. Обновляем email, имя и аватар: их могли поменять в Google;
- `create`: что сделать, если не нашли. Пользователь и **вложенной записью** его членство в новом календаре с ролью OWNER.

Вложенная запись выполняется в той же транзакции. Пользователь без календаря появиться не может: создаётся всё или ничего.

Импорты из сгенерированного клиента: `import { CalendarRole, type User } from '../generated/prisma/client.js'`.

**Название календаря.** Это данные, а не текст интерфейса. Пустая строка значит «личный календарь по умолчанию», фронтенд покажет на её месте переведённое название. В БД русский текст не храним.

### 4.4. `AuthService.loginWithGoogle()`

**Что:** весь сценарий входа. На вход `credential` и `userAgent`, на выход `{ user, token }`.

**Зависимости через конструктор:** `UserService`, `SessionService` (пришли через `imports` в `AuthModule`) и `ConfigService` (глобальный, из `ConfigModule.forRoot({ isGlobal: true })`).

**Клиент Google создаётся один раз** и хранится в поле:

```ts
private readonly googleClient = new OAuth2Client();
```

При первой проверке он скачивает публичные ключи Google и кеширует их. Если создавать его на каждый запрос, кеш пропадает, и каждый вход ходит в Google лишний раз.

**Шаг 1. Проверить токен.**

```ts
let payload: TokenPayload | undefined;
try {
  const ticket = await this.googleClient.verifyIdToken({
    idToken: credential,
    audience: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
  });
  payload = ticket.getPayload();
} catch {
  throw new UnauthorizedException();
}
```

Что проверяет `verifyIdToken`:

- **подпись**: токен выдал Google, а не кто-то его подделал;
- **срок**: токен не истёк (живёт около часа);
- **`audience`**: токен выдан **нашему** приложению. Без этой проверки злоумышленник мог бы взять токен, который пользователь получил на чужом сайте с кнопкой Google, и войти с ним к нам. Это самая важная строка во всём входе.

Почему `UnauthorizedException` без подробностей: клиенту незачем знать, что именно не так с токеном. Подробности помогают только тому, кто подбирает поддельные токены.

**Каркас всего сервиса.** Проверку токена удобно вынести в отдельный приватный метод: код выше и есть его тело.

```ts
@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly config: ConfigService,
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
  ) {}

  async loginWithGoogle(
    credential: string,
    userAgent: string | undefined,
  ): Promise<{ user: User; token: string }> {
    const payload = await this.verifyGoogleToken(credential);
    // TODO 2: if !payload, !payload.sub, !payload.email or payload.email_verified !== true
    //         → throw new UnauthorizedException()
    // TODO 3: build a GoogleProfile: sub → googleId, email → email,
    //         name ?? email → name (name can be missing), picture → avatarUrl
    // TODO 4: const user = await this.userService.upsertFromGoogle(profile)
    // TODO 5: const token = await this.sessionService.create(user.id, userAgent)
    // TODO 6: return { user, token }
  }

  private async verifyGoogleToken(credential: string): Promise<TokenPayload | undefined> {
    // TODO 1: the try/catch with verifyIdToken from above; return ticket.getPayload()
  }
}
```

Неподтверждённому email (`email_verified !== true`) доверять нельзя, поэтому он тоже даёт 401.

Импорты: `OAuth2Client` и тип `TokenPayload` из `google-auth-library`, `UnauthorizedException` из `@nestjs/common`, `ConfigService` из `@nestjs/config`.

**Почему cookie ставит не сервис.** Cookie — деталь HTTP, она в контроллере. Сервис возвращает токен, контроллер решает, как доставить его клиенту. Так сервис тестируется без HTTP.

### 4.5. DTO тела запроса

**Что:** класс, описывающий тело запроса и правила проверки.

```ts
export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  credential!: string;
}
```

**Почему класс, а не `interface`.** Интерфейсы TypeScript стираются при компиляции, во время работы их нет. `ValidationPipe` нужен настоящий класс с декораторами.

**Почему `!` после `credential`.** Включён `strict`, и TS требует инициализировать поле. Значение заполнит `class-transformer` из тела запроса, а `!` говорит компилятору «поле будет заполнено».

**Почему `@MaxLength(4096)`.** ID token весит 1–2 KB. Без лимита можно отправить мегабайт, и сервер будет его разбирать.

### 4.6. `AuthController`: эндпоинт

```ts
@Post('google')
@HttpCode(HttpStatus.OK)
async loginWithGoogle(
  @Body() dto: GoogleLoginDto,
  @Headers('user-agent') userAgent: string | undefined,
  @Res({ passthrough: true }) res: Response,
) {
  const { user, token } = await this.authService.loginWithGoogle(dto.credential, userAgent);
  res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return toProfile(user);
}
```

Разбор:

- **`@Post('google')`** вместе с `@Controller('auth')` и префиксом `api` даёт `POST /api/auth/google`.
- **`@HttpCode(HttpStatus.OK)`**: по умолчанию `POST` отвечает 201 Created. Вход ничего не создаёт с точки зрения клиента, поэтому 200.
- **`@Body() dto: GoogleLoginDto`**: тело, уже проверенное `ValidationPipe`. Тип параметра и говорит pipe, по какому классу проверять.
- **`@Headers('user-agent')`**: один заголовок запроса.
- **`@Res({ passthrough: true })`**: объект ответа Express, чтобы поставить cookie. Без `passthrough` Nest решит, что ответ ты отправляешь сам, проигнорирует `return`, и запрос повиснет. С `passthrough: true` ты только добавляешь cookie, тело Nest отправляет сам. Тип: `import type { Response } from 'express'`.

**`toProfile(user)`.** Приватный метод контроллера, возвращает только `id`, `email`, `name`, `avatarUrl`. `googleId` и служебные поля наружу не отдаём: каждое лишнее поле в ответе — это то, на что начнёт полагаться фронтенд и что потом нельзя будет тихо поменять. Она понадобится ещё в `/auth/me`.

**Пока без `@Public()`.** Сгенерированный guard пропускает всё (`return true`) и ещё не зарегистрирован. Метку добавишь в шаге 5.

### 4.7. Проверка

Полностью проверить вход можно только с кнопкой Google (шаг 8): настоящий токен для нашего Client ID выдаёт только она. Сейчас проверь, что слои собраны:

```bash
# empty body: ValidationPipe → 400 with error list
curl -i -X POST localhost:3000/api/auth/google -H 'Content-Type: application/json' -d '{}'

# junk token: verifyIdToken fails → 401
curl -i -X POST localhost:3000/api/auth/google -H 'Content-Type: application/json' -d '{"credential":"junk"}'
```

### Частые ошибки

- **`Nest can't resolve dependencies of the AuthService (?, SessionService)`.** Знак вопроса стоит на месте зависимости, которую Nest не нашёл. Почти всегда сервис не указан в `exports` своего модуля или модуль не добавлен в `imports`.
- **`Cannot find module './user.service'`** при запуске, хотя `tsc` проходит: нет `.js` в импорте.
- **Запрос висит без ответа:** `@Res()` без `passthrough: true`.
- **400 на правильный запрос:** нет заголовка `Content-Type: application/json`.

## Шаг 5. Бэкенд: guard, декораторы, `/me` и logout

### Что строим

Сейчас любой может вызвать любой эндпоинт. Нужен механизм, который **на каждом запросе** узнаёт, кто пришёл, по cookie сессии, и не пускает чужих.

```
запрос ──> AuthGuard ──┬─ метод помечен @Public()? ──> пропустить
                       ├─ нет cookie / сессии / истекла ──> 401, контроллер не вызывается
                       └─ сессия есть ──> req.user = пользователь ──> контроллер
                                                                       └─ @CurrentUser() user
```

Файлы, в порядке написания:

| #   | Файл                                            | Что внутри                        |
| --- | ----------------------------------------------- | --------------------------------- |
| 5.1 | `src/auth/auth.model.ts`                        | тип запроса с пользователем       |
| 5.2 | `src/session/session.service.ts`                | `validate()` и `delete()`         |
| 5.3 | `src/auth/decorators/public.decorator.ts`       | `@Public()`                       |
| 5.4 | `src/auth/auth.guard.ts`                        | сама проверка                     |
| 5.5 | `src/auth/auth.module.ts`                       | регистрация guard на все маршруты |
| 5.6 | `src/auth/decorators/current-user.decorator.ts` | `@CurrentUser()`                  |
| 5.7 | `src/auth/auth.controller.ts`                   | `GET /me`, `POST /logout`         |

### Что такое guard

Guard — класс с методом `canActivate()`, который Nest вызывает **перед** методом контроллера. Вернул `true` — запрос идёт дальше, бросил `UnauthorizedException` — клиент получает 401, контроллер не вызывается.

Без guard проверку сессии пришлось бы копировать в каждый эндпоинт, и рано или поздно один из них остался бы без защиты.

### 5.1. Тип запроса с пользователем

Guard положит найденного пользователя и id сессии в объект запроса. Опиши, как выглядит такой запрос, чтобы дальше всё было типизировано:

```ts
import type { Request } from 'express';
import type { User } from '../generated/prisma/client.js';

export interface AuthReq extends Request {
  user: User;
  sessionId: string;
}
```

`sessionId` нужен для выхода: удалить именно текущую сессию.

### 5.2. `SessionService.validate()` и `delete()`

**`validate(token)`** — по токену из cookie вернуть сессию с пользователем или `null`.

```ts
// session.model.ts
export type SessionWithUser = Session & { user: User };

// session.constants.ts
export const SESSION_ONE_DAY_MS = 24 * 60 * 60 * 1000;

async validate(token: string): Promise<{ session: SessionWithUser; renewed: boolean } | null> {
  // TODO 1: find the session with its user in one query:
  //         this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
  // TODO 2: no session → return null
  // TODO 3: session.expiresAt <= now → delete it (deleteMany({ where: { id } })) and return null
  // TODO 4: now - lastUsedAt > SESSION_ONE_DAY_MS → update lastUsedAt = now and expiresAt = now + SESSION_TTL_MS
  //         (update({ where: { id }, data: { ... }, include: { user: true } }) returns the fresh session)
  // TODO 5: return { session, renewed }  (renewed = true only if step 4 ran)
}

async delete(id: string): Promise<void> {
  // TODO: await this.prisma.session.deleteMany({ where: { id } })
}
```

Разбор:

- **`include: { user: true }`**: Prisma подтянет связанного пользователя тем же запросом (JOIN). Без него пришлось бы вторым запросом искать `User` по `userId`.
- **`Session & { user: User }`**: тип «сессия плюс поле `user`». Это ровно то, что возвращает `findUnique` с `include`. Типы `Session` и `User` импортируются из `../generated/prisma/client.js`.
- **Сравнение дат:** у `Date` есть `getTime()`, количество миллисекунд. `session.expiresAt.getTime() <= Date.now()` значит «истекла».
- **`deleteMany`, а не `delete`.** `delete` бросает ошибку, если записи нет. Два одновременных запроса с одной просроченной cookie оба попытаются удалить сессию, и второй упадёт. `deleteMany` с тем же условием просто удалит 0 строк.
- **Просроченные удаляются при предъявлении**, так таблица чистится сама понемногу.

**Почему продлевать не чаще раза в сутки.** Если обновлять `lastUsedAt` на каждом запросе, каждое чтение станет записью в БД. При 1000 активных пользователей это тысячи лишних `UPDATE` в минуту. Раз в сутки — одна запись на сессию в день, а для 30-дневного срока точность до суток не важна.

**`delete(sessionId)`** — `delete` по `id`. Понадобится для выхода.

### 5.3. `@Public()`

**Что:** пометка «этот эндпоинт открыт».

**Зачем:** guard будет стоять на **всех** маршрутах, и ему нужно знать, какие пропускать без сессии. Сейчас это только вход.

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`SetMetadata` вешает на метод метку «ключ → значение». Сам декоратор ничего не делает, он только оставляет пометку, которую прочитает guard.

### 5.4. `AuthGuard`

**Зависимости:** `Reflector` (из `@nestjs/core`, читает метки декораторов) и `SessionService`.

**Логика `canActivate(context)`:**

1. **Открытый ли маршрут:**

   ```ts
   const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
     context.getHandler(),
     context.getClass(),
   ]);
   if (isPublic) return true;
   ```

   `getHandler()` — метод контроллера, `getClass()` — сам контроллер. Метку можно поставить на метод или на весь контроллер, `getAllAndOverride` проверит оба места.

2. **Достать запрос и cookie:** `context.switchToHttp().getRequest<AuthReq>()`, затем `request.cookies[SESSION_COOKIE]`. Нет cookie → `UnauthorizedException`.

   `switchToHttp()` нужен потому, что guard в Nest универсальный: он работает и для HTTP, и для WebSocket, и для микросервисов. Мы явно говорим «это HTTP-запрос».

3. **Проверить сессию:** `sessionService.validate(token)`. `null` → `UnauthorizedException`.

4. **Если `renewed`**, поставить cookie заново, чтобы в браузере тоже обновился срок: `context.switchToHttp().getResponse<Response>().cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS)`. Токен тот же, меняется только `maxAge`.

5. **Положить данные в запрос** и пропустить: `request.user = session.user`, `request.sessionId = session.id`, `return true`.

**Каркас:**

```ts
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // TODO 1: public route check (code above) → return true

    const http = context.switchToHttp();
    const request = http.getRequest<AuthReq>();

    // TODO 2: const token: unknown = request.cookies[SESSION_COOKIE]
    //         if typeof token !== 'string' → throw new UnauthorizedException()
    // TODO 3: const result = await this.sessionService.validate(token); null → UnauthorizedException
    // TODO 4: if result.renewed → http.getResponse<Response>().cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS)
    // TODO 5: request.user = result.session.user; request.sessionId = result.session.id
    return true;
  }
}
```

**Почему `token: unknown` и `typeof`.** `request.cookies` типизирован как `Record<string, any>`: TypeScript не знает, что там лежит. `unknown` плюс проверка `typeof token !== 'string'` превращает «что угодно» в гарантированную строку, и ESLint не ругается на `any`.

**Почему `canActivate` асинхронный.** Проверка сессии ходит в БД, а Nest умеет ждать `Promise<boolean>`.

### 5.5. Регистрация на все маршруты

```ts
providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
```

**Почему не просто `providers: [AuthGuard]`.** Так Nest создаст экземпляр guard, но не привяжет его ни к одному маршруту. Guard работает, только если к чему-то привязан: `@UseGuards(AuthGuard)` над контроллером или методом, либо `APP_GUARD`. `APP_GUARD` — специальный токен Nest, который значит «глобальный guard для всех маршрутов».

**Почему не `app.useGlobalGuards(new AuthGuard())` в `main.ts`.** Там объект создаётся через `new`, вне DI, и guard не получит `SessionService` и `Reflector`.

**Почему глобально, а не на каждом контроллере.** Новый эндпоинт закрыт по умолчанию. Забыл `@Public()` — получишь 401 и сразу заметишь. Забыл бы `@UseGuards()` — чужие данные были бы открыты, и этого никто бы не заметил.

**Теперь поставь `@Public()`** на метод входа в контроллере. Шаблонные `AppController` и `AppService` удалены, других открытых маршрутов нет.

### 5.6. `@CurrentUser()`

**Что:** декоратор параметра, который отдаёт залогиненного пользователя.

**Зачем:** guard положил пользователя в `request.user`. Без декоратора каждый метод писал бы `@Req() req` и потом `req.user`, то есть лез бы в объект запроса Express руками. С декоратором контроллер просто объявляет: «мне нужен текущий пользователь».

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthReq>().user,
);
```

### 5.7. `GET /me` и `POST /logout`

**`GET /api/auth/me`** — «кто я». Фронтенд вызывает его при загрузке страницы: 200 с профилем значит «вошёл», 401 значит «не вошёл».

```ts
@Get('me')
me(@CurrentUser() user: User) {
  return toProfile(user);
}
```

Защищён guard'ом автоматически: без сессии сюда не попасть.

**`POST /api/auth/logout`** — выход:

1. `sessionService.delete(req.sessionId)`. Сессия умирает на сервере сразу. Даже если кто-то скопировал cookie, она больше не работает.
2. `res.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS)`. Браузер удаляет cookie, только если путь и флаги совпадают с теми, что были при установке, поэтому опции те же, из констант.
3. `@HttpCode(HttpStatus.NO_CONTENT)`: ответ 204 без тела.

```ts
@Post('logout')
@HttpCode(HttpStatus.NO_CONTENT)
async logout(
  @Req() req: AuthReq,
  @Res({ passthrough: true }) res: Response,
): Promise<void> {
  // TODO 1: await this.sessionService.delete(req.sessionId)
  // TODO 2: res.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS)
}
```

`SessionService` в контроллер внедряется через конструктор, как и `AuthService`: `SessionModule` уже есть в `imports` у `AuthModule`. `@Req()` даёт доступ к `sessionId`, который положил guard.

**Почему logout — `POST`, а не `GET`.** `GET` браузер может вызвать сам: предзагрузка ссылок, картинка с чужого сайта `<img src="/api/auth/logout">`. Действия, которые что-то меняют, всегда делаются через `POST`.

### 5.8. Проверка

```bash
# no cookie → 401
curl -i localhost:3000/api/auth/me

# login is public: junk token gives 401 from AuthService, not from the guard
curl -i -X POST localhost:3000/api/auth/google -H 'Content-Type: application/json' -d '{"credential":"junk"}'
```

Полный цикл (вход → `/me` → выход) проверяется с фронтендом в шаге 10.

### Чего пока не делаем

- **Регулярная очистка** просроченных сессий (`@nestjs/schedule`, раз в сутки `deleteMany` по `expiresAt`). Сейчас хватает удаления в `validate()`. До публичного запуска добавить, иначе таблица будет расти от брошенных устройств.
- **«Выйти на всех устройствах»** и экран активных сессий: поля под них есть, эндпоинты позже.

## Шаг 6. Фронтенд: прокси, HttpClient, Client ID

### 6.1. Прокси

**Что:** `ng serve` пересылает запросы `/api/*` на бэкенд.

**Зачем:** фронтенд работает на `localhost:4200`, бэкенд на `localhost:3000`. Для браузера это разные origins: понадобились бы CORS, `withCredentials` и другие настройки cookie. С прокси браузер видит один адрес `localhost:4200`, и всё работает как в проде за Caddy.

**Как:** файл `apps/frontend/proxy.conf.json`:

```json
{ "/api": { "target": "http://localhost:3000", "secure": false } }
```

В `angular.json` → `projects.frontend.architect.serve` добавить:

```json
"options": { "proxyConfig": "proxy.conf.json" }
```

**Проверка:** перезапустить `npm run front`, открыть `http://localhost:4200/api/auth/me`. Должен прийти JSON с 401 от Nest, а не страница Angular.

### 6.2. HttpClient

В `app.config.ts` в `providers` добавить `provideHttpClient(withFetch())`. Без этого `HttpClient` нельзя заинжектить. `withFetch()` переводит его на современный `fetch` вместо `XMLHttpRequest`.

`withCredentials` не нужен: для запросов на тот же origin браузер отправляет cookie сам.

### 6.3. Client ID

```bash
npx ng generate environments
```

Команда создаст `src/environments/environment.ts` и `environment.development.ts` и настроит в `angular.json` подмену файла при сборке. В оба файла добавь `googleClientId: '...'`. Для прода позже понадобится свой Client ID (или тот же, но с доменом в origins).

## Шаг 7. Фронтенд: `AuthService`

### Что строим

Сервис, который знает, вошёл ли пользователь и кто он. Его читают guard маршрутов, шапка с аватаром, страница входа.

Файл: `src/app/features/auth/service/auth.service.ts`, декоратор `@Service()`: сервис автоматически доступен во всём приложении, один экземпляр. Это краткая форма `@Injectable({ providedIn: 'root' })`.

Здесь два инструмента, и каждый на своём месте. Правило проекта (`01-stack.md`):

- **методы возвращают `Observable`**: запрос к API это поток, который отдаёт результат и завершается. `HttpClient` и так возвращает Observable, и его удобно отменять, повторять и комбинировать;
- **состояние «кто вошёл» хранится в signal**: шаблон и guard читают его синхронно, без подписок.

### Состояние на signals

```ts
private readonly http = inject(HttpClient);
private readonly router = inject(Router);

private readonly _user = signal<User | null>(null);
readonly user = this._user.asReadonly();
readonly isLoggedIn = computed(() => this._user() !== null);
```

**Почему signal, а не `BehaviorSubject`.** Состоянию нужно значение «прямо сейчас», а не поток. Шаблон и guard читают его синхронно, а `computed` пересчитывается сам. Callback кнопки Google вызывается вне Angular, и signal обновляет интерфейс без дополнительных действий.

**Тип `User`** пока описан вручную в `src/app/features/auth/models/user.interface.ts`: `id`, `email`, `name`, `avatarUrl`, ровно то, что возвращает `toProfile` на бэкенде. Когда появится генерация клиента из Swagger, замени на сгенерированный тип.

**Наружу только чтение.** Записывать в `_user` может только сам сервис. Компоненты получают `user` через `asReadonly()`.

### Методы: Observable и `tap`

Метод делает запрос и возвращает Observable. Состояние обновляется внутри `tap`, то есть как побочный эффект на пути потока. Сам запрос при этом ничего не меняет, пока кто-то не подписался:

```ts
me(): Observable<User> {
  return this.http.get<User>('/api/auth/me').pipe(
    tap((user) => this._user.set(user)),
  );
}
```

Так же устроены остальные методы:

- **`loadMe()`** — `me()` плюс обработка 401: 401 значит «не вошёл», это не ошибка. Такой ответ превращается в `null`, а не в сбой. Для этого `catchError` возвращает `of(null)`, а потом `tap` ставит состояние.
- **`loginWithGoogle(credential)`** — `POST /api/auth/google` с `{ credential }`, в `tap` записать пользователя в signal. Переход на `/calendar` делает компонент после успешной подписки, а не сервис.
- **`logout()`** — `POST /api/auth/logout`, в `tap` сбросить пользователя в `null`.

**Почему переход на `/login` и `/calendar` не в сервисе.** Сервис отвечает за состояние и запросы, решение, куда перейти, принадлежит компоненту. Так сервис можно использовать в любом месте.

**Подписка.** Методы сами по себе ничего не делают, пока на них не подписаться. Подписка закрывается сама, как только `HttpClient` отдал ответ и завершился. Для страниц и шаблонов подходит `async`-pipe или `toSignal`, для кода вне шаблонов (например, callback Google) — `subscribe` с обработкой ошибки.

### Каркас методов

```ts
me(): Observable<User> {
  // TODO: GET '/api/auth/me' через this.http.get<User>(...), затем tap: сохрани пользователя в _user
}

loadMe(): Observable<User | null> {
  // TODO 1: вызови me()
  // TODO 2: catchError: при 401 верни of(null) и поставь _user в null;
  //         другие ошибки залогируй и тоже верни of(null)
  // TODO 3: tap: поставь _user в полученное значение
}

loginWithGoogle(credential: string): Observable<User> {
  // TODO: POST '/api/auth/google' с телом { credential }, в tap сохрани пользователя в _user
}

logout(): Observable<void> {
  // TODO: POST '/api/auth/logout' с пустым телом, в tap поставь _user в null
}
```

Ошибку в `loginWithGoogle` здесь не ловим: её поймает подписка на странице входа и покажет сообщение (шаг 8.3).

**Почему не `firstValueFrom` и не `async`.** Раньше в гайде было `await firstValueFrom(...)`. Это работает, но тогда методы становятся Promise, и теряется возможность отменить или повторить запрос через операторы RxJS. Observable даёт эти возможности, а signal остаётся для состояния.

### Загрузка при старте

В `app.config.ts`:

```ts
provideAppInitializer(() => inject(AuthService).loadMe()),
```

**Зачем:** Angular не начнёт навигацию, пока инициализатор не завершится. Инициализатор ждёт, пока Observable из `loadMe()` выдаст значение и завершится. Поэтому `catchError` и `of(null)` обязательны: без них поток упадёт с ошибкой, и приложение не запустится. Когда сработает guard маршрутов, состояние «вошёл / не вошёл» уже известно. Без этого guard при перезагрузке страницы увидел бы `null`, отправил бы на `/login`, и только потом пришёл бы ответ `/me`.

## Шаг 8. Фронтенд: страница входа с кнопкой Google

### Что такое GIS

Google Identity Services — скрипт Google, который рисует кнопку «Войти через Google», открывает окно выбора аккаунта и отдаёт в наш callback ID token (`credential`). Ни redirect, ни client secret ему не нужны.

### 8.1. Типы

```bash
npm i -D @types/google.accounts
```

В `tsconfig.app.json` поменять `"types": []` на `"types": ["google.accounts"]`. Без этого TypeScript не знает про глобальный объект `google`.

### 8.2. Загрузка скрипта

**Проблема:** если вставить `<script src="https://accounts.google.com/gsi/client" async>` в `index.html`, он загружается параллельно с приложением. К моменту, когда страница входа захочет нарисовать кнопку, `google` может ещё не существовать. Кроме того, скрипт будет грузиться на всех страницах, а нужен только на одной.

**Решение:** функция, которая вставляет `<script>` сама и возвращает `Promise`, который выполнится, когда скрипт загрузится. Положи её в `src/app/features/auth/google-script.ts`:

1. Если `Promise` уже создан раньше, вернуть его. Так скрипт загружается один раз, даже если страницу входа открыли повторно.
2. Иначе создать `document.createElement('script')`, задать `src`, `async`, обработчики `onload` → `resolve` и `onerror` → `reject`, добавить в `document.head`.
3. Сохранить `Promise` в переменную модуля и вернуть.

**Каркас:**

```ts
const GIS_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | undefined;

export function loadGoogleScript(): Promise<void> {
  // TODO 1: если скрипт уже загружается или загружен, верни тот же Promise.
  // TODO 2: создай Promise, внутри которого добавь на страницу тег <script> с адресом GIS_SRC
  //         и атрибутом async. Promise выполняется, когда скрипт загрузился, и отклоняется
  //         при ошибке загрузки (тогда сбрось loading, чтобы можно было попробовать снова).
  //         Подсказка: new Promise((resolve, reject) => ...) создаёт Promise вручную;
  //         document.createElement('script') создаёт тег, у тега есть обработчики onload и onerror,
  //         document.head.append(...) добавляет тег на страницу.
  // TODO 3: сохрани Promise в loading и верни его.
}
```

**Почему `loading = undefined` при ошибке.** Если скрипт не загрузился (нет сети), без сброса переменная навсегда хранила бы проваленный `Promise`, и повторная попытка тоже сразу падала бы. Со сбросом следующий вызов попробует загрузить скрипт заново.

**`let` на уровне модуля** живёт, пока открыта вкладка: один и тот же для всех вызовов функции. Это и даёт «загрузить один раз».

### 8.3. Компонент страницы

Файл: `src/app/features/auth/pages/login/login.ts` (как у календаря), standalone, `OnPush`.

**Шаблон:** пустой `<div #googleButton></div>`, в который Google нарисует кнопку, плюс заголовок страницы.

**В классе:**

```ts
private readonly auth = inject(AuthService);
private readonly router = inject(Router);
private readonly buttonHost = viewChild.required<ElementRef<HTMLElement>>('googleButton');
protected readonly loginError = signal(false); // shown in the template when the login fails

constructor() {
  afterNextRender(async () => {
    // TODO 1: дождись загрузки скрипта Google (loadGoogleScript из 8.2).
    // TODO 2: настрой вход: передай Client ID из environment и функцию, которую Google вызовет
    //         с токеном после выбора аккаунта. В ней отправь токен через auth.loginWithGoogle,
    //         при успехе перейди на /calendar, при ошибке поставь loginError в true.
    //         Подсказка: google.accounts.id.initialize({ client_id, callback }); токен лежит
    //         в response.credential.
    // TODO 3: нарисуй кнопку Google внутри элемента buttonHost.
    //         Подсказка: google.accounts.id.renderButton(элемент, { theme: 'outline', size: 'large' }).
  });
}
```

Разбор:

- **`viewChild.required`** — ссылка на элемент `#googleButton` из шаблона, в виде signal.
- **`afterNextRender`** — код выполнится после того, как Angular нарисует шаблон. Раньше нельзя: элемента для кнопки ещё нет в DOM.
- **`initialize`** — настройка: какой у нас Client ID и куда отдать токен.
- **`renderButton`** — Google рисует свою кнопку внутри нашего элемента. Стилизовать её почти нельзя: так Google требует по брендингу.
- **`callback`** — Google вызывает его с `response.credential` после выбора аккаунта. Вызов происходит вне Angular, но приложение zoneless и состояние на signals, поэтому интерфейс обновится сам. Подписка на `loginWithGoogle` закроется сама: `HttpClient` отдаёт один ответ и завершает поток.

**Тексты.** Кнопку Google локализует сама (опция `locale` в `renderButton`). Заголовок страницы и прочие строки ведутся через i18n по правилам проекта. Если Transloco ещё не подключён, сделай пометку и перенеси строки, когда он появится.

**Ошибки входа.** Если `loginWithGoogle` получил 401 (например, аккаунт не в списке тестовых), покажи пользователю понятное сообщение, а не молча ничего.

## Шаг 9. Фронтенд: guard маршрутов

### Что строим

Не пускать на `/calendar` без входа и не показывать `/login` тому, кто уже вошёл.

Это **не защита данных**: данные защищает бэкенд, без сессии API вернёт 401. Guard маршрутов отвечает за удобство: пользователь сразу попадает на нужную страницу, а не видит пустой календарь с ошибками.

### Функциональные guard'ы

Файл `src/app/features/auth/auth.guards.ts`:

```ts
export const authGuard: CanActivateFn = () => {
  // TODO: если пользователь вошёл, пропусти; иначе отправь на /login.
  //       Подсказка: CanActivateFn может вернуть true или UrlTree — адрес, куда перенаправить.
  //       UrlTree создаёт inject(Router).createUrlTree(['/login']).
};

export const guestGuard: CanActivateFn = () => {
  // TODO: обратное: если пользователь уже вошёл, отправь на /calendar, иначе пропусти на /login.
};
```

**Почему функции, а не классы.** Современный Angular, классовые guard'ы устарели. `inject()` работает внутри функции так же, как в конструкторе.

**Почему `createUrlTree`, а не `router.navigate()`.** Guard, который вернул `UrlTree`, говорит роутеру «отмени этот переход и сделай вот этот». Роутер делает это одной навигацией. Если внутри guard вызвать `navigate()` и вернуть `false`, получатся две навигации, которые могут конфликтовать.

### Маршруты

```ts
export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'calendar', component: Calendar, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'calendar' },
];
```

Guard читает `isLoggedIn()` синхронно. Это работает, потому что `provideAppInitializer` из шага 7 дождался ответа `/me` до первой навигации.

### Позже: 401 посреди работы

Сессия может истечь, пока вкладка открыта. Тогда запросы к данным начнут получать 401. Решение — `HttpInterceptorFn`: на 401 от любого запроса, кроме `/auth/me` и `/auth/google`, сделать `user.set(null)` и перейти на `/login`. Добавь, когда появятся запросы к данным календаря.

## Шаг 10. Проверка

### Вручную, полный цикл

1. `npm run db:up`, `npm run back`, `npm run front`.
2. Открыть `http://localhost:4200/calendar` → редирект на `/login`.
3. Войти через Google → попасть на `/calendar`.
4. DevTools → Application → Cookies: есть `session` с флагами HttpOnly, Secure, SameSite=Lax.
5. `npm run prisma:studio`: есть `User`, `Calendar`, `CalendarMember` с ролью OWNER, `Session` с `userAgent`.
6. Перезагрузить страницу → остаёшься на `/calendar` (сработал `/me`).
7. Открыть `/login` → редирект на `/calendar`.
8. Выйти → cookie удалена, строки `Session` в БД нет, `/calendar` ведёт на `/login`.
9. Войти повторно → новый `Calendar` **не** создаётся, у пользователя по-прежнему один.

Автотесты в проекте пока не пишем (решение автора). Проверка ручная, по списку выше.

## Чего здесь не делаем

- **Список разрешённых email** на время закрытой беты: перед выкладкой в прод (`05-backend-auth.md`). Если хочется сразу, это одна проверка `ALLOWED_EMAILS` в шаге 4.4.
- **Refresh-токены:** с сессией в БД они не нужны.
- **Экран «активные сессии»** и «выйти везде»: поля есть, интерфейс позже.
- **`helmet` и `@nestjs/throttler`:** этап продакшена. `/auth/google` первым получит лимит запросов.

## Чек-лист

- [x] Google Cloud: consent screen (Testing), тестовые пользователи, Client ID, оба origin
- [x] `GOOGLE_CLIENT_ID` в `.env` и `.env.example`
- [x] Модель `Session` со всеми полями и миграция
- [x] `main.ts`: префикс `/api`, `cookieParser`, `ValidationPipe`, всё до `listen`
- [x] Модули `user`, `session`, `auth` с `exports` и `imports`
- [x] Константы сессии и опции cookie в одном месте
- [x] `SessionService.create`, `UserService.upsertFromGoogle`, `AuthService.loginWithGoogle`
- [x] `GoogleLoginDto` и `POST /api/auth/google`
- [x] `SessionService.validate` и `delete`, `AuthGuard` через `APP_GUARD`
- [x] `@Public()` на входе, `@CurrentUser()`
- [x] `GET /api/auth/me`, `POST /api/auth/logout`
- [ ] Фронтенд: прокси, `provideHttpClient`, environments с Client ID
- [ ] `AuthService`: методы возвращают Observable, состояние в signal, `loadMe` в `provideAppInitializer`
- [ ] Загрузчик скрипта GIS и страница входа
- [ ] `authGuard`, `guestGuard`, маршруты
- [ ] Ручная проверка полного цикла по шагу 10
