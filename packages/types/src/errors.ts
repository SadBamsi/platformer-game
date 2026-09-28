/**
 * Единый формат ошибок API. Любой не-2xx ответ имеет ровно эту форму.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Детали валидации: список проблемных полей, если код VALIDATION_ERROR. */
    details?: unknown;
  };
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = (value as { error?: unknown }).error;
  if (typeof candidate !== 'object' || candidate === null) return false;
  return typeof (candidate as { code?: unknown }).code === 'string';
}
