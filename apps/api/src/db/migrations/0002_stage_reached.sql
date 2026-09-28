-- 0002_stage_reached.sql
--
-- Добавляет `stage_reached` в `scores`: номер этапа, которого достиг игрок
-- к моменту записи результата. Обслуживает контракт
-- packages/types/src/scores.ts (CreateScoreRequest.stageReached?,
-- ScoreRecord.stageReached, LeaderboardEntry.stageReached) — поле nullable
-- и необязательное на входе, т.к. более ранние клиенты его не отправляют
-- и старые строки его не имеют.
--
-- Транзакционная граница: как и в 0001_init.sql, её задаёт раннер
-- (migrate.ts) через BEGIN/COMMIT вокруг всего файла — здесь нет своих
-- BEGIN/COMMIT. Раннер подхватывает файл автоматически: listMigrationFiles()
-- в migrate.ts читает *.sql из ./migrations и сортирует по имени
-- (localeCompare), "0002_..." идёт после "0001_...", отдельная регистрация
-- не нужна.
--
-- Блокировки (проверено через Context7, /websites/postgresql_16,
-- ddl-alter.html и sql-altertable.html):
--   1. ADD COLUMN stage_reached integer без DEFAULT — новые строки получают
--      NULL, полной перезаписи таблицы не требуется (перезапись нужна
--      только при добавлении колонки с non-null DEFAULT на версиях до 11;
--      здесь дефолта нет вовсе, так что это не касается даже старых версий).
--      Операция быстрая, метаданные-only.
--   2. ADD CONSTRAINT ... CHECK — по документации ("Adding a table
--      constraint normally requires a full table scan to verify existing
--      data") ЛЮБОЙ ADD CONSTRAINT CHECK сканирует все существующие строки,
--      чтобы убедиться, что они удовлетворяют условию, НЕЗАВИСИМО от того,
--      пуста таблица или нет. Именно поэтому в 0001_init.sql это было не
--      проблемой (таблица создавалась пустой в той же транзакции), а здесь
--      это отдельное соображение: таблица `scores` уже может быть
--      наполнена.
--      ALTER TABLE в PostgreSQL берёт ACCESS EXCLUSIVE лок на всё время
--      выполнения оператора (табличные локи, explicit-locking.html) — то
--      есть на время этого сканирования читатели и писатели `scores`
--      блокируются. Поскольку добавляемая колонка ещё не существовала до
--      этой миграции, каждая существующая строка получает stage_reached =
--      NULL в рамках этого же ALTER, а условие констрейнта
--      `stage_reached IS NULL OR stage_reached >= 1` — это в точности тот
--      случай, для которого документация PostgreSQL прямо называет
--      сканирование БЫСТРЫМ: планировщику достаточно убедиться, что все
--      значения NULL (что тривиально верно сразу после ADD COLUMN), не
--      читая и не вычисляя ничего по содержимому строк.
--      НЕ ИСПОЛЬЗУЮ здесь NOT VALID + отдельный VALIDATE CONSTRAINT: тот
--      приём существует, чтобы избежать долгого ACCESS EXCLUSIVE на уже
--      наполненной таблице при дорогой проверке. Здесь проверка дешева
--      (весь набор данных для неё — только что созданные NULL), поэтому
--      усложнение до двух шагов ради этого не оправдано — это решение,
--      не забытая деталь.
--      ОТКРЫТЫЙ ВОПРОС backend-architect/devops-engineer: если к моменту
--      прогона на реальной среде таблица `scores` окажется ОЧЕНЬ большой
--      (сотни млн строк), даже "быстрое" сканирование NULL-значений держит
--      ACCESS EXCLUSIVE лок на время прохода по всем страницам таблицы —
--      это стоит замерить на копии прод-объёма перед прогоном там, а не
--      полагаться только на характер этой миграции на dev-базе.
--
-- Индекс `scores_leaderboard_idx` (level_id, score DESC, duration_ms ASC
-- NULLS LAST) не меняю: stage_reached — информационное поле, ни один
-- известный запрос не фильтрует и не сортирует по нему.

ALTER TABLE scores
    ADD COLUMN stage_reached integer;

-- Контракт: stageReached — nullable, а если задан — целое >= STAGE_REACHED_MIN
-- (packages/types/src/scores.ts, STAGE_REACHED_MIN = 1). Именование в стиле
-- существующих CHECK'ов таблицы (scores_<column>_<rule>).
ALTER TABLE scores
    ADD CONSTRAINT scores_stage_reached_min CHECK (
        stage_reached IS NULL OR stage_reached >= 1
    );
