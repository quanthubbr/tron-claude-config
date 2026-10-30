# NestJS patterns

## Layout

```
src/
  main.ts
  app.module.ts
  common/          # filters, guards, interceptors, pipes
  config/
  modules/<feature>/
    *.module.ts
    *.controller.ts
    *.service.ts
    dto/
    entities/ or repositories/
```

Feature modules own domain code; export only providers other modules need.

## Bootstrap

```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
}));
app.useGlobalFilters(new HttpExceptionFilter());
await app.listen(process.env.PORT ?? 3000);
```

Validate environment at startup via `ConfigModule` + schema (`validate` function).

## Controllers and services

Controllers: parse params/body, delegate, return response DTOs. Services hold rules and coordinate repos. Use `ParseUUIDPipe` and similar built-ins at the edge.

## DTOs

Request DTOs with `class-validator`; separate response DTOs / `@SerializeOptions` — never return entities with password hashes or internal columns.

## Auth

Module-local strategies/guards unless shared. Guards for coarse roles; services for row-level checks (`order.ownerId === user.id`).

## Errors

Global filter maps `HttpException` and unknown errors to one JSON shape; expected client faults use `BadRequestException`, `NotFoundException`, etc.

## Persistence

Repository providers wrap Prisma/TypeORM; multi-step writes live in a service method with explicit transaction API.

## Tests

```ts
const moduleRef = await Test.createTestingModule({ imports: [UsersModule] }).compile();
app = moduleRef.createNestApplication();
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
await app.init();
```

Mirror production pipes/filters in tests. Unit-test services with mocked ports; e2e-test HTTP with supertest or project pattern.

## Production defaults

Structured logging + request id; fail boot on bad config; health checks for DB; rate limit and audit on public routes; background consumers in dedicated modules, not inside controllers.

## Exception filter (consistent envelope)

```ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    if (err instanceof HttpException) {
      const payload = err.getResponse();
      return res.status(err.getStatus()).json({
        error: typeof payload === 'string' ? { code: 'http_error', message: payload } : payload,
      });
    }
    this.logger.error(err);
    return res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
}
```

Align `code` values with `reference/api-contracts.md` so web and mobile clients share one catalog.

## Module boundaries vs hexagonal

Nest modules often mirror features (`UsersModule`). Treat `UsersService` as application layer only if it avoids importing `Request`/`Response`. When logic sprawls, extract plain use-case classes and keep Nest providers as adapters that delegate — see `reference/hexagonal-boundaries.md`.
