'use client';

import { useState, type FormEvent, type ReactElement } from 'react';
import { PLAYER_NAME_MAX_LENGTH, PLAYER_NAME_MIN_LENGTH } from '@agentic-game/types';
import { postScore } from '@/api-client/scores';
import { ApiRequestError } from '@/api-client/client';
import { useGameStore } from '@/store/useGameStore';

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Форма отправки результата на экране game over (`sessionStatus === 'game-over'`).
 * levelId зафиксирован как 'rising-water' — единственный игровой режим на
 * данный момент (rising-water.md, раздел «Итог: что отличается от плана»;
 * план «Волна C»: «Новый components/ScoreSubmitForm.tsx на /play при
 * sessionStatus === 'game-over'»). postScore уже существовал в
 * api-client/scores.ts, но до этой формы нигде не вызывался.
 */
export function ScoreSubmitForm(): ReactElement | null {
  const sessionStatus = useGameStore((state) => state.sessionStatus);
  const lastRun = useGameStore((state) => state.lastRun);
  const [playerName, setPlayerName] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (sessionStatus !== 'game-over' || !lastRun) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = playerName.trim();
    if (trimmed.length < PLAYER_NAME_MIN_LENGTH) {
      setErrorMessage('Введите имя.');
      return;
    }

    setStatus('submitting');
    setErrorMessage(null);

    postScore({
      playerName: trimmed,
      score: lastRun.score,
      levelId: 'rising-water',
      stageReached: lastRun.stageReached,
      durationMs: lastRun.durationMs,
    })
      .then(() => {
        setStatus('success');
      })
      .catch((error: unknown) => {
        setStatus('error');
        setErrorMessage(error instanceof ApiRequestError ? error.message : 'Не удалось отправить результат.');
      });
  };

  if (status === 'success') {
    return <p className="score-submit-form__success">Результат отправлен в таблицу рекордов.</p>;
  }

  return (
    <form className="score-submit-form" onSubmit={handleSubmit}>
      <label className="score-submit-form__label" htmlFor="player-name">
        Имя для таблицы рекордов
      </label>
      <input
        id="player-name"
        className="score-submit-form__input"
        type="text"
        value={playerName}
        onChange={(event) => setPlayerName(event.target.value)}
        maxLength={PLAYER_NAME_MAX_LENGTH}
        disabled={status === 'submitting'}
      />
      <button type="submit" className="score-submit-form__submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Отправка…' : 'Отправить результат'}
      </button>
      {errorMessage ? (
        <p className="score-submit-form__error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
