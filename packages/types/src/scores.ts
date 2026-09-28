/** Ограничения контракта — переиспользуются и валидатором на API, и формой на клиенте. */
export const PLAYER_NAME_MIN_LENGTH = 1;
export const PLAYER_NAME_MAX_LENGTH = 20;
export const LEADERBOARD_DEFAULT_LIMIT = 10;
export const LEADERBOARD_MAX_LIMIT = 100;
/** Минимально допустимый номер достигнутого этапа (этапы нумеруются с 1). */
export const STAGE_REACHED_MIN = 1;

/** Тело запроса POST /api/scores. */
export interface CreateScoreRequest {
  /** 1–20 символов, обрезается по краям на стороне API. */
  playerName: string;
  /** Целое число >= 0. */
  score: number;
  /** Идентификатор уровня, например "level-1". */
  levelId: string;
  /** Время прохождения в миллисекундах, целое >= 0. */
  durationMs?: number;
  /** Номер достигнутого этапа, целое >= STAGE_REACHED_MIN. */
  stageReached?: number;
}

/** Ответ 201 на POST /api/scores. */
export interface ScoreRecord {
  id: string;
  playerName: string;
  score: number;
  levelId: string;
  durationMs: number | null;
  /** Номер достигнутого этапа; null, если не передан клиентом. */
  stageReached: number | null;
  /** ISO-8601, UTC. */
  createdAt: string;
}

/** Query-параметры GET /api/leaderboard. */
export interface LeaderboardQuery {
  levelId: string;
  /** По умолчанию 10, максимум 100. */
  limit?: number;
}

export interface LeaderboardEntry {
  /** 1-based позиция в таблице. */
  rank: number;
  playerName: string;
  score: number;
  durationMs: number | null;
  /** Номер достигнутого этапа; null, если не передан клиентом. */
  stageReached: number | null;
  createdAt: string;
}

/** Ответ 200 на GET /api/leaderboard. */
export interface LeaderboardResponse {
  levelId: string;
  limit: number;
  entries: LeaderboardEntry[];
}
