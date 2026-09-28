/**
 * Схемы, переиспользуемые несколькими роутами: формат ошибки и ответ
 * health-чека. Зеркалят packages/types/src/errors.ts и
 * packages/types/src/health.ts.
 *
 * Про импорт `Type` из '@fastify/type-provider-typebox' вместо 'typebox' —
 * см. комментарий в scores.schema.ts.
 */
import { Type } from '@fastify/type-provider-typebox';

import type { ApiErrorCode } from '@agentic-game/types';

const API_ERROR_CODES: readonly ApiErrorCode[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
];

/**
 * Единый формат ошибки. Зеркалит ApiErrorResponse. Не используется как
 * `response`-схема Fastify-роутов (см. src/plugins/error-handler.ts —
 * почему), но фиксирует форму объекта, который error-handler обязан
 * отдавать, и годится для документации/будущего OpenAPI.
 */
export const ApiErrorResponseSchema = Type.Object({
  error: Type.Object({
    code: Type.Union(API_ERROR_CODES.map((code) => Type.Literal(code))),
    message: Type.String(),
    details: Type.Optional(Type.Unknown()),
  }),
});

/** Ответ 200/503 на GET /health. Зеркалит HealthResponse. */
export const HealthResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('degraded')]),
  uptimeSeconds: Type.Number(),
  database: Type.Union([Type.Literal('up'), Type.Literal('down')]),
});
