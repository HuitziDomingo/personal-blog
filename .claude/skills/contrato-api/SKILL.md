---
name: contrato-api
description: Procedimiento para cualquier cambio en la API de personal-blog (services/api): endpoint nuevo, parámetro, esquema, código de respuesta, seguridad o cookies. Empieza siempre por docs/api/openapi.yaml, regenera con make generate, implementa con tests, actualiza el flujo de Bruno y la guía de desarrollo. Úsala aunque el pedido no mencione el contrato, por ejemplo "agrega un endpoint para publicar posts", "cambia la respuesta de login", "el handler debe devolver 409" o "agrega un filtro por tag", y también al revisar un PR que toca handlers o el contrato.
---

# Cambios en la API: contrato primero

La API es spec-first (ADR-007). `docs/api/openapi.yaml` es la única fuente: de ahí salen el código Go del servidor, los tipos de TypeScript de los frontends y la colección de Bruno. Si cambias el código antes que el contrato, el CI falla por drift o, peor, el contrato miente a los frontends. Sigue los pasos en orden.

## 1. Cambia el contrato

Edita `docs/api/openapi.yaml`:

- Declara todas las respuestas que el endpoint puede dar, incluidas las que agregan los middlewares: `400` si hay parámetros o cuerpo, `401` y `403` si tiene seguridad, `413` si recibe cuerpo, `429` siempre y `default`. Copia el patrón de una operación vecina.
- La seguridad usa los esquemas existentes (`accessCookie`, `refreshCookie`). Una operación pública lleva `security: []`.
- Pon límites a todo lo que venga del cliente (`maxLength`, `maximum`, `pattern`): el validador los aplica antes del handler (ADR-010).
- `summary` es el nombre del archivo en Bruno: cambiarlo renombra la petición generada.

## 2. Regenera

```sh
make generate
```

Regenera tres cosas: `services/api/internal/handler/gen/` (oapi-codegen), `packages/api-types/schema.d.ts` y `docs/api/bruno/generated/`. Nada de eso se edita a mano; si algo generado está mal, el arreglo va en el contrato o en la configuración del generador. Corre `git status`: los archivos nuevos o borrados también cuentan, y el CI los compara.

## 3. Implementa

Sigue la arquitectura hexagonal de CLAUDE.md (`handler → service → domain ← repository`):

- El handler implementa el método nuevo de `gen.StrictServerInterface`; si falta, `server` no compila. Si la operación todavía no tiene lógica, el método devuelve `errNotImplemented` (501).
- Traduce los errores de dominio en `handlerError` (`handler/problem.go`), no en cada handler.
- Todo endpoint nuevo lleva test y cumple ADR-010: el PR explica cómo.
- Los mensajes de error van en inglés y nunca registran tokens, cookies, emails ni contraseñas.

Verifica con `make api-test` y `make api-lint`.

## 4. Actualiza Bruno

`docs/api/bruno/generated/` ya quedó al día en el paso 2. Lo que se escribe a mano son los flujos en `docs/api/bruno/flows/`: una secuencia de peticiones con aserciones de status, cuerpo y cookies.

- Si el cambio altera un flujo existente (por ejemplo, la sesión en `flows/sesion/`), actualízalo.
- Si el endpoint forma parte de un caso de uso nuevo, agrega un flujo con su propia carpeta y su `folder.yml`.
- Los secretos (email y contraseña) son variables secretas del environment `local`; nunca escribas valores en los archivos.
- Las peticiones van sin `auth`: la sesión viaja en las cookies, que el cookie jar de Bruno guarda y reenvía.

Pruébalo contra la API local con `make api-run` en una terminal y `make api-flows` en otra.

## 5. Documenta

Si el cambio agrega o cambia un comando, una variable de entorno o un paso del arranque, actualiza `docs/development.md` en el mismo PR (CLAUDE.md lo exige). Para ver el contrato renderizado: `make api-docs`.

## Antes de abrir el PR

- `make generate` no deja cambios pendientes (`git status --porcelain` vacío).
- Tests, lint y flujos de Bruno en verde.
- La descripción del PR referencia la tarea `BLOG-NNN`, explica cómo cumple ADR-010 y, en modo aprendizaje, el porqué de los patrones de Go no obvios.
