import type { Pool, PoolClient } from 'pg';

import {
  LEADERBOARD_DEFAULT_LIMIT,
  LEADERBOARD_MAX_LIMIT,
  type CreateScoreRequest,
  type LeaderboardEntry,
  type ScoreRecord,
} from '@agentic-game/types';

import { pool } from '../pool.js';

/**
 * Параметризованные запросы для таблицы `scores` (см.
 * apps/api/src/db/migrations/0001_init.sql). Единственное место в проекте,
 * где snake_case колонки БД превращаются в camelCase поля контракта
 * "@agentic-game/types" — весь остальной код должен работать с
 * ScoreRecord / LeaderboardEntry, а не с сырыми строками БД.
 *
 * Второй параметр каждой функции — `executor`. По умолчанию это общий
 * `pool`, но можно передать `PoolClient`, полученный внутри чужой
 * транзакции (например, если backend-architect позже захочет вставить
 * score атомарно вместе с чем-то ещё). Один INSERT и один SELECT сами по
 * себе транзакции не требуют — каждый выполняется как отдельный неявный
 * statement.
 */

/** Сырая строка `scores` в формате, который возвращает RETURNING. */
interface ScoreRow {
  id: string;
  player_name: string;
  score: number;
  level_id: string;
  duration_ms: number | null;
  stage_reached: number | null;
  created_at: Date;
}

/** Сырая строка результата запроса лидерборда. */
interface LeaderboardRow {
  rank: number;
  player_name: string;
  score: number;
  duration_ms: number | null;
  stage_reached: number | null;
  created_at: Date;
}

function toScoreRecord(row: ScoreRow): ScoreRecord {
  return {
    id: row.id,
    playerName: row.player_name,
    score: row.score,
    levelId: row.level_id,
    durationMs: row.duration_ms,
    stageReached: row.stage_reached,
    createdAt: row.created_at.toISOString(),
  };
}

function toLeaderboardEntry(row: LeaderboardRow): LeaderboardEntry {
  return {
    rank: row.rank,
    playerName: row.player_name,
    score: row.score,
    durationMs: row.duration_ms,
    stageReached: row.stage_reached,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Вставляет результат прохождения и возвращает записанную строку.
 *
 * Обслуживает POST /api/scores. Валидация формата (длина имени, диапазон
 * score/durationMs) — ответственность вызывающего слоя (backend-architect,
 * см. packages/types/src/scores.ts); здесь она продублирована в виде
 * CHECK-констрейнтов таблицы как страховка, а не как основной механизм.
 *
 * `input.durationMs === undefined` превращается в SQL NULL — драйвер pg
 * конвертирует undefined в null автоматически (подтверждено через
 * Context7, /brianc/node-postgres, features/queries.mdx), но `?? null`
 * оставлен явно для читаемости.
 */
export async function insertScore(
  input: CreateScoreRequest,
  executor: Pool | PoolClient = pool,
): Promise<ScoreRecord> {
  const result = await executor.query<ScoreRow>(
    `INSERT INTO scores (player_name, score, level_id, duration_ms, stage_reached)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, player_name, score, level_id, duration_ms, stage_reached, created_at`,
    [
      input.playerName,
      input.score,
      input.levelId,
      input.durationMs ?? null,
      input.stageReached ?? null,
    ],
  );

  // noUncheckedIndexedAccess: result.rows[0] типизируется как ScoreRow |
  // undefined. INSERT ... RETURNING на успехе всегда возвращает ровно одну
  // строку, но мы не доверяем этому вслепую — если строки нет, это значит
  // что-то сломано на уровне драйвера/сервера, а не ожидаемый штатный путь.
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('INSERT ... RETURNING scores не вернул ни одной строки');
  }

  return toScoreRecord(row);
}

export interface LeaderboardQueryInput {
  levelId: string;
  /** По умолчанию LEADERBOARD_DEFAULT_LIMIT, максимум LEADERBOARD_MAX_LIMIT. */
  limit?: number;
}

/**
 * Защитный клэмп на случай, если вызывающий код (или баг в нём) передаст
 * limit вне диапазона контракта. Контракт (packages/types/src/scores.ts)
 * уже описывает эти границы — API-слой обязан валидировать входящий
 * query-параметр сам, это не замена той валидации, а страховка на границе
 * с БД: сюда же может прийти внутренний вызов, а не только HTTP-запрос.
 */
function clampLimit(limit: number | undefined): number {
  const requested = limit ?? LEADERBOARD_DEFAULT_LIMIT;
  if (!Number.isInteger(requested)) {
    return LEADERBOARD_DEFAULT_LIMIT;
  }
  return Math.min(Math.max(requested, 1), LEADERBOARD_MAX_LIMIT);
}

/**
 * Отдаёт топ лидерборда для одного уровня, отсортированный по score убыв.,
 * при равенстве — по durationMs возр. (NULLS LAST: попытка без
 * зафиксированного времени ранжируется ниже такой же по очкам попытки с
 * реальным временем).
 *
 * ORDER BY здесь дословно совпадает с порядком колонок индекса
 * `scores_leaderboard_idx` (level_id, score DESC, duration_ms ASC NULLS
 * LAST) — это намеренно, так планировщик может использовать индекс и для
 * фильтра по level_id, и для сортировки, не делая отдельный Sort, и
 * останавливается на LIMIT (top-N через index scan).
 *
 * rank считается как row_number() по тому же порядку и приводится к int:
 * row_number() в Postgres возвращает bigint, а node-postgres по умолчанию
 * парсит bigint в JS-строку (не number) во избежание потери точности для
 * значений вне безопасного диапазона JS Number — здесь это не нужно,
 * поэтому приводим прямо в SQL через ::int и получаем обычный JS number.
 */
export async function getLeaderboard(
  input: LeaderboardQueryInput,
  executor: Pool | PoolClient = pool,
): Promise<LeaderboardEntry[]> {
  const limit = clampLimit(input.limit);

  const result = await executor.query<LeaderboardRow>(
    `SELECT
       (row_number() OVER (ORDER BY score DESC, duration_ms ASC NULLS LAST))::int AS rank,
       player_name,
       score,
       duration_ms,
       stage_reached,
       created_at
     FROM scores
     WHERE level_id = $1
     ORDER BY score DESC, duration_ms ASC NULLS LAST
     LIMIT $2`,
    [input.levelId, limit],
  );

  return result.rows.map(toLeaderboardEntry);
}
