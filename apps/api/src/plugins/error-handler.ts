import type { FastifyInstance } from 'fastify';

import type { ApiErrorResponse } from '@agentic-game/types';

import { ApiError } from '../errors/api-error.js';

interface ValidationFieldError {
  field: string;
  message: string;
}

/**
 * Fastify типизирует параметр setErrorHandler как `TError = unknown`
 * (проверено по факту в установленных тайпах:
 * node_modules/fastify/types/instance.d.ts, сигнатура `setErrorHandler`) —
 * а не `FastifyError`, как можно было бы ожидать по JS-примерам в доках.
 * Через request-lifecycle сюда долетает буквально всё, что было брошено
 * где угодно в цепочке обработки запроса — включая ошибки слоя данных
 * (db/queries), которые никакого отношения к FastifyError не имеют.
 * Поэтому вместо приведения `as FastifyError` (что было бы враньём
 * компилятору без реальной проверки) ниже — набор узких type guard'ов,
 * читающих отдельные поля из `unknown` только после проверки, что они
 * там вообще есть и нужного типа.
 */
function readField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function readStringField(value: unknown, key: string): string | undefined {
  const field = readField(value, key);
  return typeof field === 'string' ? field : undefined;
}

function readNumberField(value: unknown, key: string): number | undefined {
  const field = readField(value, key);
  return typeof field === 'number' ? field : undefined;
}

/**
 * error.validation — массив FastifySchemaValidationError (см. Context7,
 * /fastify/fastify, Reference/TypeScript.md: расширяет Ajv-подобный
 * ErrorObject с instancePath/keyword/message/params). TypeBoxValidatorCompiler
 * (регистрируется в app.ts) возвращает ошибки той же формы — подтверждено
 * через Context7, /fastify/fastify-type-provider-typebox,
 * TypeBoxValidatorCompiler.md. Поле `validation` есть только у ошибок
 * валидации схемы, поэтому его наличие и служит здесь признаком.
 */
function formatValidationDetails(error: unknown): ValidationFieldError[] | undefined {
  const validation = readField(error, 'validation');
  if (!Array.isArray(validation) || validation.length === 0) {
    return undefined;
  }
  return validation.map((issue: unknown) => {
    const instancePath = readStringField(issue, 'instancePath');
    const schemaPath = readStringField(issue, 'schemaPath');
    const keyword = readStringField(issue, 'keyword');
    const message = readStringField(issue, 'message');
    return {
      field: instancePath || schemaPath || keyword || 'unknown',
      message: message ?? 'ошибка валидации',
    };
  });
}

/**
 * Сопоставление HTTP-статуса 4xx с кодом из контракта (ApiErrorCode,
 * packages/types/src/errors.ts). Контракт узкий, поэтому всё, для чего в нём
 * нет отдельного кода, остаётся VALIDATION_ERROR — но 404 и 429 свои коды
 * имеют, и подменять их было бы враньём клиенту.
 */
function clientErrorCode(statusCode: number): ApiErrorResponse['error']['code'] {
  if (statusCode === 404) {
    return 'NOT_FOUND';
  }
  if (statusCode === 429) {
    return 'RATE_LIMITED';
  }
  return 'VALIDATION_ERROR';
}

/**
 * Безопасные сообщения для клиента. Исходный текст ошибки Fastify наружу не
 * отдаётся — он может содержать внутренние детали; полная ошибка идёт в лог.
 */
const CLIENT_ERROR_MESSAGES: Readonly<Record<number, string>> = {
  400: 'Некорректный запрос',
  404: 'Ресурс не найден',
  405: 'Метод не поддерживается',
  406: 'Неподдерживаемый формат ответа',
  413: 'Тело запроса слишком велико',
  415: 'Неподдерживаемый тип содержимого',
  429: 'Слишком много запросов',
};

/**
 * Единый обработчик ошибок процесса: любой не-2xx ответ приводится к
 * ApiErrorResponse (packages/types/src/errors.ts). Ничего похожего на
 * стектрейс, SQL-запрос или сырую ошибку pg-драйвера клиенту не
 * отдаётся — только код, человекочитаемое сообщение и (для
 * VALIDATION_ERROR) список проблемных полей. Полная ошибка всегда идёт в
 * лог через request.log — там она нужна для отладки и алертинга, наружу —
 * не должна.
 *
 * Намеренно НЕ используется как Fastify `response`-схема на самих роутах:
 * response-схема Fastify сериализует (и фильтрует лишние поля) через
 * fast-json-stringify в привязке к конкретному коду статуса конкретного
 * роута, а этот обработчик — общий для всех роутов и для случая, когда
 * роут вообще не был найден (404, ниже). Полагаться на то, что схема
 * ответа, объявленная в routes/*.route.ts под кодом 4xx/5xx, всегда будет
 * применена к тому, что отправляет именно этот централизованный
 * обработчик — лишняя связанность без проверки тестами; проще и надёжнее
 * отдавать здесь обычный JSON.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    // 1. Намеренная доменная ошибка — контроллер уже решил код/статус/сообщение.
    if (error instanceof ApiError) {
      request.log.warn({ err: error, code: error.code }, 'обработанная ошибка API');
      const body: ApiErrorResponse = {
        error: { code: error.code, message: error.message, details: error.details },
      };
      reply.code(error.statusCode).send(body);
      return;
    }

    // 2. Ошибка валидации схемы Fastify (body/querystring/params).
    const validationDetails = formatValidationDetails(error);
    if (validationDetails) {
      request.log.info({ err: error }, 'ошибка валидации запроса');
      const body: ApiErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Запрос не прошёл валидацию',
          details: validationDetails,
        },
      };
      reply.code(400).send(body);
      return;
    }

    // 3. Прочие клиентские ошибки, которые Fastify генерирует ещё до наших
    // схем (битый JSON, неподдерживаемый Content-Type, слишком большой
    // body и т.п.) — все они несут statusCode в диапазоне 4xx.
    //
    // Код ошибки выбирается по статусу, а не сваливается в VALIDATION_ERROR:
    // 415 или 413 семантически не ошибка валидации, а 404/429 имеют в
    // контракте собственные коды. Иначе клиент, ветвящийся по полю code
    // (apps/game/src/api-client/client.ts), получал бы неверную классификацию
    // при верном HTTP-статусе.
    //
    // Сообщение берётся из нашей таблицы, а не из исходной ошибки: остальной
    // обработчик намеренно не выпускает наружу внутренние детали, и у этой
    // ветки нет причин быть исключением. Полный текст уходит в лог.
    const statusCode = readNumberField(error, 'statusCode') ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      request.log.info({ err: error, statusCode }, 'клиентская ошибка запроса');
      const body: ApiErrorResponse = {
        error: {
          code: clientErrorCode(statusCode),
          message: CLIENT_ERROR_MESSAGES[statusCode] ?? 'Некорректный запрос',
        },
      };
      reply.code(statusCode).send(body);
      return;
    }

    // 4. Всё остальное — неожиданная ошибка сервера. Сюда попадает в том
    // числе любая ошибка слоя данных (обрыв соединения с БД, нарушение
    // CHECK-констрейнта, statement_timeout и т.д.) — контроллеры не ловят
    // такие ошибки сами, они долетают сюда. Логируем целиком с полным
    // стеком, клиенту — только общий код без деталей.
    request.log.error({ err: error }, 'необработанная ошибка сервера');
    const body: ApiErrorResponse = {
      error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' },
    };
    reply.code(500).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    request.log.info({ method: request.method, url: request.url }, 'маршрут не найден');
    const body: ApiErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: `Маршрут ${request.method} ${request.url} не найден`,
      },
    };
    reply.code(404).send(body);
  });
}
