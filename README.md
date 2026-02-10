# 🎰 Weekend Millions - Backend API

RESTful API сервер для криптовалютной лотереи на блокчейне TON.

## ✨ Особенности

- 🔐 **JWT + Telegram WebApp** авторизация
- 💎 **TON Blockchain** интеграция для платежей
- 🎲 **Provably Fair** система розыгрышей
- 📊 **Prisma ORM** с PostgreSQL
- 🔒 **Security** — Helmet, Rate Limiting, Input Validation
- 📈 **Monitoring** — Prometheus metrics, Sentry
- 🤖 **Telegram Bot** для уведомлений

## 🚀 Быстрый старт

```bash
# Установка зависимостей
npm install

# Настройка окружения
cp .env.example .env

# Миграции базы данных
npm run migrate

# Запуск dev сервера
npm run dev
```

API будет доступен на `http://localhost:3001`

## 🔧 Конфигурация

См. `.env.example` для списка всех переменных окружения.

### Основные переменные:

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="your-secret-key"
TELEGRAM_BOT_TOKEN="your-bot-token"
TON_WALLET_ADDRESS="your-wallet"
```

## 📦 Технологии

| Категория | Технологии |
|-----------|------------|
| Runtime | Node.js 18+, TypeScript |
| Framework | Express.js |
| Database | PostgreSQL, Prisma ORM |
| Blockchain | TON Connect, @ton/core |
| Auth | JWT, Telegram WebApp |
| Security | Helmet, express-rate-limit, Joi |
| Monitoring | Sentry, Prometheus |

## 🏗️ Структура проекта

```
src/
├── routes/          # API endpoints
├── services/        # Business logic
├── middleware/      # Auth, validation, rate limiting
├── utils/           # Helpers
├── types/           # TypeScript types
└── server.ts        # Entry point

prisma/
├── schema.prisma    # Database schema
├── migrations/      # DB migrations
└── seed.ts          # Seed data
```

## 📚 API Документация

- [Полная документация API](./API_DOCUMENTATION.md)
- Swagger UI: `http://localhost:3001/api-docs` (в development)

### Основные endpoints:

| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/api/auth/telegram` | Telegram авторизация |
| GET | `/api/lotteries` | Список лотерей |
| POST | `/api/tickets/purchase` | Покупка билета |
| GET | `/api/draws/:id/results` | Результаты розыгрыша |
| GET | `/api/users/me` | Профиль пользователя |

## 💰 Finance API (Admin Only)

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/finance/summary` | Общая статистика (GMV, revenue, payouts) |
| GET | `/api/admin/finance/transactions` | Список транзакций с фильтрами |
| GET | `/api/admin/finance/revenue` | Revenue по периодам |
| GET | `/api/admin/finance/export` | CSV экспорт транзакций |
| GET | `/api/admin/finance/reconciliation` | Сверка blockchain ↔ БД |
| GET | `/api/admin/finance/top-users` | Топ пользователей по тратам |

### Query Parameters

#### Summary & Revenue
- `startDate` - Начало периода (YYYY-MM-DD)
- `endDate` - Конец периода (YYYY-MM-DD)

#### Transactions
- `page` - Номер страницы (default: 1)
- `limit` - Записей на страницу (default: 50)
- `type` - DEPOSIT | PAYOUT | WITHDRAWAL
- `status` - PENDING | COMPLETED | FAILED
- `userId` - ID пользователя
- `sortBy` - Поле сортировки (default: createdAt)
- `sortOrder` - asc | desc (default: desc)

#### Export
- `format` - csv | json (default: csv)

## 🔗 Связанные репозитории

- [lottery-frontend](https://github.com/bobby-singer89/lottery-frontend) — React + Vite frontend

## 🔒 Безопасность

См. [SECURITY.md](./SECURITY.md) для информации о безопасности.

## 💾 Database Backups

### Автоматические бэкапы

База данных автоматически бэкапится каждый день в 03:00 UTC через GitHub Actions.

Бэкапы хранятся в [GitHub Releases](../../releases) и автоматически удаляются через 14 дней.

### Ручной бэкап

```bash
# Установить переменную окружения
export DATABASE_URL='postgresql://...'

# Запустить скрипт
./scripts/backup-database.sh ./backups
```

### Восстановление из бэкапа

```bash
# Скачать и распаковать бэкап из GitHub Releases
gunzip backup_YYYYMMDD_HHMMSS.sql.gz

# Восстановить
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
```

### Запуск бэкапа вручную через GitHub

1. Перейти в **Actions** → **Database Backup**
2. Нажать **Run workflow**
3. Указать количество дней хранения (опционально)
4. Нажать **Run workflow**

## 📝 Лицензия

MIT License
