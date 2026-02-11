# SECRETS (lottery-backend)

Этот файл содержит список секретов, которые необходимо добавить в GitHub (Settings → Secrets and variables → Actions) или в GitHub Environment `production` для корректной работы workflow и деплоя backend.

ВАЖНО: НИКОГДА не помещайте реальные значения секретов в репозиторий. Здесь только имена и формат.

----

## Обязательный минимум (добавить СРАЗУ)

- DATABASE_URL
  - Формат: postgresql://<user>:<password>@<host>:<port>/<database>
  - Пример: postgresql://lottery_user:StrongPassw0rd@db.example.com:5432/lottery_prod
  - Где хранить: Environment `production` (recommended) или repository secret
  - Используется: backup workflow, prisma migrate deploy, production runtime

- JWT_SECRET
  - Формат: произвольная строка, рекомендуем 32+ байта в base64
  - Пример генерации: `openssl rand -base64 32`
  - Где хранить: repository secret или Environment `production`
  - Используется: подпись JWT

- SUPABASE_SERVICE_ROLE_KEY
  - Формат: длинный секретный ключ Supabase (service role)
  - Где хранить: Environment `production` (только серверная среда)
  - Используется: админские операции с Supabase

- SENTRY_DSN
  - Формат: DSN проекта Sentry
  - Где хранить: repository secret или Environment `production`
  - Используется: отправка ошибок в Sentry

- TELEGRAM_BOT_TOKEN
  - Формат: токен бота (строка вида 123456:ABC-DEF...)
  - Где хранить: repository secret
  - Используется: интеграция Telegram

- TON_WALLET_MNEMONIC
  - Формат: 24 слов (mnemonic phrase)
  - Где хранить: Environment `production` (never expose to clients)
  - Используется: payouts / on-chain operations

- REDIS_URL
  - Формат: redis://[:password@]<host>[:port][/db]
  - Пример: redis://:mypassword@redis.example.com:6379/0
  - Где хранить: repository secret or Environment

- DB_USER, DB_PASSWORD
  - Формат: отдельные значения если docker-compose использует их
  - Где хранить: repository secrets or Environment

- CODECOV_TOKEN (опционально)
  - Формат: токен Codecov для загрузки coverage (если обязательно)
  - Где хранить: repository secret

----

## Дополнительные (по использованию)

- DOCKER_USERNAME / DOCKER_PASSWORD (или DOCKER_REGISTRY_TOKEN)
  - Используется для пуша образов в Docker registry

- VERCEL_TOKEN / RENDER_API_KEY
  - Используются, если workflow управляет деплоем чере�� API

- S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
  - Используются, если бэкапы выгружаются в S3

- GRAFANA_PASSWORD
  - Используется в docker-compose provisioning (если задействовано)

- NPM_TOKEN
  - Если приватные npm пакеты используются в CI

- SLACK_WEBHOOK
  - Для уведомлений

----

## Как добавлять секреты (через веб-интерфейс GitHub)
1. Открой репозиторий → Settings → Secrets and variables → Actions.
2. Нажми "New repository secret".
3. Введи Name (например, DATABASE_URL) и Value (строка подключения).
4. Нажми "Add secret".

## Рекомендуем: использовать Environment (production)
1. Settings → Environments → New environment → "production".
2. Внутри environment выбери "Add secret" и добавь те же имена.
3. В Environment settings включи protection rules (required reviewers) — чтобы не выполнять прод-миграции без проверки.

## Как добавлять через gh CLI
(предварительно: gh auth login)

Пример для репозитория:
```
gh secret set DATABASE_URL --body 'postgresql://user:pass@host:5432/db' --repo Gor93rus/lottery-backend
```

Пример для environment production:
```
gh secret set DATABASE_URL --body 'postgresql://user:pass@host:5432/db' --repo Gor93rus/lottery-backend --env production
```

----

## Проверка
- После добавления секретов, можно вручную запустить workflow (Actions → нужный workflow → Run workflow) и посмотреть логи.
- Не печатай значение секретов в логах. Вместо этого проверяй их присутствие условным echo:
  - run: if [ -n "$DATABASE_URL" ]; then echo "DATABASE_URL set"; else echo "DATABASE_URL missing"; exit 1; fi

----

## Примечание по безопасности
- Никогда не публикуй секреты в чате/issue/PR.
- Если кто-то уволился или аккаунт скомпрометирован — ротируй ключи.
