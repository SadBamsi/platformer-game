import type { ReactElement } from 'react';
import type { LeaderboardResponse } from '@agentic-game/types';
import { getLeaderboard } from '@/api-client/scores';
import { LeaderboardTable } from '@/components/LeaderboardTable';

const DEFAULT_LEVEL_ID = 'rising-water';

/**
 * Серверный компонент с фетчем на сервере. API на этом этапе может быть не
 * поднят — ошибку ловим и показываем сообщение, страница не должна падать.
 */
export default async function LeaderboardPage(): Promise<ReactElement> {
  let data: LeaderboardResponse | null = null;
  let errorMessage: string | null = null;

  try {
    data = await getLeaderboard({ levelId: DEFAULT_LEVEL_ID });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка при загрузке таблицы рекордов.';
  }

  return (
    <main className="leaderboard-page">
      <h1>Таблица рекордов</h1>
      {errorMessage ? (
        <p className="leaderboard-page__error" role="alert">
          Не удалось загрузить таблицу рекордов: {errorMessage}
        </p>
      ) : (
        <LeaderboardTable data={data} />
      )}
    </main>
  );
}
