import { isApiErrorResponse, type ApiErrorResponse } from '@agentic-game/types';
import { env } from '@/lib/env';

/**
 * Исключение, которое бросает apiRequest на любой не-2xx ответ или сетевую ошибку.
 * code === 'UNKNOWN' — когда сервер не вернул тело в формате ApiErrorResponse
 * (например, отвечает не API, а прокси/девсервер, или API вообще не поднят).
 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ApiErrorResponse['error']['code'] | 'UNKNOWN',
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Тонкая обёртка над fetch: собирает полный URL из NEXT_PUBLIC_API_BASE_URL,
 * разбирает единый формат ошибок API (ApiErrorResponse из @agentic-game/types)
 * и бросает типизированное исключение вместо «сырого» Response.
 * cache: 'no-store' — данные игры (счёт, таблица рекордов) не должны кэшироваться
 * между запросами Next.js.
 */
export async function apiRequest<TResponse>(path: string, options: RequestOptions = {}): Promise<TResponse> {
  const url = new URL(path, env.NEXT_PUBLIC_API_BASE_URL).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      cache: 'no-store',
    });
  } catch {
    throw new ApiRequestError('Не удалось связаться с API — сервер недоступен или сеть отсутствует.', 0, 'UNKNOWN');
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new ApiRequestError(payload.error.message, response.status, payload.error.code);
    }
    throw new ApiRequestError(`Запрос завершился с кодом ${response.status}.`, response.status, 'UNKNOWN');
  }

  return payload as TResponse;
}
