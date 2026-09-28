/**
 * vitest setupFile — выполняется ДО импорта модулей самого тестового файла.
 *
 * НАХОДКА (см. отчёт qa-test-expert): db/pool.ts читает `process.env
 * ['DATABASE_URL']` напрямую на этапе импорта модуля (`export const pool =
 * new Pool(getPoolConfig())`), а НЕ через `AppEnv`, который buildApp(env)
 * принимает параметром. Комментарий в app.ts обещает, что кастомный `env`
 * позволяет тестам "не трогать process.env глобально между тестами" — но
 * это верно только для CORS/логгера, не для БД: buildApp({ databaseUrl:
 * 'что угодно' }) всё равно упадёт при импорте, если process.env.DATABASE_URL
 * не задана, и наоборот — реально используется значение из process.env,
 * даже если в AppEnv передано другое.
 *
 * Для юнит-тестов (validation.test.ts, controllers.test.ts), которым
 * реальная БД не нужна вообще (они либо мокают db/queries целиком, либо
 * никогда не доходят до контроллера), достаточно ЛЮБОГО непустого значения
 * здесь — pg.Pool не подключается eagerly в конструкторе.
 *
 * `??=` — если DATABASE_URL уже задана в окружении (так и есть для
 * интеграционных тестов, которые запускаются с реальной строкой подключения,
 * см. tests/integration/README.md), эта строка её не трогает.
 */
process.env['DATABASE_URL'] ??= 'postgres://unit-test:unit-test@127.0.0.1:1/unit_test_unreachable';
