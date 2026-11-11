# Guía de desarrollo

Cómo levantar y probar el proyecto en local. Las decisiones están en [docs/adr](adr/) y el backlog en [roadmap.md](roadmap.md).

## Prerrequisitos

| Herramienta | Versión | Dónde está fijada |
| --- | --- | --- |
| Node.js | 24 | `.nvmrc` y `package.json`; con otra versión, `pnpm install` falla (`engine-strict` en `.npmrc`) |
| `@types/node` | 24.x, igual que Node | `package.json` de cada paquete que lo usa; súbelo de major solo junto con `.nvmrc` |
| pnpm | 10.20.0 | `packageManager` en `package.json`; se activa con `corepack enable` |
| Go | 1.27 (toolchain 1.27.3) | `services/api/go.mod` |
| Docker | Con Docker Compose v2 | No está fijada |
| golangci-lint | v2.15 | `ci.yml`; solo para `make api-lint` |

## Estructura

```text
personal-blog/
├── apps/
│   ├── admin/            # Dashboard en Angular
│   └── web/              # Blog público en Next.js (spike en borrador)
├── packages/
│   ├── api-types/        # Tipos TypeScript generados del contrato
│   └── markdown/         # Render y sanitización de Markdown (admin y web)
├── e2e/                  # E2E con Playwright (make e2e)
├── services/
│   └── api/              # API en Go + Gin
│       ├── cmd/api/      # Punto de entrada de la API HTTP
│       ├── cmd/mcp/      # Servidor MCP de solo lectura (stdio)
│       └── internal/
│           ├── config/       # Variables de entorno
│           ├── domain/       # Entidades, puertos y errores
│           ├── handler/      # HTTP; handler/gen es código generado
│           ├── mcp/          # Adaptador MCP (ADR-019)
│           ├── repository/   # Implementación en MongoDB
│           └── service/      # Casos de uso
├── docs/
│   ├── adr/              # Decisiones de arquitectura
│   ├── api/openapi.yaml  # Contrato de API
│   └── roadmap.md        # Backlog
├── docker-compose.yml    # MongoDB local
└── Makefile              # Comandos del proyecto
```

## Primer arranque

1. Instala las dependencias de Node:

   ```sh
   nvm use
   corepack enable
   pnpm install
   ```

2. Crea tu configuración local. `.env` no se sube a git:

   ```sh
   cp .env.example .env
   ```

   Genera el secreto de los JWT y ponlo en `JWT_SECRET`, entre comillas simples. Sin él, la API no arranca:

   ```sh
   openssl rand -base64 32
   ```

3. Levanta MongoDB:

   ```sh
   make db-up
   ```

4. Levanta la API, que escucha en el puerto 8080:

   ```sh
   make api-run
   ```

5. En otra terminal, comprueba que responde:

   ```sh
   curl localhost:8080/ready
   ```

   Debe devolver `{"status":"ready"}`.

Sin `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`, la API registra un warning y funciona sin administrador. Para crearlo, define ambas en `.env` antes de arrancar con la colección `users` vacía. La contraseña va de 12 caracteres a 72 bytes.

## `make api-run` frente a `make api-watch`

Los dos cargan `.env` igual y levantan la misma API en el puerto de `PORT` (8080 por defecto).

| | `make api-run` | `make api-watch` |
| --- | --- | --- |
| Qué ejecuta | `go run ./cmd/api` | `go tool air`, con `services/api/.air.toml` |
| Al cambiar el código | Hay que pararla con Ctrl+C y volver a lanzarla | Recompila y reinicia sola al guardar un `.go`, incluido `handler/gen` tras `make generate` |
| Qué no la reinicia | — | Los `_test.go`, `openapi.yaml` y `.env`; un cambio en `.env` exige parar y relanzar |
| Cuándo usarla | Una corrida puntual, `make api-flows` o `make e2e` | Mientras programas la API |

Al reiniciar, Air manda `SIGINT`, que dispara el graceful shutdown de la API (hasta 8 s), y espera a que salga antes de arrancar el binario nuevo. Esa espera de Air es de 5 s como máximo y no se configura: si la API vieja sigue drenando peticiones, la nueva arranca igual (el puerto ya está libre, porque el shutdown cierra el listener al empezar) y conviven unos segundos. A los 10 s (`kill_delay`), Air mata la vieja con `SIGKILL`. Sin peticiones en vuelo, la API sale al instante. Si el build falla, detiene la API vieja para que no pruebes código desactualizado: arregla el error y guarda otra vez. El binario se compila en `services/api/tmp/`, ignorado por git y borrado al salir.

Air es una herramienta de Go declarada con la directiva `tool` de `services/api/go.mod`, así que no hace falta instalarla: `go tool air` usa la versión fijada.

## Servidor MCP

[ADR-019](adr/019-servidor-mcp-como-adaptador.md): un adaptador de entrada más de la arquitectura hexagonal. `internal/mcp` usa los puertos de `service` (como `handler`), y `cmd/mcp` es un binario aparte que habla **solo por stdio**: no escucha en la red. No está conectado a ningún cliente ni LLM.

- **Solo lectura:**
  - Herramientas: `list_posts` (filtro por tag y paginación), `get_post` (por slug, con el Markdown) y `search_posts` (texto en título, extracto, contenido y etiquetas, sin distinguir mayúsculas).
  - Recursos: `blog://posts` (los 100 más recientes, sin contenido) y `blog://posts/{slug}` (el Markdown).
  - Ninguna operación crea, edita, publica ni archiva.
- **Datos:** devuelve el Markdown y sus metadatos, nunca IDs de autor, datos de usuarios, hashes ni tokens.
- **Prompt injection:** las `instructions` del servidor y las descripciones de las herramientas avisan de que el contenido es dato, nunca instrucción (ADR-019, punto 5).
- **Errores:** «no existe» y entradas inválidas se explican. Cualquier otro error se registra en stderr y el cliente solo ve `internal error`.
- **Búsqueda:** `service.SearchPublished` filtra en memoria sobre los publicados (como mucho 1000), sin construir consultas de MongoDB con texto del usuario.
- **Variables:** solo `MONGO_URI` y `MONGO_DB_NAME`. Los logs van a stderr, porque stdout es el canal del protocolo.
- **Solo lectura, en el código:** en local, `MONGO_URI` es el usuario `root`, así que la credencial sí podría escribir. Fuera de local, el servidor necesita un usuario de MongoDB con permiso solo de lectura.
- **Búsqueda:** no ignora acentos («orquestacion» no encuentra «Orquestación»), recorre los 1000 posts publicados más recientes y devuelve `count`, no un total.

### Probarlo con el MCP Inspector

El [MCP Inspector](https://github.com/modelcontextprotocol/inspector) oficial no es dependencia del repo: se ejecuta con `npx` en una versión exacta. Usa una con más de 7 días (ADR-013; la 2.13.0 es del 2026-10-28).

```sh
make db-up mcp-build
set -a && . ./.env && set +a
npx @modelcontextprotocol/inspector@2.13.0 \
  -e MONGO_URI="$MONGO_URI" -e MONGO_DB_NAME="$MONGO_DB_NAME" \
  -- services/api/bin/mcp
```

- **El `--`:** separa los `-e`, que se pueden repetir, del comando. Sin él, el Inspector puede tomar el comando como otra variable. abre la URL que imprime (`http://localhost:6274`, con un token de sesión). Conecta con el transporte STDIO y prueba las herramientas y los recursos.
- **Variables con `-e`:** quedan visibles en la lista de procesos y en la UI del Inspector, y la v2 puede guardarlas en su almacén de secretos (el keychain o `~/.mcp-inspector/secrets.json`). Úsalo solo con la base local.
- **Sin interfaz:** el modo CLI sirve para un script.

  ```sh
  npx @modelcontextprotocol/inspector@2.13.0 --cli \
    -e MONGO_URI="$MONGO_URI" -e MONGO_DB_NAME="$MONGO_DB_NAME" \
    -- services/api/bin/mcp --method tools/call --tool-name search_posts --tool-arg query=claude
  ```

## Variables de la API

| Variable | Obligatoria | Por defecto | Qué hace |
| --- | --- | --- | --- |
| `MONGO_URI` | Sí | | Conexión a MongoDB |
| `MONGO_DB_NAME` | Sí | | Nombre de la base |
| `JWT_SECRET` | Sí | | Secreto para firmar los JWT, de al menos 32 bytes. Genéralo con `openssl rand -base64 32` |
| `PORT` | No | `8080` | Puerto HTTP |
| `ALLOWED_ORIGINS` | No | Vacía | Orígenes permitidos, separados por comas. Son exactos y sin comodines. Vacía, ningún navegador puede cambiar estado. A estos orígenes la API les expone `Retry-After` |
| `MAX_BODY_BYTES` | No | `1048576` (1 MB) | Tamaño máximo del cuerpo; lo que lo supera responde 413 |
| `TRUSTED_PROXIES` | No | Vacía | IPs o rangos CIDR de confianza para leer `X-Forwarded-For`. Vacía, se usa la IP del socket. No acepta `0.0.0.0/0` ni `::/0` |
| `RATE_LIMIT_GLOBAL_PER_MINUTE` / `_BURST` | No | `60` / `20` | Límite por IP en `/api/v1` para peticiones sin un access token válido |
| `RATE_LIMIT_USER_PER_MINUTE` / `_BURST` | No | `300` / `100` | Límite por usuario en `/api/v1` con un access token válido; sustituye al límite por IP (ADR-016) |
| `RATE_LIMIT_PREFLIGHT_PER_MINUTE` / `_BURST` | No | `120` / `60` | Límite por IP de los preflight CORS (`OPTIONS` con `Origin` y `Access-Control-Request-Method`), que no gastan el global (ADR-016) |
| `RATE_LIMIT_LOGIN_PER_MINUTE` / `_BURST` | No | `5` / `5` | Límite extra en `POST /api/v1/auth/login` |
| `RATE_LIMIT_REFRESH_PER_MINUTE` / `_BURST` | No | `10` / `10` | Límite extra en `POST /api/v1/auth/refresh` |
| `RATE_LIMIT_ASSISTANT_PER_MINUTE` / `_BURST` | No | `5` / `5` | Límite extra por usuario en `/api/v1/admin/assistant/*`, además del de usuario (ADR-021) |
| `ASSISTANT_ENABLED` | No | `false` | `true` enciende el asistente de escritura (ADR-021). Con `false`, sus operaciones responden 503 `writing assistant is disabled` y nada llega a Gemini. Otro valor detiene la API |
| `GEMINI_API_KEY` | Con el asistente encendido | | API key de Gemini, de un proyecto de Google sin facturación. Con `ASSISTANT_ENABLED=true` y sin key, la API no arranca. Nunca aparece en logs ni en errores |
| `GEMINI_MODEL` | Con el asistente encendido | | Modelo de Gemini, uno incluido en el plan gratuito. Con `ASSISTANT_ENABLED=true` y sin modelo, la API no arranca |
| `ASSISTANT_TIMEOUT_SECONDS` | No | `30` | Timeout de una llamada a Gemini. Las rutas del asistente alargan el `WriteTimeout` del servidor (15 s) a este valor más 10 s |
| `INITIAL_ADMIN_EMAIL` | No | | Email del administrador inicial |
| `INITIAL_ADMIN_PASSWORD` | No | | Contraseña del administrador inicial |
| `LOG_FORMAT` | No | `text` | `text` (key=value, para la terminal) o `json` (una línea por evento con `severity`, `message` y `time`, los campos de Cloud Logging). En `json`, el access log también es JSON, con el grupo `httpRequest` que Cloud Logging muestra como petición HTTP: solo la ruta (sin query), y severidad `ERROR` para 5xx, `WARNING` para 4xx salvo 401 y 404, e `INFO` para el resto. Un `LOG_FORMAT` inválido detiene la API con el error ya en JSON |
| `GIN_MODE` | No | `debug` con `LOG_FORMAT=text`, `release` con `json` | Modo de Gin: `debug`, `release` o `test`. En `debug`, Gin lista las rutas al arrancar y avisa que corre en modo debug. Un valor inválido hace que Gin termine con panic al iniciarse, antes de leer la configuración |

### Avisos al arrancar

La API arranca con cualquier configuración válida, pero algunas la dejan inútil para algo. En esos casos registra un `WARN` al arrancar, sin mostrar valores secretos:

| Aviso | Qué pasa |
| --- | --- |
| `ALLOWED_ORIGINS is empty` | Ningún navegador puede iniciar sesión ni cambiar estado: CORS y la verificación de `Origin` rechazan todo. El admin solo dice «no se pudo conectar» |
| `ALLOWED_ORIGINS entry "…" never matches` | Un origen con mayúsculas o con el puerto por defecto (`https://Admin.huitzi.xyz`, `https://admin.huitzi.xyz:443`) nunca coincide con la cabecera `Origin` del navegador, que la API compara de forma exacta. El aviso dice cómo escribirlo |
| `INITIAL_ADMIN_EMAIL is set but INITIAL_ADMIN_PASSWORD is empty` (o al revés) | No se crea el administrador inicial |
| `users already exist: INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are ignored` | Ya hay usuarios: cambiar esas variables no cambia ninguna contraseña |
| `no users and no initial admin` | No hay usuarios ni credenciales iniciales: nadie puede iniciar sesión |
| `MAX_BODY_BYTES is N bytes` | Menos de 64 KiB: un post más grande falla con 413 (el contrato no limita el largo del contenido) |
| `TRUSTED_PROXIES is empty in release mode` | Detrás de Cloud Run todos los clientes comparten la IP del proxy, y con ella el rate limit |
| `GIN_MODE=debug with LOG_FORMAT=json` | Gin mezcla su salida de debug en texto con el JSON |
| `GEMINI_API_KEY is set but ASSISTANT_ENABLED is not true` | El asistente sigue apagado y responde 503: la key no se usa |

### Local frente a producción

| Variable | Local | Producción (Cloud Run) |
| --- | --- | --- |
| `LOG_FORMAT` | `text` (o vacía) | `json` |
| `GIN_MODE` | `debug` (o vacía) | `release` (o vacía con `LOG_FORMAT=json`) |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:4200` | `https://admin.huitzi.xyz` y el origen de la web |
| `TRUSTED_PROXIES` | Vacía | El rango del par directo de Cloud Run (ADR-011) |
| `MONGO_URI` y `MONGO_DB_NAME` | MongoDB de `docker compose` | Atlas, desde Secret Manager |
| `JWT_SECRET` | Generado con `openssl rand -base64 32` | Desde Secret Manager |
| `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` | Solo la primera vez, con `users` vacía | Solo en el primer despliegue; después se quitan |
| `PORT` | `8080` | La que asigna Cloud Run |
| `ASSISTANT_ENABLED`, `GEMINI_API_KEY` y `GEMINI_MODEL` | Apagado; para probarlo, una key propia en `.env` | La key desde Secret Manager, de un proyecto de Google sin facturación y separado del de la API (ADR-021) |

Los valores de producción son los previstos; el despliegue está pendiente (BLOG-054 y BLOG-022).

## Comandos del Makefile

| Comando | Qué hace |
| --- | --- |
| `make api-run` | Carga `.env` y levanta la API |
| `make api-watch` | Como `api-run`, pero recompila y reinicia la API al guardar un `.go` (Air) |
| `make api-test` | Corre los tests de Go con `-race`; los de integración se saltan |
| `make api-test-integration` | Levanta MongoDB y corre los tests de `internal/repository` contra él |
| `make api-lint` | Corre `golangci-lint` |
| `make web-dev` | Levanta `apps/web` con `next dev` en `http://localhost:3000`; con `WEB_API_BASE_URL=<origen>` usa otra API |
| `make web-build` | Build de producción de la web contra la API local (o `WEB_API_BASE_URL`) |
| `make web-start` | Sirve el build de producción de la web en `http://localhost:3000`, con ISR y cabeceras |
| `make web-lint` | ESLint de la web |
| `make web-typecheck` | `tsc --noEmit` de la web |
| `make web-test` | Tests de la web con Vitest |
| `make admin-dev` | Levanta el admin en `http://localhost:4200`; con `ADMIN_API_BASE_URL=<origen>` usa otra API |
| `make admin-lint` | Corre ESLint con angular-eslint en el admin |
| `make admin-test` | Corre los tests del admin y los de los scripts de `apps/admin/scripts/`, incluido el contraste WCAG AA de las paletas de acento |
| `make admin-build` | Build de producción del admin; antes verifica que la URL de la API de producción sea https y que coincida con el `connect-src` de `vercel.json`, y después que `index.html` traiga el `<meta>` de CSP de `autoCsp` |
| `make admin-preview` | Hace el build de producción y lo sirve en `http://127.0.0.1:4300` con las cabeceras de `apps/admin/vercel.json` |
| `make admin-csp-test` | Hace el build de producción y prueba su CSP en Chrome o Chromium headless, incluido el editor de posts |
| `make e2e` | Corre los E2E con Playwright contra el stack local, en una base temporal que borra al terminar (ver «E2E») |
| `make e2e-clean` | Borra las bases `e2e_*` que haya dejado una corrida terminada a la fuerza |
| `make api-docs` | Muestra el contrato con Swagger UI en `http://localhost:8081` |
| `make api-flows` | Corre los flujos de Bruno contra la API local |
| `make api-build` | Compila el binario en `services/api/bin/api` |
| `make mcp-build` | Compila el servidor MCP de solo lectura en `services/api/bin/mcp` (ver «Servidor MCP») |
| `make api-docker-build` | Construye la imagen `personal-blog-api` |
| `make generate` | Regenera el código, los tipos y la colección de Bruno del contrato |
| `make db-up` | Levanta MongoDB y espera a que esté sano |
| `make db-down` | Para MongoDB y conserva los datos |
| `make db-logs` | Sigue los logs de MongoDB |
| `make db-reset` | **Borra los datos de MongoDB**; pide escribir `borrar` |

## Tests y lint

Tests unitarios, sin dependencias externas:

```sh
make api-test
```

Tests de integración. Usan el `MONGO_URI` de `.env`, crean una base `test_<id>` por test y la borran al terminar, así que no tocan `personal_blog`:

```sh
make api-test-integration
```

Lint. Requiere `golangci-lint` instalado:

```sh
make api-lint
```

Sin instalarlo, y también para `govulncheck`, desde `services/api`:

```sh
go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 run ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...
```

## E2E

Playwright (ADR-003), solo Chromium, en el paquete `e2e/` del workspace. Cubre el flujo crítico de ADR-006 (login, crear un borrador, editarlo, publicarlo, verlo en la API pública y archivarlo), más la contraseña incorrecta y el logout.

```sh
make e2e                      # todo, headless
make e2e E2E_ARGS="--headed"  # cualquier opción de playwright test
```

`make e2e` levanta MongoDB (`make db-up`), descarga los navegadores de Playwright la primera vez (`playwright install chromium`: Chromium, Chrome Headless Shell y ffmpeg, unos 570 MB en `~/Library/Caches/ms-playwright`) y corre `e2e/scripts/run.mjs`, que:

1. Comprueba que `MONGO_URI` apunta al MongoDB local de docker compose (`127.0.0.1:27017` o `localhost:27017`); si no, no corre, porque el borrado de la base se hace dentro de ese contenedor.
2. Genera una base temporal `e2e_<id>`, un admin de prueba con email `e2e-<id>@example.test` y contraseña aleatoria, y un `JWT_SECRET` aleatorio. De `.env` solo toma `MONGO_URI`: los procesos hijos no heredan el resto de la configuración ni los secretos, y lo que la corrida no fija usa los valores por defecto de la API.
3. Compila la API y la levanta en un puerto libre contra esa base, con `ALLOWED_ORIGINS` igual al origen del admin. Todos los rate limits quedan con sus valores por defecto: con sesión, el admin usa el bucket por usuario (ADR-016). La suite hace 3 logins, dentro de la ráfaga de 5 por IP: con `--repeat-each` o reintentos, el sexto recibe 429.
4. Levanta el admin con `ng serve` en otro puerto libre de `127.0.0.1`, apuntando a la API en `127.0.0.1`. Admin y API van en el mismo host porque la cookie es `SameSite=Strict`.
5. Corre `playwright test` con las URLs y las credenciales de prueba por variables de entorno.
6. Siempre, aunque algo falle o se interrumpa (Ctrl+C, `SIGTERM` o cerrar la terminal): para los procesos y borra la base temporal con `mongosh` dentro del contenedor, después de comprobar que existe ahí.

Los logs de la API y del admin quedan en `e2e/test-results/{api,admin}.log`, y el reporte de Playwright en `e2e/playwright-report/` (los dos ignorados por git). El trace de un test fallido guarda lo que se escribió en los campos, incluida la contraseña de prueba (efímera).

Si una corrida muere sin limpiar (por ejemplo, con `kill -9`), `make e2e-clean` borra las bases `e2e_*`, incluida la de una corrida que esté en curso. Los procesos de esa corrida siguen vivos: páralos con `pkill -f 'personal-blog-e2e-.*/api'` y `pkill -f 'ng serve --host 127.0.0.1'`.

Los specs son TypeScript y Playwright no verifica sus tipos: `pnpm --filter @personal-blog/e2e typecheck`.

Desde un worktree de git, `make e2e` necesita su propio `.env` (cópialo o enlázalo del checkout principal). `docker-compose.yml` declara `name: personal-blog`, así que usa el mismo MongoDB.

No corre en el CI todavía.

## Regenerar el contrato

Todo cambio de la API empieza en `docs/api/openapi.yaml` ([ADR-007](adr/007-contrato-api-spec-first-oapi-codegen.md)). Claude Code sigue el procedimiento completo con la skill `contrato-api` (`.claude/skills/contrato-api/SKILL.md`).

1. Edita `docs/api/openapi.yaml`.
2. Ejecuta `make generate`, que actualiza `services/api/internal/handler/gen/`, `packages/api-types/` y `docs/api/bruno/generated/`.
3. Sube los archivos generados junto con el spec, incluidos los nuevos. CI falla si difieren o si `make generate` crea o borra archivos.

El código generado nunca se edita a mano.

## Frontends

### Web (`apps/web`)

El sitio público ([ADR-017](adr/017-arquitectura-de-la-web-publica-nextjs.md)): portafolio y blog en Next.js 16 con App Router, TypeScript estricto y Chakra UI v3.

```sh
make web-dev        # next dev en http://localhost:3000, contra la API de make api-run
make web-build      # build de producción contra la API local (WEB_API_BASE_URL=<origen> para otra)
make web-start      # sirve ese build: reproduce el ISR y las cabeceras de producción
make web-lint       # ESLint con typescript-eslint estricto
make web-typecheck  # tsc --noEmit
make web-test       # Vitest de lib/
```

- **Rutas:**
  - `/`: portada (presentación, acerca de mí, biografía, últimos 3 posts y redes).
  - `/works` y `/works/[id]`: trabajos, estáticos, con el contenido de `lib/site.ts`. Un id que no está ahí da 404.
  - `/blog` y `/blog/[slug]`: lista de posts y cada post. `/posts` y `/posts/[slug]` redirigen (308) a `/blog`.
  - `/sitemap.xml`, `/robots.txt` y `/feed.xml` (RSS de los últimos 20 publicados), con ISR de 60 s. `/og.png` es la imagen Open Graph por defecto, generada en el build.
- **Contenido** (`lib/site.ts`): textos, trabajos y redes de la web anterior. Las imágenes van en `assets/img/` (importadas con `next/image`) y las de los posts en `public/img/blog/`. Los 2 artículos de la web anterior están en `docs/web/posts-migrados/`, listos para crearlos desde el admin.
- **Tema** (`components/theme/system.ts` y `lib/brand.ts`): colores de la marca con contraste AA (lo comprueba `lib/brand.test.ts`). El modo claro, oscuro o sistema lo aplica un script inline en `<head>` (`lib/color-mode.ts`) antes de pintar; la CSP de ADR-017 lo permite sin nonces.
- **SEO** (`lib/seo.ts`): cada página pide su metadata con `pageMetadata` (canónica, Open Graph, Twitter y el RSS). La imagen de un post es la primera imagen de su Markdown, si tiene; si no, `/og.png`. `SITE_URL` decide las URLs absolutas.
- **Datos** (`lib/api.ts`): `fetch` nativo hacia la API pública de posts, con la caché de Next (`revalidate: 60`). Solo el servidor de Next llama a la API, así que no hace falta `localhost:3000` en `ALLOWED_ORIGINS`.
- **Variables:**
  - `API_BASE_URL`: obligatoria en producción. Sin ella, el build falla en lugar de publicar un sitio vacío. En `next dev` usa `http://localhost:8080` por defecto.
  - `WEB_SKIP_API=1`: construye sin API, solo para el CI (en Vercel, con `VERCEL` definida, el build falla). Las páginas salen vacías y los posts se generan en su primera visita.
  - `SITE_URL` (por defecto `https://huitzi.xyz`): decide qué links son internos y las URLs absolutas de canónicas, Open Graph, sitemap y RSS. En local, `SITE_URL=http://localhost:3000`.
  - `VERCEL_ENV`: si existe y no es `production`, `robots.txt` bloquea a los buscadores (previews).
  - `WEB_PRERENDER_LIMIT` (por defecto `10`): posts que el build pregenera (ADR-020). Debe quedar por debajo de la ráfaga anónima de la API (20) menos las listas; un valor que no sea un entero no negativo hace fallar el build.
- **ISR:**
  - `/`, `/blog`, el sitemap y el RSS se regeneran como mucho cada 60 s, y comparten las peticiones a la API con la caché de Next.
  - `/blog/[slug]` pregenera los N posts más recientes (`WEB_PRERENDER_LIMIT`, por defecto 10; ADR-020). El resto se genera en su primera visita y queda en caché.
  - Un post recién publicado tarda hasta un minuto en aparecer en `/`. Mientras la caché esté vieja, la primera visita sirve la versión anterior y dispara la regeneración.
- **Riesgos de ADR-017 y cómo se resuelven:**
  - **429 en el build:** el build hace como mucho 1 lista de inicio + 1 lista de slugs por cada 100 publicados + N posts. Next reutiliza las respuestas cacheadas entre páginas, y en local fueron 3 peticiones con un post publicado. Con N = 10 y hasta unos 800 publicados queda por debajo de la ráfaga anónima de 20; si N + 2 la supera, el build lo avisa en el log. Si aun así llega un 429 durante `next build`, espera el `Retry-After` (máximo 10 s, para caber en el límite de 60 s por página de Next) y reintenta hasta 3 veces. Con varios workers, la lista puede pedirse más de una vez; el peor caso estimado con N = 10 es de unas 17 peticiones.
  - **Slugs inventados:** un slug que no cumple el patrón del contrato da 404 sin llamar a la API. Uno que lo cumple se busca en la lista de slugs publicados, que viene de la caché (una pasada como mucho por minuto). Si no está, da 404 sin pedir el post. Así, inventar slugs no gasta el cupo de las IPs de Vercel. Un post recién publicado puede dar 404 hasta que esa lista se regenere, como mucho un par de minutos.
  - **Build del CI sin API:** con `WEB_SKIP_API=1` (ver Variables).
  - **Un 429 o un 5xx nunca es un 404:** solo un 404 de la API da `notFound()`. Un 429, un 5xx o un error de red lanzan `ApiUnavailableError`. En una regeneración, Next conserva la última versión buena. En la primera generación de una página, se muestra `app/error.tsx` («No pudimos cargar esta página»).
- **Markdown** (`lib/markdown.ts`): `createServerRenderer` de `@personal-blog/markdown/server`, con `newTab: 'external'`. Se sanitiza en el servidor; el HTML llega hecho al navegador.
- **Resaltado de código** (`lib/highlight.ts`): Shiki, en el servidor, sobre el HTML **ya sanitizado**. El lenguaje de cada bloque sale de `codeBlocks(source)` de `@personal-blog/markdown/server`, porque la allowlist quita `class`; un bloque se resalta solo si su texto coincide con el del Markdown. Cada token es un `<span style="--shiki-light:…;--shiki-dark:…">` creado con `textContent`, y `components/post-body.tsx` elige la variable según el modo. No agrega JavaScript al navegador y cabe en la CSP (`style-src 'unsafe-inline'` permite el atributo `style`). Lenguajes: TypeScript, TSX, JavaScript, JSX, JSON, shell, YAML, Go, HTML, CSS, SQL, diff y Dockerfile, con sus alias (`ts`, `sh`, `yml`…); los demás, y los bloques sin lenguaje, quedan como texto plano. Temas `github-light-default` (con tres colores oscurecidos) y `github-dark-default`; `lib/highlight.test.ts` exige 4.5:1 de contraste sobre los fondos de código. Para agregar un lenguaje, impórtalo en `lib/highlight.ts` y agrega una muestra a esa prueba.
- **CSP y cabeceras** (`lib/security-headers.ts`, aplicadas en `next.config.ts`): las de ADR-017, punto 4. En `next dev` se añade `'unsafe-eval'` (React Refresh) y se quita `upgrade-insecure-requests`.
- **Paquetes del monorepo:** `transpilePackages` compila `@personal-blog/markdown` y `serverExternalPackages` deja jsdom fuera del bundle.
- **CI:** job `web` (ADR-017, punto 7), con lint, typecheck, tests y build con `WEB_SKIP_API=1`.
- **Probar de punta a punta en local:** `make api-run`, `make admin-dev`, `make web-build` y `make web-start`. Publica un post en el admin y abre `http://localhost:3000/blog`. Si no aparece, recarga pasados 60 s.
- **Pendiente:** el despliegue en Vercel.

### Admin (`apps/admin`)

Angular 22 con Spartan UI y Tailwind 4, según [ADR-012](adr/012-arquitectura-del-admin-angular.md). Usa Node 24 (`nvm use`).

```sh
make admin-dev    # http://localhost:4200
make admin-lint   # ESLint con angular-eslint
make admin-test   # Vitest con Testing Library
make admin-build  # build de producción en apps/admin/dist/
```

El lint usa las reglas recomendadas de ESLint, typescript-eslint y angular-eslint, también en los templates inline, incluidas las de accesibilidad (`apps/admin/eslint.config.mjs`). Los componentes helm de `shared/ui/` usan el prefijo `hlm` de Spartan; el resto, `app`.

El CI corre lint, tests y build del admin en el job `admin` ([ADR-014](adr/014-filtros-del-ci-para-admin-y-api.md)).

Para iniciar sesión en local hace falta un administrador: `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` en `.env`, con la colección `users` vacía, y una contraseña de al menos 12 caracteres. Sin ellas, la API no arranca.

El admin llama a la API en otro origen, como en producción. `ALLOWED_ORIGINS` de `.env` debe incluir `http://localhost:4200`; ya viene así en `.env.example`.

#### URL de la API

El token `API_BASE_URL` (`core/config/api-config.ts`) toma el origen de la API del `define` de `angular.json`, que el build reemplaza en el código según la configuración:

| Configuración | Se usa en | `ADMIN_API_BASE_URL` |
| --- | --- | --- |
| `development` | `make admin-dev` y `make admin-test` | `http://localhost:8080` |
| `production` | `make admin-build` y el deploy | `https://api.huitzi.xyz` |

El valor es un literal de JavaScript, por eso va entre comillas simples dentro del string de JSON: `"'https://api.huitzi.xyz'"`. Es un origen: sin path ni barra final.

Para correr el admin contra una API en otro puerto, sin editar archivos versionados:

```sh
make admin-dev ADMIN_API_BASE_URL=http://localhost:9090
```

`ng serve` combina ese `--define` con el de `development`. La API de ese puerto también debe tener `http://localhost:4200` en `ALLOWED_ORIGINS`. No uses `8081`: es el puerto de `make api-docs`.

El script `build` del paquete corre `scripts/check-api-base-url.mjs` antes de `ng build`. Ese chequeo falla si falta `ADMIN_API_BASE_URL` en `production`, si no es un literal de string, si no es https o si no es un origen limpio. También falla si la CSP de `vercel.json` no tiene `connect-src` igual a ese origen, o si incluye `default-src` o `script-src`. Después de `ng build`, `scripts/check-csp-meta.mjs` revisa `dist/admin/browser/index.html`. Falla si no tiene el `<meta http-equiv="Content-Security-Policy">`, si hay más de uno o si aparece después de un `<script>`. También falla si `script-src` no incluye `'strict-dynamic'`, si no tiene hashes (con `'unsafe-inline'` y sin hashes, cualquier script inline correría), si incluye `'unsafe-eval'` o si algún script inline del documento no tiene su hash. Sus casos se prueban con `node --test` dentro de `make admin-test`. Un `ng build` directo se salta los dos chequeos, así que el CI, `make admin-build` y Vercel usan `pnpm --filter @personal-blog/admin build`. Por la misma razón, no le pases argumentos a `pnpm build`: se los llevaría el último comando, `check-csp-meta.mjs`.

### Content-Security-Policy

La CSP del admin está repartida en dos partes (ADR-012, punto 7):

- **Scripts:** `security.autoCsp` en la configuración `production` de `angular.json`. El build agrega a `index.html` un `<meta>` con `script-src` basado en hashes y `'strict-dynamic'`, y carga `main-*.js` desde un script inline con hash. `make admin-dev` no lo usa.
- **El resto:** la cabecera `Content-Security-Policy` de `apps/admin/vercel.json`, sin `default-src` ni `script-src` (bloquearían el loader de `autoCsp`), con cada directiva explícita y `connect-src` limitado al origen de la API. Trusted Types va solo en `Content-Security-Policy-Report-Only`, porque el loader de `autoCsp` asigna `script.src` con un string. `vercel.json` también envía `nosniff`, `Referrer-Policy`, `X-Robots-Tag: noindex` y un rewrite de todas las rutas a `index.html`.

Como la cabecera no tiene `script-src`, el `<meta>` es la única protección de scripts: un build sin él no muestra ningún error y deja correr cualquier script inyectado. Por eso `make admin-build` falla si falta, y `make admin-preview` y `make admin-csp-test` siempre reconstruyen en vez de servir un `dist/` viejo.

Para probarla en local:

```sh
make admin-csp-test  # prueba automática en Chrome o Chromium headless
make admin-preview   # http://127.0.0.1:4300, para probar a mano
```

`scripts/serve-dist.mjs` solo usa módulos de Node: aplica las cabeceras y los rewrites de `vercel.json`, primero busca el archivo y después aplica el rewrite, como Vercel. Acepta un puerto y un directorio: `node scripts/serve-dist.mjs 4300 <dir>`.

`scripts/check-csp-browser.mjs` levanta `serve-dist.mjs` en el puerto 4310, abre `/login` en un navegador headless y lo controla por el protocolo de DevTools con el `WebSocket` nativo de Node, sin dependencias. Busca Chrome, Chromium o Brave en las rutas habituales; con `CHROME_PATH=<ruta>` usa otro. Comprueba que el admin arranca, que trae el `<meta>` y que no se ejecutan ni un `<img onerror>` ni un link `javascript:` inyectados. Después recarga con el sistema emulado en oscuro y comprueba que la clase `dark` llega a `<html>` antes de que exista `<body>`: eso solo lo hace el script de tema de `<head>`, así que prueba que corre bajo la CSP. Por último abre `/posts/new` y usa el editor (Milkdown, ADR-018): comprueba que su tema cargó desde `milkdown-theme.css`, escribe un título, abre el menú «/» y un bloque de código con CodeMirror, y falla si hubo alguna violación de la CSP aplicada desde que empezó la carga. La API no se toca: DevTools intercepta las llamadas al origen del `connect-src` de `vercel.json` y responde `/auth/me` con un usuario de prueba para pasar el guard. Las violaciones de la política Report-Only (Trusted Types) del editor se listan sin exigirlas. El job `admin` del CI la corre después del build, con el Chrome que traen los runners de Ubuntu.

Si no hay navegador headless, la prueba manual es esta: con `make admin-preview` abierto, pega en la consola de DevTools

```js
document.body.insertAdjacentHTML('beforeend', '<img src="/x.png" onerror="console.log(\'XSS\')">')
```

Lo esperado es que **no** aparezca `XSS` y sí una violación de `script-src-attr`. Si aparece `XSS`, el build no trae el `<meta>` de CSP.

Un `<script>` inline creado con `document.createElement('script')` sí se ejecuta, y es correcto: con `'strict-dynamic'`, el código que ya corre puede crear scripts, inline o no. Una inyección de HTML no puede hacerlo, porque `innerHTML` no ejecuta `<script>`.

En la consola también aparecen violaciones de Trusted Types en modo reporte, que causa el loader de `autoCsp`; son esperadas. Antes de producción hay que validarlo también en un preview de Vercel.

Estructura de `src/app/`:

- `core/`: configuración, sesión, interceptores, guards, el layout y el tema.
  - `layout/admin-shell.ts`: el layout de las pantallas con sesión (BLOG-017). Barra superior con el nombre del sitio; en escritorio (`lg`, 64rem) el menú es una barra lateral fija, y en móvil y tablet un offcanvas (`sheet` de Spartan) que se abre con el botón de la barra. Se carga por ruta, con las rutas de posts como hijas; el login queda fuera. El offcanvas se cierra con Esc, al empezar una navegación y al pasar a escritorio. El foco queda atrapado en el panel y, al cerrarlo, vuelve al botón (CDK); si se cierra porque la ventana pasó a escritorio, el botón ya no existe y el foco va a `<main>`.
  - `layout/admin-nav.ts`: el contenido del menú. Navegación (Posts y Nuevo post, con `aria-current`) y Perfil: email, cerrar sesión y Apariencia (tema y color de acento como grupos de radios). Se pinta en la barra lateral o en el offcanvas, nunca en los dos a la vez. «Cerrar sesión» primero navega a `/posts` y solo cierra la sesión si la navegación no se cancela: si el editor tiene cambios sin guardar y eliges seguir editando, la sesión sigue abierta.
  - `theme/theme.service.ts`: tema Claro, Oscuro o Sistema, y color de acento. Pone la clase `dark` (variante dark de Tailwind por clase) y `data-accent` en `<html>`. En Sistema sigue `prefers-color-scheme` en vivo, y escucha el evento `storage` para aplicar lo que se elija en otra pestaña. Guarda en `localStorage` (`admin-theme` y `admin-accent`) con try/catch: si no se puede, la preferencia vale para la sesión y la app arranca con el tema del sistema. Se crea al arrancar, con `provideAppInitializer`.
  - `theme/theme.ts`: las listas de modos y paletas, sin imports, para que los tests de `scripts/` las lean con Node.
  - **Sin parpadeo:** un script inline en `src/index.html` aplica el tema guardado antes de que arranque Angular. `autoCsp` le pone su hash en el `<meta>` de CSP; `check-csp-meta.mjs` y `make admin-csp-test` lo comprueban, y `scripts/theme-script.test.mjs` prueba su lógica y que use las listas de `theme.ts`.
  - **Paletas de acento:** Neutro, Azul, Verde, Violeta, Ámbar y Rosa, en `styles.css` como bloques `[data-accent='…']` y `.dark[data-accent='…']` que redefinen `--primary` y afines. Neutro repite los valores del tema de Spartan, para que su muestra se vea neutra aunque `<html>` tenga otro acento; un test lo comprueba. `scripts/check-theme-contrast.mjs` comprueba WCAG AA en claro y oscuro: texto principal, botones, acento sobre el fondo, link activo, y el texto y el acento sobre el glass de la barra y el offcanvas (`bg-background/80`) en el peor caso, con negro o blanco detrás. Para ver la tabla: `node scripts/check-theme-contrast.mjs` desde `apps/admin`.
  - **Sin texto secundario sobre el glass:** `muted-foreground` sobre el glass baja a 2.95:1 en claro en el peor caso, así que el shell y el menú no lo usan; `scripts/theme-glass-text.test.mjs` falla si aparece.
  - `browser/match-media.ts`: `MATCH_MEDIA` e `injectMediaQuery()`, una signal que sigue una media query. jsdom no tiene `matchMedia`; los tests usan los fakes de `browser/browser-fakes.ts`.
  - `session/session.service.ts`: estado de la sesión con signals. Como la cookie es `HttpOnly`, la sesión se conoce preguntando a `GET /api/v1/auth/me`, una sola vez, en la primera navegación.
  - `http/credentials.interceptor.ts`: agrega `withCredentials` solo a las peticiones al origen de `API_BASE_URL`.
  - `http/refresh.interceptor.ts` y `session/session-refresher.ts`: ante un 401 de la API hacen un solo `POST /auth/refresh` compartido y reintentan. No actúan sobre `/auth/login` ni `/auth/refresh`. Si el refresh falla, limpian la sesión y van a `/login?returnUrl=…`.
  - `session/session.guards.ts`: `authGuard` para las rutas protegidas y `guestGuard` para `/login`.
  - `http/problem-messages.ts`: traduce los errores de la API al español, incluido el tiempo de `Retry-After` en un 429.
  - `http/api-error.ts`: `ApiError`, el error que devuelven los servicios de la API: `message` ya en español, más el `status` y el `detail` del problem+json para decidir qué hacer.
  - `api/posts-api.ts`: `PostsApi`, los endpoints de admin de posts tipados con `@personal-blog/api-types`. Codifica el ID en la URL, puntos incluidos, para que no cambie la ruta de la petición.
- `features/`: una carpeta por pantalla, con carga diferida por ruta.
  - `posts/posts.routes.ts`: las rutas de posts, cargadas con `loadChildren` desde `app.routes.ts`. `/` redirige a `/posts`.
  - `posts/post-editor.page.ts`: crear (`/posts/new`) y editar (`/posts/:id`) en la misma ruta, que se carga en su propio chunk.
    - **Formulario:** los límites del contrato están en `post-form.ts`.
    - **Slug:** queda de solo lectura, con la explicación, si el post ya se publicó alguna vez o no es un borrador. Un 409 de slug duplicado o bloqueado se muestra en el campo.
    - **Acciones según el estado:** borrador → guardar o publicar; publicado → guardar cambios o despublicar; archivado → restaurar como borrador o publicar. También se puede archivar con confirmación.
    - **Al salir con cambios sin guardar:** `unsaved-changes.guard.ts` pregunta en un diálogo, y `beforeunload` cubre cerrar o recargar la pestaña.
  - `posts/posts-list.page.ts`: lista con filtro por estado y paginación de 20 en 20. La paginación queda centrada y al final de la página aunque haya pocos posts: `<main>` es una columna flex, la página crece con `flex-1` y la paginación usa `mt-auto`. El filtro y la página van en la URL (`?status=draft&offset=20`); un valor inválido se ignora. Archivar pide confirmación en un `alert-dialog`.
- `shared/ui/`: componentes helm de Spartan, copiados al repo, y componentes propios.
- `shared/markdown-editor/`: el editor de ADR-018, Milkdown Crepe con la vista previa al lado. Su interfaz sigue siendo `value` y `valueChange` (ADR-012), así que el formulario no cambió.
  - `milkdown.ts` es el único módulo que importa Milkdown, y el componente lo carga con `import()`: Milkdown, ProseMirror, CodeMirror y Vue van en el chunk `milkdown`, que solo se descarga al abrir el editor. Se arma con `CrepeBuilder` y las funciones permitidas; Latex, ImageBlock, AI y TopBar quedan fuera, y tampoco entran al bundle. Las imágenes pegadas o arrastradas como archivo se ignoran (no hay subida), y el menú «/» no ofrece imágenes, fórmulas ni listas de tareas: quedarían fuera de la allowlist.
  - Avisa con el debounce del listener de Milkdown (200 ms): serializar el documento entero en cada tecla es caro en posts largos. Antes de guardar, y antes de decidir si hay cambios sin guardar (guard y `beforeunload`), la página llama a `flush()`, que emite ya lo pendiente; sin eso se perdería lo escrito en los últimos 200 ms. Un valor que llega de fuera (el post cargado) se aplica sin emitir.
  - Milkdown reescribe la forma del Markdown (`*` en las listas, `***` en los separadores, salto de línea final, tablas alineadas). `milkdown.spec.ts` prueba con Milkdown real que lo que se publica no cambia y que guardar y volver a abrir da el mismo texto; el E2E lo prueba contra la API.
  - El tema (`milkdown-theme.css`) es el CSS de Crepe de las funciones usadas, con sus colores tomados de los tokens del admin. Es una hoja global aparte: `angular.json` la compila con `bundleName: "milkdown-theme"` e `inject: false`, así que sale sin hash, no entra al bundle inicial ni a `index.html`, y el editor la carga con un `<link>` al abrirse (`milkdown-theme.ts`). Los estilos del componente solo tienen el marco y la vista previa.
  - La vista previa usa `renderMarkdown` de `@personal-blog/markdown` (ver «Paquete `packages/markdown`»); el resultado se enlaza con `[innerHTML]`, y `bypassSecurityTrust*` está prohibido por una regla `no-restricted-syntax` de ESLint.
  - Los tests de las páginas usan `markdown-editor-fake.ts`, un textarea con la misma interfaz (ADR-015).

#### Agregar un componente de Spartan

El CLI de Spartan no entra al repo porque depende de Nx (ADR-012). Los componentes helm se generan en un proyecto temporal y se copian:

1. Fuera del repo, crea un proyecto Angular de la misma versión. `npm_config_before` aplica la edad mínima de ADR-013 también ahí; usa la fecha de hace 7 días:

   ```sh
   export npm_config_before=AAAA-MM-DD
   npx @angular/cli@<versión de @angular/cli del admin> new spartan-tmp --style=css --ssr=false --skip-git --defaults --package-manager=npm
   cd spartan-tmp
   npm i -D --save-exact @spartan-ng/cli@<versión de @spartan-ng/brain del admin>
   npm i --save-exact @spartan-ng/brain@<la misma versión>
   ```

2. Crea `components.json` para que el CLI no pregunte nada:

   ```json
   { "componentsPath": "libs/ui", "importAlias": "@spartan-ng/helm", "style": "vega" }
   ```

3. Genera el componente. Usa `--interactive=false` y `< /dev/null`, porque si el CLI quiere preguntar algo se queda esperando:

   ```sh
   npx ng g @spartan-ng/cli:ui <componente> --directory=libs/ui --interactive=false < /dev/null
   ```

4. Copia `libs/ui/<componente>` a `apps/admin/src/app/shared/ui/`, incluidos los componentes de los que depende (el CLI los genera también).
5. Agrega el alias `@spartan-ng/helm/<componente>` en `apps/admin/tsconfig.json`.
6. Si el componente importa un paquete nuevo, agrégalo a `apps/admin/package.json` con versión exacta, y justifícalo en el PR.
7. Revisa el diff y borra el proyecto temporal.

El tema se generó igual, con `ng g @spartan-ng/cli:ui-theme --theme=neutral`, y está en `apps/admin/src/styles.css`.

Hoy están `alert-dialog`, `badge`, `button`, `card`, `empty`, `field`, `input`, `label`, `radio-group`, `separator`, `sheet`, `table`, `textarea` y `utils`. `sheet` importa `@ng-icons/core` y `@ng-icons/lucide` para su botón de cerrar, así que desde BLOG-017 son dependencias del admin; el shell los usa también para el ícono de menú.

El admin no usa `provideSpartanHlm()`. Solo cambia el default de los overlays del CDK (`usePopover: false`) para que convivan con `<hlm-toaster>`, que el admin no tiene, y como importa `@angular/cdk/overlay` desde `app.config`, metería el overlay entero del CDK (unos 46 kB) en el bundle inicial. Tampoco sirve en las `providers` de una ruta: el CDK lo lee del injector raíz. Sin él, los diálogos se muestran en el top layer del navegador (`popover`). Si algún día entra `<hlm-toaster>`, hay que volver a ponerlo en `app.config` y aceptar ese tamaño.


### Paquete `packages/markdown`

`@personal-blog/markdown` es la única fuente de la allowlist, la política de URLs y el render de Markdown ([ADR-017](adr/017-arquitectura-de-la-web-publica-nextjs.md), punto 5). Convierte con `marked` y sanitiza con DOMPurify (ADR-010, punto 4; ADR-012, punto 6). Se publica como TypeScript sin compilar: cada app lo compila con lo suyo. Por eso sus imports relativos llevan la extensión `.ts` (`./policy.ts`): el pre-empaquetado de Vite en `ng serve` y Turbopack en Next no infieren la extensión dentro de un paquete. El paquete activa `allowImportingTsExtensions`, y el admin `rewriteRelativeImportExtensions`, porque su compilación emite JavaScript.

- **Variantes:**
  - `@personal-blog/markdown`, para el navegador: `renderMarkdown(source)` sanitiza con el DOM de la página y resuelve las URLs relativas contra `window.location`. La usa el admin. `createBrowserRenderer({ newTab })` crea otro con otra política de links.
  - `@personal-blog/markdown/server`, para el servidor: `createServerRenderer({ siteUrl, newTab })` devuelve el mismo render, con DOMPurify sobre un DOM de jsdom; las URLs relativas se resuelven contra `siteUrl`. Crea el DOM una vez: guarda el render y reúsalo. Un `siteUrl` inválido lanza al crearlo. La usará `apps/web`, que nunca debe importar la raíz del paquete en el servidor: la raíz lee `window` al cargarse.
  - Si el DOM no sirve a DOMPurify, crear el render lanza un error en lugar de devolver HTML sin sanitizar.
  - `codeBlocks(source)` (en la entrada `/server`) devuelve el lenguaje y el texto de cada bloque de código, en orden, con la misma configuración de `marked` que el render. No devuelve HTML; la web lo usa para resaltar el código después de sanitizar.
  - Las dos comparten `src/renderer.ts`; solo cambian el DOM y la URL base.
- **Allowlist explícita:** `ALLOWED_TAGS` y `ALLOWED_ATTR` en `src/policy.ts`.
- **URLs (`isSafeUrl`):** un hook las valida con el parser de URLs WHATWG (`new URL()`). Las absolutas solo pueden ser `http(s)`, o `mailto` en links. Las relativas solo valen si resuelven al origen de la página, y las anclas valen en links. DOMPurify deja pasar `data:` en `<img>`, y el navegador lee `/\host` como `//host`; los dos casos tienen test.
- **Links (`newTab`):** con `all` (el admin) todos abren en otra pestaña; con `external` (la web) solo los que resuelven a `http(s)` de otro origen (`isExternalLink`); en el servidor, «otro origen» es otro que `siteUrl`, así que en un preview de Vercel un link absoluto a `huitzi.xyz` abre en la misma pestaña. Los relativos, las anclas, los del mismo origen y `mailto:` abren en la misma. Los que abren en otra pestaña llevan siempre `rel="noopener noreferrer"`; `target` y `rel` escritos en el Markdown se descartan.
- **Tests** (`pnpm --filter @personal-blog/markdown test`):
  - `src/test/sanitization-suite.ts` tiene los casos que antes estaban en el admin. `browser.spec.ts` los corre sobre la variante de navegador (jsdom como DOM global) y `server.spec.ts` sobre la de servidor, en el entorno `node`, sin `window`.
  - `equivalence.spec.ts` comprueba que, con el mismo origen, las dos variantes dan exactamente el mismo HTML en cada caso.
  - Fallan si se quita DOMPurify o el hook de URLs.
- **Lint y tipos:** `pnpm --filter @personal-blog/markdown lint` y `pnpm --filter @personal-blog/markdown typecheck`. Es TypeScript estricto (`strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`).
- **CI:** mientras no exista el job `web`, el job `admin` corre el lint, los tipos y los tests del paquete, y su filtro incluye `packages/markdown/**`.

## Colección de Bruno

La colección está en `docs/api/bruno/`, en formato OpenCollection (YAML):

- `generated/`: una petición por operación del contrato. `make generate` la regenera desde `docs/api/openapi.yaml` con el CLI de Bruno; no se edita a mano.
- `flows/`: flujos escritos a mano, con aserciones:
  - `flows/posts/` recorre el ciclo de vida de un post: login, crear borrador, editar, publicar, verlo en la API pública, intentar cambiar el slug ya publicado (409), archivar y comprobar que ya no aparece. Cada corrida crea un post nuevo con la hora en el título, que queda archivado en tu base.
  - `flows/sesion/` recorre login, `/me`, refresh, logout y `/me` sin sesión.
  - `flows/asistente/` comprueba el asistente apagado (`ASSISTANT_ENABLED=false`, el valor por defecto): las dos operaciones responden 503 y un borrador de más de 50 000 caracteres responde 400. Con el asistente encendido falla a propósito, para no gastar la cuota de Gemini.
- `environments/local.yml`: `baseUrl` apunta a `http://localhost:8080`. `adminEmail` y `adminPassword` son variables secretas sin valor.

Para usarla desde la app de Bruno, que se instala aparte, abre la carpeta `docs/api/bruno`, elige el environment `local` y escribe el email y la contraseña en sus variables secretas. Bruno los guarda en tu equipo, fuera de los archivos del repo.

Desde la terminal, con la API levantada en otra:

```sh
make api-flows
```

Toma el email y la contraseña de `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` de `.env` y se los pasa al CLI como variables, sin escribirlos en ningún archivo. Deben ser los del administrador que existe en tu base.

Los flujos hacen unas 20 peticiones. Si los corres dos veces seguidas, la segunda puede chocar con el rate limit global de la API (429); espera un minuto.

El generador de Bruno convierte los esquemas de seguridad en cookie (`accessCookie`, `refreshCookie`) en una cabecera `access_token: {{apiKey}}`, no en una cookie. Las peticiones protegidas funcionan igual después del login, porque Bruno guarda las cookies de la respuesta y las reenvía; la API ignora esa cabecera de más. `generated/` se deja tal como sale del CLI.

## Ver el contrato

```sh
make api-docs
```

Abre Swagger UI en `http://localhost:8081` con `docs/api/openapi.yaml`, servido desde Docker en solo lectura. Solo es para desarrollo: la API no sirve el contrato.

## Probar el login con curl

Necesitas un administrador: define `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` en `.env` antes del primer arranque. Las cookies llevan `Secure`, pero curl las guarda y las envía igual en `http://localhost`. `-c` guarda las cookies en un archivo y `-b` las envía.

Para no dejar la contraseña en el historial del shell, ponla en un archivo JSON fuera del repo, por ejemplo `~/login.json`, con `{"email":"...","password":"..."}`:

```sh
curl -c cookies.txt -H 'Content-Type: application/json' -d @$HOME/login.json localhost:8080/api/v1/auth/login
curl -b cookies.txt localhost:8080/api/v1/auth/me
curl -b cookies.txt -c cookies.txt -X POST localhost:8080/api/v1/auth/refresh
curl -b cookies.txt -c cookies.txt -X POST localhost:8080/api/v1/auth/logout
rm cookies.txt
```

- Login devuelve el usuario y dos cookies: `access_token`, de 15 minutos, y `refresh_token`, de 7 días, que solo se envía a `/api/v1/auth`.
- Refresh responde 204 y rota las dos cookies. Si se usa un refresh token ya rotado, responde 401 y revoca la sesión.
- Logout responde 204 y borra las cookies, haya sesión o no.
- Tras 5 logins fallidos con un email en 15 minutos, el siguiente responde 429 con `Retry-After`. Un login correcto reinicia la cuenta. Para desbloquear en local, reinicia la API: el contador está en memoria.

`cookies.txt` contiene tokens válidos: no lo subas a git y bórralo al terminar.

## Troubleshooting

### MongoDB no arranca: `Linux kernel versions 6.19 and newer`

MongoDB 8.x se niega a arrancar en kernels 6.19 a 7.0.13 ([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). `make db-up` falla, y `make db-logs` muestra el error.

La solución oficial es usar un kernel 7.0.14 o posterior. Comprueba el que usa Docker con:

```sh
docker info --format '{{.KernelVersion}}'
```

En CI, por este motivo, el job `api` usa `ubuntu-22.04`; ni `ubuntu-latest` ni `ubuntu-24.04` funcionan (BLOG-033).

### Falla la autenticación contra MongoDB

`MONGO_INITDB_ROOT_USERNAME` y `MONGO_INITDB_ROOT_PASSWORD` solo se aplican cuando el volumen está vacío. Cambiarlas después en `.env` no cambia el usuario que ya existe, y la API deja de autenticarse.

Tienes dos opciones:

- Volver a poner en `.env` los valores originales.
- Ejecutar `make db-reset`, que **borra todos los datos locales**, y después `make db-up`.

`MONGO_URI` debe llevar la misma contraseña, URL-encoded.

### La API no arranca: `missing required environment variable JWT_SECRET`

Tu `.env` es anterior a `JWT_SECRET`. Genera un secreto con `openssl rand -base64 32` y agrégalo a `.env` como `JWT_SECRET='...'`. Si el error dice `must be at least 32 bytes`, el valor es demasiado corto.

### Un valor de `.env` con `$` queda cortado

`make api-run` carga `.env` con `. ./.env`, así que el shell expande `$` en valores sin comillas o con comillas dobles, y `#` o los espacios también pueden romper un valor. Usa comillas simples:

```sh
INITIAL_ADMIN_PASSWORD='pa$$word with spaces'
```

## Asistente de escritura

ADR-021. La API expone dos operaciones autenticadas, que solo sugieren y nunca guardan nada:

- `POST /api/v1/admin/assistant/improve-writing` devuelve el contenido reescrito en Markdown.
- `POST /api/v1/admin/assistant/suggest-metadata` devuelve título, extracto y etiquetas, validados con las mismas reglas que un post.

Las dos reciben `{ "title", "content" }`: hasta 200 y 50 000 caracteres. Solo eso llega al proveedor.

- **Capas:** el puerto `domain.WritingAssistant` tiene dos adaptadores: `internal/assistant/gemini`, con el SDK `google.golang.org/genai`, y el fake de los tests (ADR-015). `service.AssistantService` aplica el timeout, valida la salida y deja un log por llamada con modelo, latencia, tokens y resultado, nunca con el contenido ni la key.
- **Prompt:** las instrucciones van como instrucción de sistema. El borrador va en el mensaje del usuario como un objeto JSON, así que su texto no puede cerrar el delimitador ni hacerse pasar por instrucciones. La salida se pide con JSON Schema.
- **Errores:** todos responden 503 con problem+json, sin reintentos y con el `detail` en inglés:
  - asistente apagado: `writing assistant is disabled`;
  - el proveedor falló, venció el timeout o se agotó la cuota: `writing assistant is unavailable, try again later`;
  - el modelo respondió algo que no cumple las reglas: `writing assistant returned an invalid suggestion, try again`.
- **Tests:** nunca llaman a Gemini. El adaptador se prueba contra `httptest` con las respuestas de `internal/assistant/gemini/testdata/`. Para probarlo a mano, pon tu key y un modelo en `.env`, `ASSISTANT_ENABLED=true`, y usa las peticiones de `docs/api/bruno/generated/admin-assistant/` después del login.
