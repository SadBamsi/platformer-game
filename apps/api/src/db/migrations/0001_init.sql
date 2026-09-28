-- 0001_init.sql
--
-- Первая миграция: таблица `scores`, обслуживающая
--   POST /api/scores      (INSERT ... RETURNING)
--   GET  /api/leaderboard (SELECT ... WHERE level_id = $1 ORDER BY ... LIMIT $2)
--
-- Контракт API: packages/types/src/scores.ts (CreateScoreRequest, ScoreRecord,
-- LeaderboardEntry). Эта миграция не меняет и не дублирует контракт — только
-- обслуживает его.
--
-- Транзакционная граница: её задаёт РАННЕР (migrate.ts), который оборачивает
-- каждый файл в BEGIN/COMMIT вместе с записью в schema_migrations. Свои
-- BEGIN/COMMIT здесь недопустимы: вложенный BEGIN даёт лишь WARNING, а
-- вложенный COMMIT досрочно фиксирует транзакцию раннера, после чего запись
-- о применении миграции выполняется уже вне транзакции и атомарность
-- «DDL + отметка о применении» теряется.
-- CREATE INDEX здесь НЕ использует CONCURRENTLY: таблица создаётся пустой в
-- этой же транзакции, блокировать нечего. Начиная со следующей миграции,
-- если потребуется индекс на уже наполненной таблице — это должно идти вне
-- транзакции через CREATE INDEX CONCURRENTLY, а текущий раннер (migrate.ts)
-- такое не поддерживает (см. его файл и HANDOFF по этому поводу).

CREATE TABLE scores (
    -- gen_random_uuid() — встроенная функция ядра PostgreSQL (раздел
    -- "9.14 UUID Functions" в официальной документации, не pgcrypto),
    -- доступна без CREATE EXTENSION начиная с PostgreSQL 13. Подтверждено
    -- через Context7 (/websites/postgresql_16, functions-uuid.html).
    id            uuid        NOT NULL DEFAULT gen_random_uuid(),

    player_name   text        NOT NULL,
    score         integer     NOT NULL,
    level_id      text        NOT NULL,
    duration_ms   integer,
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT scores_pkey PRIMARY KEY (id),

    -- Контракт: playerName — 1..20 символов (PLAYER_NAME_MIN_LENGTH /
    -- PLAYER_NAME_MAX_LENGTH в packages/types/src/scores.ts). API обрезает
    -- пробелы по краям до записи, но гарантию даёт констрейнт, а не trim
    -- в приложении.
    CONSTRAINT scores_player_name_length CHECK (
        char_length(player_name) BETWEEN 1 AND 20
    ),

    -- Контракт: score — целое >= 0.
    CONSTRAINT scores_score_non_negative CHECK (score >= 0),

    -- Контракт: durationMs — nullable, а если задан — целое >= 0.
    CONSTRAINT scores_duration_ms_non_negative CHECK (
        duration_ms IS NULL OR duration_ms >= 0
    ),

    -- levelId обязателен и не должен быть пустым/состоять из пробелов.
    -- Это свободный текст, которым владеет игровой контент (2d-game-designer
    -- / nextjs-frontend-engineer), а не фиксированный enum — поэтому здесь
    -- нет ни lookup-таблицы, ни проверки формата строки, только "не пусто".
    CONSTRAINT scores_level_id_not_blank CHECK (btrim(level_id) <> '')
);

-- Обслуживает GET /api/leaderboard:
--   WHERE level_id = $1
--   ORDER BY score DESC, duration_ms ASC NULLS LAST
--   LIMIT $2
--
-- Порядок колонок:
--   1. level_id     — всегда предикат равенства (каждое чтение лидерборда
--                      скопировано на один уровень), ведущая колонка делит
--                      B-tree на диапазоны по уровню.
--   2. score DESC    — основной ключ сортировки, совпадает с ORDER BY.
--   3. duration_ms ASC NULLS LAST — тай-брейкер при равном score. ASC +
--      NULLS LAST — это поведение B-tree и ORDER BY в PostgreSQL по
--      умолчанию (подтверждено через Context7, /websites/postgresql_16,
--      queries-order.html и indexes-ordering.html), здесь прописано явно
--      для самодокументируемости. NULLS LAST означает, что попытка без
--      зафиксированного времени прохождения ранжируется НИЖЕ, чем такая же
--      по очкам попытка с реальным временем — это осознанное бизнес-решение,
--      не побочный эффект.
--
-- Поскольку порядок колонок индекса дословно совпадает с ORDER BY запроса,
-- планировщик может пройти индекс по порядку и остановиться на LIMIT, не
-- делая отдельный Sort — это "top-N via index scan", ключевой паттерн для
-- лидерборда.
CREATE INDEX scores_leaderboard_idx
    ON scores (level_id, score DESC, duration_ms ASC NULLS LAST);
