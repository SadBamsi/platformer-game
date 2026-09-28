import type { ApiErrorCode } from '@agentic-game/types';

/**
 * Единственный тип "ожидаемой" ошибки, которую контроллеры бросают
 * намеренно, чтобы отдать конкретный код/статус из контракта ApiErrorCode
 * (например, будущий 404 для несуществующего ресурса). Любая другая
 * ошибка — включая всё, что бросает слой данных (db/queries) — считается
 * неожиданной и превращается в 500 INTERNAL_ERROR общим обработчиком
 * (src/plugins/error-handler.ts) без утечки деталей наружу.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
