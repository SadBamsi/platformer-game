/**
 * Типизированный доступ к публичным env-переменным клиента.
 * NEXT_PUBLIC_* встраиваются в бандл на этапе сборки Next.js. Если переменная
 * не задана (например, локально ещё не скопировали .env.local.example),
 * подставляем безопасный dev-дефолт — страницы не должны падать из-за этого.
 */
const DEFAULT_API_BASE_URL = 'http://localhost:4000';

/**
 * ВАЖНО: обращение обязано быть СТАТИЧЕСКИМ — `process.env.NEXT_PUBLIC_FOO`.
 * Next.js подставляет публичные переменные в клиентский бандл через
 * DefinePlugin, отображая буквально ключ `process.env.<KEY>`. Запись с
 * вычисляемым ключом (`process.env[name]`) статически не резолвится и в
 * бандл не подставляется: на сервере она сработает, а в браузере всегда
 * вернёт undefined и молча свалится на дефолт — собранный образ начнёт
 * стучаться на localhost вместо адреса, переданного через build ARG
 * NEXT_PUBLIC_API_BASE_URL (infra/Dockerfile.game). Не заменяйте это на
 * хелпер, принимающий имя переменной строкой.
 */
const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export const env = {
  NEXT_PUBLIC_API_BASE_URL:
    rawApiBaseUrl !== undefined && rawApiBaseUrl.length > 0
      ? rawApiBaseUrl
      : DEFAULT_API_BASE_URL,
} as const;
