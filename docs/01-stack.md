# Стек

Версии не фиксируем в документе. При старте берём актуальные стабильные и проверяем совместимость (FullCalendar поддерживает Angular 16–22).

## Фронтенд

- **Angular** (standalone-компоненты, signals).
- **Angular Material** + CDK (диалоги, выбор даты, меню, формы). Тёмная и светлая темы через тему Material.
- **FullCalendar v7**:
  - установка: `npm install --save @fullcalendar/angular@7 fullcalendar@7 temporal-polyfill`
  - пакет `fullcalendar` напрямую не импортируем, только `@fullcalendar/angular`
  - нужны плагины видов (месяц, при необходимости multi-month) и тема. Темы v7: Breezy, Forma, Monarch, Pulse, у всех есть тёмные варианты. Точные пути импортов смотреть в доках v7, а не в туториалах под v6
  - платные плагины (resource-timeline и т. п.) не нужны
- **i18n**: рекомендую Transloco (смена языка на лету, JSON-файлы по языкам). `@angular/localize` собирает отдельные бандлы на язык и для переключения на лету не подходит. Это решение стоит подтвердить.
- **Даты**: `date-fns`; `temporal-polyfill` нужен FullCalendar.
- **Повторы**: `rrule` (строки формата RFC 5545). Плагин FullCalendar для rrule проверить в доках v7.
- **Иконки**: Simple Icons (`simple-icons`) для брендов, Lucide или Material Icons для общих значков, эмодзи.
- **Клиент API**: генерация из OpenAPI (Swagger) бэкенда, чтобы не дублировать типы вручную.

## Бэкенд

- **NestJS** (модули, DI, guards, pipes).
- **Prisma** + миграции (`prisma migrate`).
- **Валидация**: `class-validator` + `class-transformer`, DTO на каждый эндпоинт.
- **OpenAPI**: `@nestjs/swagger`.
- **Авторизация**: `google-auth-library` (проверка Google ID token), `@nestjs/jwt`, `cookie-parser`. Сессия в httpOnly-cookie.
- **Безопасность**: `helmet`, `@nestjs/throttler` (лимиты запросов).
- **Конфиг**: `@nestjs/config`, секреты в переменных окружения.
- **Тесты**: Jest (по умолчанию в Nest).

## База данных

- **PostgreSQL** в Docker для локальной разработки.
- Даты: `timestamptz`.
- Позже при необходимости `pgvector` в той же БД.

## Инфраструктура

- **Docker Compose**: Nest + Postgres + обратный прокси.
- **Один домен** для фронтенда и API (API по пути `/api`) через Caddy или nginx. Так нет проблем с CORS и cookie.
- **HTTPS**: Let's Encrypt (Caddy делает автоматически).
- **Бэкапы**: `pg_dump` по расписанию и копия в другое место.
- **Хостинг**: VPS или Railway/Fly.io (решить ближе к деплою).
- **Google OAuth**: проект в Google Cloud Console, Client ID. В режиме Testing входят только добавленные тестовые пользователи, для двух человек этого достаточно.

## Отвергнутые варианты

- Firebase/Supabase: не дают освоить серверный код.
- SQLite: подошёл бы по объёму, но Postgres ближе к реальной практике и совместим с будущим `pgvector`.
- Свой календарь с нуля: многодневные события, ресайз и раскладка полос слишком трудоёмки. Остаётся запасным вариантом, если проверка FullCalendar (см. `04-calendar-frontend.md`) не пройдёт.
- Загрузка картинок в БД: заменена на встроенные иконки, эмодзи и ссылки.
- Вход по паролю: не нужен.
