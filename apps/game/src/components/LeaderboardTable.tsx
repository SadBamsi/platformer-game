import type { ReactElement } from 'react';
import type { LeaderboardResponse } from '@agentic-game/types';

interface LeaderboardTableProps {
  data: LeaderboardResponse | null;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Чистая презентационная таблица — данные приходят готовыми сверху (server component). */
export function LeaderboardTable({ data }: LeaderboardTableProps): ReactElement {
  if (!data || data.entries.length === 0) {
    return <p className="leaderboard-table__empty">Пока нет ни одного результата.</p>;
  }

  return (
    <table className="leaderboard-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Игрок</th>
          <th>Счёт</th>
          <th>Этап</th>
          <th>Время</th>
        </tr>
      </thead>
      <tbody>
        {data.entries.map((entry) => (
          <tr key={`${entry.rank}-${entry.playerName}-${entry.createdAt}`}>
            <td>{entry.rank}</td>
            <td>{entry.playerName}</td>
            <td>{entry.score}</td>
            <td>{entry.stageReached ?? '—'}</td>
            <td>{entry.durationMs !== null ? formatDuration(entry.durationMs) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
