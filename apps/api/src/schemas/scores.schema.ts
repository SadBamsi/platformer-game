/**
 * TypeBox-схемы, зеркалящие контракт "@agentic-game/types"
 * (packages/types/src/scores.ts). Используются Fastify для runtime-
 * валидации body/querystring и для сериализации успешного ответа; через
 * `Type.Static<>` они же дают compile-time типы, так что валидатор и типы
 * контроллеров не могут разойтись.
 *
 * ВАЖНО про импорт (см. итоговый отчёт задачи за подробностями):
 * typebox в версии 1.x экспортирует `Type` как DEFAULT export
 * (`import Type from 'typebox'`), а не именованный — это подтверждено
 * через Context7 (/sinclairzx81/typebox, changelog/1.0.0-migration.md и
 * design/website/docs/type/overview.md), и отличается от инструкции
 * задачи, где ожидался `import { Type } from 'typebox'` по аналогии с
 * 0.34.x. Вместо прямого импорта из 'typebox' здесь используется реэкспорт
 * из '@fastify/type-provider-typebox' (тот же builder, но с именованными
 * `Type`/`Static`/`TSchema`, официально документированными для этой версии
 * пакета — Context7, /fastify/fastify-type-provider-typebox,
 * TypeboxReexports.md) — это устраняет риск ошибки импорта без возможности
 * прогнать tsc в этой задаче.
 */
import { Type, type Static } from '@fastify/type-provider-typebox';

import {
  LEADERBOARD_MAX_LIMIT,
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_NAME_MIN_LENGTH,
  STAGE_REACHED_MIN,
} from '@agentic-game/types';

/**
 * Непустая (после обрезки пробелов) строка. `pattern: '\\S'` требует хотя
 * бы один непробельный символ где-то в строке — JSON Schema трактует
 * `pattern` как "regex находит совпадение", а не "regex совпадает со всей
 * строкой", так что этого достаточно, чтобы отсечь "  " и т.п. ещё на
 * границе HTTP-валидации, до того как строка дойдёт до
 * CHECK (btrim(...) <> '') в БД (apps/api/src/db/migrations/0001_init.sql)
 * и превратится там в неожиданную 500-ошибку.
 */
const NON_BLANK_PATTERN = '\\S';

/** Тело запроса POST /api/scores. Зеркалит CreateScoreRequest. */
export const CreateScoreRequestSchema = Type.Object(
  {
    playerName: Type.String({
      minLength: PLAYER_NAME_MIN_LENGTH,
      maxLength: PLAYER_NAME_MAX_LENGTH,
      pattern: NON_BLANK_PATTERN,
    }),
    score: Type.Integer({ minimum: 0 }),
    levelId: Type.String({ minLength: 1, pattern: NON_BLANK_PATTERN }),
    durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
    stageReached: Type.Optional(Type.Integer({ minimum: STAGE_REACHED_MIN })),
  },
  { additionalProperties: false },
);
export type CreateScoreRequestBody = Static<typeof CreateScoreRequestSchema>;

/** Ответ 201 на POST /api/scores. Зеркалит ScoreRecord. */
export const ScoreRecordSchema = Type.Object({
  id: Type.String(),
  playerName: Type.String(),
  score: Type.Integer(),
  levelId: Type.String(),
  durationMs: Type.Union([Type.Integer(), Type.Null()]),
  stageReached: Type.Union([Type.Integer(), Type.Null()]),
  createdAt: Type.String(),
});

/** Query-параметры GET /api/leaderboard. Зеркалит LeaderboardQuery. */
export const LeaderboardQuerySchema = Type.Object(
  {
    levelId: Type.String({ minLength: 1, pattern: NON_BLANK_PATTERN }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: LEADERBOARD_MAX_LIMIT })),
  },
  { additionalProperties: false },
);
export type LeaderboardQueryParams = Static<typeof LeaderboardQuerySchema>;

/** Один элемент лидерборда. Зеркалит LeaderboardEntry. */
const LeaderboardEntrySchema = Type.Object({
  rank: Type.Integer(),
  playerName: Type.String(),
  score: Type.Integer(),
  durationMs: Type.Union([Type.Integer(), Type.Null()]),
  stageReached: Type.Union([Type.Integer(), Type.Null()]),
  createdAt: Type.String(),
});

/** Ответ 200 на GET /api/leaderboard. Зеркалит LeaderboardResponse. */
export const LeaderboardResponseSchema = Type.Object({
  levelId: Type.String(),
  limit: Type.Integer(),
  entries: Type.Array(LeaderboardEntrySchema),
});
