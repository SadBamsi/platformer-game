import type {
  CreateScoreRequest,
  LeaderboardQuery,
  LeaderboardResponse,
  ScoreRecord,
} from '@agentic-game/types';
import { apiRequest } from './client';

/** POST /api/scores — сохранить результат прохождения уровня. */
export function postScore(request: CreateScoreRequest): Promise<ScoreRecord> {
  return apiRequest<ScoreRecord>('/api/scores', { method: 'POST', body: request });
}

/** GET /api/leaderboard — таблица рекордов по уровню. */
export function getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({ levelId: query.levelId });
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  return apiRequest<LeaderboardResponse>(`/api/leaderboard?${params.toString()}`);
}
