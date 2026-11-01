# ADR-005: Contrato de API, Autenticación JWT y Seguridad
* Estado: Aprobado
* Fecha: 2026-10-31
* Autor: León Nieves Huitzitzili Domingo

## Contexto y Problema
Es necesario establecer la fuente de verdad para el contrato de API entre el backend en Go y los frontends en TypeScript, así como definir el mecanismo seguro de autenticación por JWT, gestión de sesiones de administrador y políticas de seguridad (CORS y Rate Limiting).

## Alternativas Consideradas
### Contrato de API
Verificado el 2026-11-01: `swaggo/swag` estable (v1.16.6) solo genera Swagger 2.0, y `openapi-typescript` 7 solo acepta OpenAPI 3.0 y 3.1. Por eso swag estable no basta para generar las interfaces TypeScript sin un paso de conversión.

* Opción A: Code-First con anotaciones de `swaggo/swag` estable en Handlers de Go y conversión a OpenAPI 3 con `swagger2openapi`, antes de generar las interfaces TypeScript con `openapi-typescript`. Usa una versión estable de swag, pero agrega un paso al build y depende de un conversor sin publicaciones desde 2021.
* Opción B: Code-First con anotaciones de swag v2, que genera OpenAPI 3.1 con el flag `--v3.1`. No requiere conversión, pero sigue en release candidate (v2.0.0-rc6).
* Opción C: Huma (v2.40.0) sobre Gin con el adaptador `humagin`, que genera OpenAPI 3.1 desde tipos de Go en lugar de anotaciones. No requiere conversión, pero cambia la forma de declarar los handlers.

### Almacenamiento de Token JWT
* Opción A (Seleccionada): Cookies con atributos `HttpOnly; Secure; SameSite=Strict`.
* Opción B: Access token en memoria y refresh token en cookie. Descartada: más compleja y sin ganancia con `SameSite=Strict`.
* Opción C: `localStorage`. Descartada por XSS.

### Bootstrap de Administrador
* Opción A (Seleccionada): Creación automática de usuario admin al iniciar la API si la colección `users` está vacía, usando `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`.
* Opción B: Comando aparte `cmd/seed`. Descartado: requiere acceso manual a la base de producción o un Cloud Run Job.

### Seguridad
* Middleware CORS restringido a orígenes permitidos con `AllowCredentials: true`.

### Rate Limiting
* Opción A (Seleccionada): Rate limiting en memoria por instancia en `/api/v1/auth/login`, con max-instances bajo en Cloud Run.
* Opción B: Cloud Armor. Descartado: requiere Load Balancer de pago.
* Opción C: Contador en MongoDB con TTL. Descartado para el MVP por complejidad.

## Decisión
1. **Contrato de API**: Fuera del alcance de este ADR; se decide en ADR-007.
2. **Mecanismo de Autenticación**:
   - Token de acceso (`access_token`, 15 min) en Cookie `HttpOnly`.
   - Token de refresco (`refresh_token`, 7 días) guardado en MongoDB con rotación (Refresh Token Rotation) y enviado en su propia Cookie `HttpOnly` con `Path=/api/v1/auth`.
3. **Bootstrap de Administrador**:
   - Creación automática de usuario admin al iniciar la API si la colección `users` está vacía, usando `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`.
4. **Seguridad**:
   - Middleware CORS restringido a orígenes permitidos con `AllowCredentials: true`.
   - Rate limiting en memoria por instancia en `/api/v1/auth/login`, con max-instances bajo en Cloud Run.

## Consecuencias
* **Positivas**: Aislamiento total de tokens contra vulnerabilidades XSS y bootstrapping desatendido.
* **Negativas**: Configuración rigurosa de políticas de cookies entre subdominios en desarrollo y producción. El límite de rate limiting es por instancia, no global.
