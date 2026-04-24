# Telegram Taxi Mini App MVP

MVP-основа сервиса заказа такси в Telegram с тремя ролями:

- клиент оформляет поездку;
- водитель проходит модерацию, выходит на линию и принимает заказы;
- администратор управляет водителями, заказами и тарифами.

Проект собран как монорепозиторий:

- `apps/api` — backend API и базовая бизнес-логика;
- `apps/mini-app` — React mini app для клиентского, водительского и админского сценария;
- `packages/shared` — общие типы и статусы;
- `infra/schema.sql` — SQL-схема для PostgreSQL;
- `docs/architecture.md` — архитектура и план развития.

## Что уже есть

- доменная модель под роли `client`, `driver`, `admin`;
- статусы поездки и защита от повторного принятия заказа;
- расчёт стоимости по тарифу `min + km + minute`;
- API для регистрации клиента и водителя;
- API для создания заказа, получения оценки цены, отмены поездки;
- API для водителя: онлайн-статус, доступные заказы, принятие, смена статусов, история;
- API для администратора: модерация водителей, смена статуса заказа, тарифы, dashboard;
- mini app с экранами под все три роли;
- `docker-compose` для PostgreSQL и Redis.

## Структура статусов заказа

Основной путь поездки:

1. `created`
2. `searching_driver`
3. `driver_assigned`
4. `driver_on_the_way`
5. `driver_arrived`
6. `trip_started`
7. `trip_completed`

Также поддерживаются отмены:

- `cancelled_by_client`
- `cancelled_by_driver`
- `cancelled_by_admin`

## Быстрый старт

После установки Node.js:

```bash
npm install
npm run dev:api
npm run dev:mini
```

API по умолчанию ожидается на `http://localhost:4000`.

## Как теперь работает бот

После заполнения `.env`:

- backend поднимает Express API;
- если указан `BOT_TOKEN`, backend запускает Telegram long polling;
- бот обрабатывает `/start`, выбор роли, регистрацию клиента и водителя;
- бот показывает клавиатуры ролей и открывает mini app по `MINI_APP_URL`;
- mini app берёт `role` и `telegramId` из query string и ходит в backend API;
- создание заказа из mini app отправляет уведомления клиенту и всем активным водителям в городе;
- водитель может принять заказ и менять статусы прямо в боте;
- администратор может модерировать водителей в боте и в mini app.

Минимальные переменные окружения:

```bash
BOT_TOKEN=...
ADMIN_TELEGRAM_IDS=123456789
MINI_APP_URL=https://your-domain.example.com
VITE_API_URL=https://api.your-domain.example.com
```

Для локальной отладки mini app можно открыть:

```bash
http://localhost:5173/?role=client&telegramId=100000002
http://localhost:5173/?role=driver&telegramId=100000003
http://localhost:5173/?role=admin&telegramId=100000001
```

## Деплой Без VPS

Рекомендуемая схема:

- `apps/mini-app` -> Vercel
- `apps/api` -> Render Web Service

Подготовленные файлы:

- `render.yaml` — шаблон сервиса для Render из корня репозитория
- `apps/mini-app/vercel.json` — конфиг Vercel для mini app

Переменные для Render:

```bash
BOT_TOKEN=...
ADMIN_TELEGRAM_IDS=8262211394
MINI_APP_URL=https://your-mini-app.vercel.app
POSTGRES_URL=postgres://taxi:taxi@localhost:5432/taxi_app
REDIS_URL=redis://localhost:6379
YANDEX_MAPS_API_KEY=
```

Переменные для Vercel:

```bash
VITE_API_URL=https://your-render-service.onrender.com
```

## Дальнейшие шаги для продакшн-версии

1. Добавить безопасную проверку `initData` Telegram WebApp на backend.
2. Заменить in-memory store на PostgreSQL + Redis.
3. Интегрировать карту и геокодинг через Яндекс.Карты или 2ГИС.
4. Добавить полноценную авторизацию и роли через Telegram WebApp.
5. Вынести админку в отдельный web-интерфейс или защищённый Telegram flow.
6. Подключить очередь уведомлений и аудит-лог.

## Ограничения текущего MVP

- данные backend сейчас хранятся в памяти процесса;
- используется polling, но нет production webhook-контура;
- нет загрузки файлов документов и фото в объектное хранилище;
- нет проверки подлинности `initData` от Telegram на backend;
- нет реальной маршрутизации по карте и онлайн-оплаты.
