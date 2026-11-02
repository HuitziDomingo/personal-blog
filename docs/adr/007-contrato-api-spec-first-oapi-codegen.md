# ADR-007: Contrato de API spec-first con OpenAPI y oapi-codegen
* Estado: Aprobado
* Fecha: 2026-11-02
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-005 (resuelve el contrato de API que dejó fuera de su alcance)

## Contexto
La API en Go (`services/api`) la consumen dos frontends en TypeScript: `apps/admin` (Angular) y `apps/web` (Next.js). Hace falta una fuente de verdad única para el contrato que mantenga sincronizados los tipos de las tres apps, que se revise en los PRs antes de implementar y que permita a los frontends avanzar con mocks en paralelo al backend. ADR-001 ubica los contratos de API en `docs/`.

## Alternativas Consideradas
* **Opción A: swag estable + swagger2openapi (code-first).** Descartada. swag v1 solo genera Swagger 2.0, así que obliga a un conversor que no publica versiones desde 2021.
* **Opción B: swag v2 (code-first).** Descartada. Genera OpenAPI 3.1, pero sigue en release candidate.
* **Opción C: Huma sobre Gin (code-first).** Descartada. Es una opción sólida, con validación y errores RFC 9457 integrados. Pero el contrato pasa a ser un efecto secundario del código Go: con dos frontends consumidores conviene que sea un archivo revisable antes de implementar. Además esconde Gin detrás de su propia API de handlers.
* **Opción D: OpenAPI escrito a mano + oapi-codegen (spec-first).** Seleccionada.

## Decisión
1. **Fuente de verdad**: `docs/api/openapi.yaml`, en OpenAPI 3.0.x. Todo cambio de la API empieza modificando este archivo en el PR.
2. **Generación en Go**: `oapi-codegen` v2 genera los modelos, la interfaz strict-server y el registro de rutas para Gin en `services/api/internal/handler/gen/`. El código generado pertenece a la capa `handler` (sus tipos son DTOs HTTP, según ADR-006). `domain` nunca importa `gen`.
3. **Validación de peticiones**: middleware de validación contra el spec (`oapi-codegen/gin-middleware`, basado en kin-openapi) antes de llegar a los handlers.
4. **Generación en TypeScript**: `openapi-typescript` genera los tipos en un paquete del workspace (`packages/api-types`) que consumen admin y web. El cliente HTTP de cada frontend se decide en sus propios ADRs.
5. **Código generado versionado**: el código generado de Go y TS se commitea. El CI regenera y falla si hay diferencias (`git diff --exit-code`), para que el código nunca quede desfasado del spec.
6. **Herramientas fijadas**: oapi-codegen se fija con la directiva `tool` de `go.mod`, y openapi-typescript con versión exacta en `package.json`.
7. **Convenciones del contrato**:
   * Prefijo `/api/v1`. Un cambio incompatible crea `/api/v2`.
   * Errores con `application/problem+json` (RFC 9457).
   * Autenticación por cookie, declarada como `securityScheme` de tipo `apiKey` con `in: cookie` (ADR-005).
   * `/health` y `/ready` quedan fuera del contrato público.

## Consecuencias
* **Positivas**:
  * Un único contrato revisable en PR para las tres apps.
  * Los tipos de Go y TS no pueden divergir.
  * Los frontends pueden trabajar con mocks antes de que exista el endpoint.
  * El compilador obliga a implementar cada operación del spec.
* **Negativas**:
  * El YAML se escribe y mantiene a mano.
  * Hay que regenerar código en cada cambio del contrato.
  * oapi-codegen soporta 3.0 y 3.1, pero no todo 3.1 tiene equivalente en el sistema de tipos de Go.
  * Los handlers se adaptan a la interfaz generada en lugar de a Gin directo.
  * El CI de la API necesita también Node para regenerar los tipos TS.