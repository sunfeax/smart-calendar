# Выкладка в прод

Один VPS, всё в Docker Compose (`docker-compose.prod.yaml`):

- `db`: Postgres, наружу не открыт.
- `migrate`: один раз применяет миграции (`prisma migrate deploy`) и завершается.
- `backend`: Nest, стартует после успешных миграций, наружу не открыт.
- `web`: Caddy с собранным фронтом. Отдаёт статику, проксирует `/api/*` в `backend`, сам получает и продлевает HTTPS-сертификат Let's Encrypt. Открыты только порты 80 и 443.

Образы: `apps/backend/Dockerfile` (стадия `build` нужна для миграций, `runtime` только с прод-зависимостями), `apps/frontend/Dockerfile` (сборка Angular, затем образ Caddy). Контекст сборки: корень репозитория, лишнее отсекает `.dockerignore`. Конфиг Caddy: `deploy/Caddyfile`.

## Что нужно заранее

- VPS с Linux (1–2 ГБ памяти достаточно), доступ по SSH, Docker с плагином compose.
- Домен. A-запись (и AAAA, если есть IPv6) указывает на IP сервера. Без домена HTTPS и Google OAuth не заработают.
- В Google Cloud Console у OAuth-клиента в Authorized JavaScript origins добавить `https://<домен>`.

## Первый запуск

```bash
git clone <repo> smart-calendar && cd smart-calendar
cp .env.example .env   # заполнить: POSTGRES_*, GOOGLE_CLIENT_ID, DOMAIN
docker compose -f docker-compose.prod.yaml up -d --build
docker compose -f docker-compose.prod.yaml ps
```

Пароль Postgres без символов `@ : / ? #`: он подставляется в `DATABASE_URL`.

Обновление: `git pull`, затем та же команда `up -d --build`. Миграции применятся сами.

## Защита

- Лимиты запросов (`@nestjs/throttler`): 300 в минуту с одного IP на всё API, 10 в минуту на вход через Google и принятие приглашения. Сверх лимита ответ 429. Счётчики в памяти процесса: это работает, пока бэкенд один. Для нескольких экземпляров нужно хранилище в Redis.
- Nest доверяет заголовку `X-Forwarded-For` только от локальных адресов (Caddy в сети Docker), поэтому лимит считается по настоящему IP клиента.
- `helmet` на API, Swagger в проде выключен.
- Caddy: HTTPS с HSTS, тело запроса к API до 1 МБ, заголовки `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- CSP пока в режиме `Report-Only`: браузер пишет нарушения в консоль, но ничего не блокирует. После проверки в браузере на проде, если нарушений нет, переименовать заголовок в `Content-Security-Policy`.
- От объёмной DDoS-атаки приложение само не защитится. Бесплатный вариант: Cloudflare перед сервером (проксирование DNS). Тогда Caddy видит IP Cloudflare, и для честных лимитов нужно настроить доверие к его адресам.
