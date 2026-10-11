# Гайд: вход через Google (бэкенд + фронтенд)

Пошаговый план для этапа 3 из `06-roadmap.md`. Общая схема описана в `05-backend-auth.md`, здесь порядок работы и решения на каждом шаге. Код в гайде дан набросками: что вызвать и где, без готовых файлов целиком.

## Как это работает

```
Браузер                         Angular                    Nest                         Google
   │  клик по кнопке Google        │                          │                             │
   │──────────────────────────────>│  GIS выдаёт credential   │                             │
   │                               │  (ID token, JWT)         │                             │
   │                               │── POST /api/auth/google ─>│ verifyIdToken ─────────────>│
   │                               │                          │<──── payload (sub, email) ──│
   │                               │                          │ upsert User (+ личный календарь)
   │                               │                          │ создать Session в БД
   │                               │<── Set-Cookie: session ──│
   │  дальше все запросы /api/* идут с cookie, guard проверяет сессию
```

Ключевые идеи:

- **ID token от Google используется один раз**, только чтобы узнать, кто вошёл. Дальше у нас своя сессия. Хранить токен Google или слать его с каждым запросом не нужно.
- **Сессия в httpOnly-cookie.** JavaScript её не видит, значит XSS не сможет её украсть. Фронтенд вообще не работает с токенами: браузер сам отправляет cookie.
- **Один origin для фронтенда и API.** Локально это делает прокси `ng serve` (`/api` → `localhost:3000`), в проде reverse proxy. Тогда не нужны CORS и `withCredentials`, а `SameSite=Lax` закрывает CSRF для JSON-запросов.

## Решение: сессия в БД, а не JWT

Принято, вопрос 13 закрыт (см. `00-overview.md`). Коротко почему:

- Каждый запрос к данным и так идёт в Postgres (проверка членства в календаре), поэтому JWT не экономит обращение к БД.
- Несколько экземпляров бэкенда работают с одним Postgres, так что сессии в БД горизонтальному масштабированию не мешают.
- Отзыв мгновенный: выход, «выйти на всех устройствах», блокировка аккаунта. С JWT для этого нужен либо чёрный список, либо пара access + refresh, а refresh-токены всё равно хранятся в таблице.
- Если когда-нибудь поиск сессии станет узким местом, перед Postgres ставится кеш (Redis), схема не меняется.

Срок: **30 дней со скользящим продлением.** Активный пользователь не выходит, сессия брошенного устройства умирает через месяц.

## Шаг 1. Google Cloud Console

1. Создать проект в [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs & Services → OAuth consent screen**: тип External, режим **Testing**, добавить себя и второго пользователя в Test users. Проверка приложения Google в этом режиме не нужна.
3. **Credentials → Create credentials → OAuth client ID**, тип **Web application**.
4. **Authorized JavaScript origins**: добавить **оба** адреса, `http://localhost` и `http://localhost:4200`. Для localhost с портом Google требует оба. Redirect URIs не нужны: GIS с callback работает без редиректа.
5. Скопировать **Client ID**. Client secret для этой схемы не нужен.

Client ID не секрет, он виден в коде любой страницы с кнопкой Google. Но держим его в одном месте:

- `.env` и `.env.example`: `GOOGLE_CLIENT_ID=...` (для бэкенда, это `audience` при проверке токена);
- фронтенд: файл environment (шаг 6).

## Шаг 2. Схема: таблица Session

Добавить модель и связь в `User`:

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

Поле `sessions` в `User` обязательно: Prisma требует описывать связь с обеих сторон. В базе оно ничего не создаёт (внешний ключ `userId` уже есть в `Session`), только даёт доступ к сессиям пользователя в Prisma Client.

**Почему `tokenHash`, а не сам токен:** в cookie лежит случайная строка, в БД её SHA-256. Если утечёт дамп базы, по хешам войти нельзя. Хешировать подходит простой SHA-256: у токена 256 бит случайности, перебор бессмыслен, поэтому bcrypt здесь не нужен.

Зачем каждое поле:

- `id`: удалить конкретную сессию («выйти на этом устройстве»).
- `tokenHash`: поиск сессии в guard. Уникальный индекс.
- `userId` + индекс: «выйти везде» и список сессий пользователя.
- `userAgent`: список устройств в настройках, иначе пользователь не отличит одну сессию от другой. Обрезать до разумной длины (например 512).
- `expiresAt` + индекс: проверка срока и фоновая очистка без полного сканирования таблицы.
- `lastUsedAt`: скользящее продление и «последняя активность».

Чего нет специально: `ipAddress` (персональные данные по GDPR, хранить только под конкретную функцию) и `revokedAt` (отозванную сессию просто удаляем).

Затем `npm run prisma:migrate` с именем вроде `add_sessions`.

## Шаг 3. Бэкенд: зависимости и каркас

```bash
cd apps/backend
npm i google-auth-library cookie-parser class-validator class-transformer
npm i -D @types/cookie-parser
```

Зачем каждая:

- `google-auth-library`: проверка ID token (подпись по ключам Google, срок, `aud`). Вручную разбирать JWT не надо: проверить подпись правильно сложнее, чем кажется.
- `cookie-parser`: без него в Express нет `req.cookies`.
- `class-validator` и `class-transformer`: валидация DTO, правило проекта для каждого эндпоинта.

В `main.ts`:

- `app.setGlobalPrefix('api')`: все пути под `/api`, как в `05-backend-auth.md`;
- `app.use(cookieParser())`;
- `app.useGlobalPipes(new ValidationPipe({ whitelist: true }))`. `whitelist` выкидывает поля, которых нет в DTO.

Модули по `05-backend-auth.md`: `auth` (контроллер, сервис, guard) и `users` (сервис работы с `User`). Сгенерировать: `npx nest g module auth`, `npx nest g service auth`, `npx nest g controller auth`, так же для `users`.

## Шаг 4. Бэкенд: `POST /api/auth/google`

DTO: одно поле `credential: string`, `@IsString()`, `@IsNotEmpty()`, разумный `@MaxLength` (ID token обычно 1–2 KB, лимит 4096 с запасом).

Логика в `AuthService`, контроллер только передаёт данные и ставит cookie.

**4.1. Проверить токен.** `OAuth2Client` создать один раз (в конструкторе сервиса или провайдером), а не на каждый запрос: он кеширует публичные ключи Google.

```ts
const ticket = await this.googleClient.verifyIdToken({
  idToken: credential,
  audience: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
});
const payload = ticket.getPayload();
```

`verifyIdToken` бросает исключение на плохой подписи, истёкшем токене или чужом `aud`. Поймать его и вернуть `UnauthorizedException`, без подробностей ошибки в ответе.

Дополнительно проверить `payload.email_verified === true`, иначе отказ.

**4.2. Найти или создать пользователя.** Искать по `googleId` (`payload.sub`), а не по email: email у Google-аккаунта может смениться, `sub` нет.

Личный календарь при первом входе удобно создать в том же `upsert` вложенной записью. Ветка `create` выполняется только для нового пользователя, `update` при каждом входе:

```ts
prisma.user.upsert({
  where: { googleId: payload.sub },
  update: { email, name, avatarUrl },
  create: {
    googleId: payload.sub,
    email,
    name,
    avatarUrl,
    memberships: { create: { role: 'OWNER', calendar: { create: { name: '...' } } } },
  },
});
```

Это одна операция, поэтому пользователь без календаря не появится. Название календаря здесь хранится как данные, а не текст интерфейса. Можно оставить пустым или нейтральным и подставлять перевод на фронтенде, реши сам.

**4.3. Создать сессию.**

- токен: `randomBytes(32).toString('base64url')` из `node:crypto`;
- в БД: `createHash('sha256').update(token).digest('hex')`, `expiresAt` через 30 дней, `userAgent` из заголовка запроса;
- клиенту уходит токен в открытом виде, только в cookie.

**4.4. Поставить cookie.** В контроллере `@Res({ passthrough: true }) res: Response`. `passthrough` нужен, чтобы Nest по-прежнему сам сериализовал ответ.

```ts
res.cookie('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_MS,
});
```

`secure: true` работает и локально: браузеры считают `http://localhost` безопасным контекстом. Имя cookie и TTL держи константами в одном месте, они нужны ещё в logout.

В ответе вернуть профиль пользователя (`id`, `email`, `name`, `avatarUrl`), чтобы фронтенду не нужен был лишний запрос к `/me`.

## Шаг 5. Бэкенд: guard, `/me`, logout

**Guard.** `AuthGuard implements CanActivate`:

1. взять `req.cookies.session`, нет его → `UnauthorizedException`;
2. захешировать и найти `Session` по `tokenHash` вместе с `user`;
3. нет сессии или `expiresAt` в прошлом → 401. Просроченную можно сразу удалить;
4. если `lastUsedAt` старше суток: обновить `lastUsedAt = now`, `expiresAt = now + 30 дней` и заново поставить cookie с новым `maxAge`. Так запись в БД бывает не чаще раза в сутки на сессию, а не на каждый запрос;
5. положить пользователя в `req.user` и вернуть `true`.

**Глобально, а не на каждом контроллере.** Зарегистрировать через `{ provide: APP_GUARD, useClass: AuthGuard }`. Открытые эндпоинты помечать декоратором `@Public()` (`SetMetadata`), guard читает его через `Reflector`. Так новый эндпоинт по умолчанию закрыт: забыть защиту хуже, чем забыть открыть.

Открытыми должны быть только `POST /auth/google` и шаблонный `GET /` (его можно удалить).

**`@CurrentUser()`.** Свой декоратор параметра через `createParamDecorator`, достаёт `req.user`. Контроллеры не лезут в `req` руками.

**Эндпоинты:**

- `GET /api/auth/me`: вернуть `@CurrentUser()`. Фронтенд вызывает его при загрузке, чтобы узнать, есть ли сессия;
- `POST /api/auth/logout`: удалить сессию из БД и `res.clearCookie('session', { тот же path и опции })`. С другими опциями браузер не удалит cookie.

**Чистка старых сессий.** Пока хватит удаления просроченных в guard. До публичного запуска добавить регулярную очистку (`@nestjs/schedule`, раз в сутки `deleteMany` по `expiresAt`), иначе таблица будет расти от брошенных устройств.

## Шаг 6. Фронтенд: прокси и HttpClient

**Прокси.** `apps/frontend/proxy.conf.json`:

```json
{ "/api": { "target": "http://localhost:3000", "secure": false } }
```

В `angular.json` → `serve.options.proxyConfig: "proxy.conf.json"`. После этого фронтенд ходит на `/api/...` относительным путём, и cookie работает как на одном домене.

**HttpClient.** В `app.config.ts` добавить `provideHttpClient(withFetch())`. `withCredentials` не нужен: для запросов на тот же origin браузер шлёт cookie сам.

**Client ID.** `npx ng generate environments`, в `environment.ts` поле `googleClientId`.

## Шаг 7. Фронтенд: AuthService на signals

`core/auth/auth.service.ts`, `providedIn: 'root'`:

- `user = signal<User | null>(null)` и `isLoggedIn = computed(() => this.user() !== null)`;
- `loadMe()`: `GET /api/auth/me`. 200 → `user.set(...)`, 401 → `user.set(null)`. Ошибку 401 здесь не надо показывать как ошибку, это нормальное состояние «не вошёл»;
- `loginWithGoogle(credential)`: `POST /api/auth/google`, записать пользователя в signal;
- `logout()`: `POST /api/auth/logout`, `user.set(null)`, переход на `/login`.

Состояние в signals, HTTP через `HttpClient`. Для одиночных запросов удобно `firstValueFrom`, RxJS-цепочки здесь не нужны.

**Загрузка при старте.** `provideAppInitializer(() => inject(AuthService).loadMe())` в `app.config.ts`. Приложение дождётся ответа `/me`, и guard не будет гадать.

Тип `User` пока описать вручную. Когда появится генерация клиента из Swagger (этап 2), заменить на сгенерированный: правило проекта запрещает дублировать типы.

## Шаг 8. Фронтенд: кнопка Google

**Скрипт GIS.** В `index.html`: `<script src="https://accounts.google.com/gsi/client" async></script>`. Типы: `npm i -D @types/google.accounts` и `"types": ["google.accounts"]` в `tsconfig.app.json`.

**Страница входа** `features/auth/pages/login`. Логика в `afterNextRender` (скрипт работает с DOM, а элемент для кнопки должен уже существовать):

```ts
google.accounts.id.initialize({
  client_id: environment.googleClientId,
  callback: response => this.auth.loginWithGoogle(response.credential),
});
google.accounts.id.renderButton(this.buttonHost().nativeElement, {
  theme: 'outline',
  size: 'large',
});
```

`buttonHost` — это `viewChild.required<ElementRef>('googleButton')`.

Подводные камни:

- **Скрипт подключён с `async`**, к моменту рендера `google` может ещё не существовать. Самое простое: ждать `window.onload` или проверять `typeof google !== 'undefined'` с повтором. Аккуратнее: сервис, который грузит скрипт сам и отдаёт `Promise`.
- **Callback GIS вызывается вне Angular.** Приложение zoneless, и обновление signal внутри callback перерисует всё как надо. Это ещё одна причина держать состояние в signals.
- **Тексты.** Кнопку Google локализует сама (`locale` в опциях `renderButton`). Остальные строки страницы входа ведутся через i18n по правилам проекта. Если Transloco ещё нет, пометь их и перенеси, когда он появится.

## Шаг 9. Фронтенд: guard маршрутов

`CanActivateFn` в `core/auth/auth.guard.ts`: `inject(AuthService).isLoggedIn()` → `true`, иначе `inject(Router).createUrlTree(['/login'])`. Возвращать `UrlTree`, а не вызывать `navigate`: так роутер корректно отменит текущий переход.

Маршруты:

- `/login`: открыт. Если пользователь уже вошёл, редирект на `/calendar` (второй маленький guard);
- `/calendar` и всё остальное: `canActivate: [authGuard]`;
- `''` → `/calendar`.

**401 посреди работы** (сессия истекла): `HttpInterceptorFn`, который на 401 от любого запроса, кроме `/auth/me`, делает `user.set(null)` и уводит на `/login`. Можно добавить позже, когда появятся запросы к данным.

## Шаг 10. Проверка

Вручную:

1. `npm run db:up`, `npm run back`, `npm run front`.
2. Открыть `/calendar` → редирект на `/login`.
3. Войти → попасть в календарь. В DevTools → Application → Cookies видна `session` с флагами HttpOnly, Secure, SameSite=Lax.
4. `npm run prisma:studio`: есть `User`, личный `Calendar`, `CalendarMember` с ролью OWNER, `Session`.
5. Перезагрузить страницу → остаёшься внутри (сработал `/me`).
6. Выйти → cookie удалена, строки `Session` нет, `/calendar` снова ведёт на `/login`.
7. Войти повторно → новый календарь **не** создаётся.

Автотесты (минимум):

- e2e бэкенда: `GET /api/auth/me` без cookie → 401; `POST /api/auth/google` с мусором → 401 (вызывать Google в тестах не нужно, мусорный токен отклоняется до сети);
- unit `AuthService` с замоканным `OAuth2Client`: новый пользователь получает календарь, повторный вход его не создаёт.

## Чего здесь не делаем

- Список разрешённых email: перед продом (см. `05-backend-auth.md`). Если хочется сразу, это одна проверка `ALLOWED_EMAILS` в шаге 4.
- Refresh-токены: с сессией в БД они не нужны.
- Экран «активные сессии» в настройках: поля под него уже есть, интерфейс позже.
- `helmet` и `@nestjs/throttler`: этап продакшена. `/auth/google` первым получит лимит запросов.

## Чек-лист

- [ ] Google Cloud: consent screen (Testing), тестовые пользователи, Client ID, оба origin
- [ ] `GOOGLE_CLIENT_ID` в `.env` и `.env.example`
- [ ] Модель `Session` и миграция
- [ ] `main.ts`: префикс `/api`, `cookieParser`, `ValidationPipe`
- [ ] `POST /api/auth/google`: проверка токена, upsert с личным календарём, сессия, cookie
- [ ] Глобальный `AuthGuard`, `@Public()`, `@CurrentUser()`
- [ ] `GET /api/auth/me`, `POST /api/auth/logout`
- [ ] Фронтенд: прокси, `provideHttpClient`, environment с Client ID
- [ ] `AuthService` на signals, `loadMe` в app initializer
- [ ] Страница входа с кнопкой GIS
- [ ] Guard маршрутов, редиректы
- [ ] Ручная проверка по шагу 10, e2e на 401
