# Интеграционные тесты API

Требуют реальный Postgres, поднятый и мигрированный.

## Запуск

```bash
# 1. Поднять БД (сервис db из infra/docker-compose.yml)
pnpm db:up

# 2. Применить миграции — DATABASE_URL нужна процессу миграции на хосте
export DATABASE_URL="postgres://agentic_game:agentic_game_dev_password@localhost:5432/agentic_game"
pnpm db:migrate

# 3. Прогнать интеграционные тесты той же переменной окружения
DATABASE_URL="$DATABASE_URL" pnpm --filter @agentic-game/api test -- tests/integration
```

## Известная особенность окружения (зафиксировано qa-test-expert при написании тестов)

На машине, где эти тесты писались, порт **5432 на хосте уже был занят**
сторонним процессом (не related к этому проекту — `lsof` не показал
процесс с обычными правами, вероятно системная/фоновая служба Postgres).
`pnpm db:up` в чистом виде падает с `address already in use`.

Обход (сделан для написания и локального прогона этих тестов, **не**
внесён в infra/docker-compose.yml или .env — это не моя зона владения,
см. CLAUDE.md):

```bash
POSTGRES_PORT=5433 docker compose --env-file .env -f infra/docker-compose.yml up -d db
export DATABASE_URL="postgres://agentic_game:agentic_game_dev_password@localhost:5433/agentic_game"
pnpm --filter @agentic-game/api migrate
DATABASE_URL="$DATABASE_URL" pnpm --filter @agentic-game/api test -- tests/integration
```

Если у вас порт 5432 свободен, обычная команда `pnpm db:up` (без
переопределения `POSTGRES_PORT`) должна сработать как задокументировано в
корневом package.json.

## Поведение без БД

Если `DATABASE_URL` не задана или подключение не удаётся (тест сам
проверяет это реальным `SELECT 1`, а не просто наличием переменной — см.
`probeRealDatabase()` в `scores-leaderboard.integration.test.ts`), весь
`describe` помечается `skipIf` и тесты показываются как **skipped**, а не
falsely-passing. В выводе будет предупреждение
`[integration] Postgres недоступен ...`.

## Почему TRUNCATE, а не отдельная БД на процесс

`afterEach` делает `TRUNCATE TABLE scores` между тестами вместо поднятия
отдельной БД/схемы на тест — таблица одна и простая, тестов немного,
подходящий компромисс скорости и изоляции для этого объёма. Если тестов
станет значительно больше и параллелизм по файлам начнёт создавать гонки
за одну таблицу — стоит рассмотреть транзакционный rollback на тест или
отдельную БД на воркер.
