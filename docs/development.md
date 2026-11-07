# Guía de desarrollo

Cómo levantar y probar el proyecto en local. Las decisiones están en [docs/adr](adr/) y el backlog en [roadmap.md](roadmap.md).

## Prerrequisitos

| Herramienta | Versión | Dónde está fijada |
| --- | --- | --- |
| Node.js | 24 | `.nvmrc` y `package.json`; con otra versión, `pnpm install` falla (`engine-strict` en `.npmrc`) |
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
│   └── api-types/        # Tipos TypeScript generados del contrato
├── services/
│   └── api/              # API en Go + Gin
│       ├── cmd/api/      # Punto de entrada
│       └── internal/
│           ├── config/       # Variables de entorno
│           ├── domain/       # Entidades, puertos y errores
│           ├── handler/      # HTTP; handler/gen es código generado
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
| `RATE_LIMIT_GLOBAL_PER_MINUTE` / `_BURST` | No | `60` / `20` | Límite por IP en `/api/v1` |
| `RATE_LIMIT_LOGIN_PER_MINUTE` / `_BURST` | No | `5` / `5` | Límite extra en `POST /api/v1/auth/login` |
| `RATE_LIMIT_REFRESH_PER_MINUTE` / `_BURST` | No | `10` / `10` | Límite extra en `POST /api/v1/auth/refresh` |
| `INITIAL_ADMIN_EMAIL` | No | | Email del administrador inicial |
| `INITIAL_ADMIN_PASSWORD` | No | | Contraseña del administrador inicial |

## Comandos del Makefile

| Comando | Qué hace |
| --- | --- |
| `make api-run` | Carga `.env` y levanta la API |
| `make api-test` | Corre los tests de Go con `-race`; los de integración se saltan |
| `make api-test-integration` | Levanta MongoDB y corre los tests de `internal/repository` contra él |
| `make api-lint` | Corre `golangci-lint` |
| `make web-dev` | Levanta el spike de `apps/web` en `http://localhost:3000`; con `WEB_API_BASE_URL=<origen>` usa otra API |
| `make web-typecheck` | Verifica los tipos del JavaScript de `apps/web` contra los JSDoc y el contrato |
| `make web-test` | Corre los tests de `apps/web/lib/` con `node --test` |
| `make admin-dev` | Levanta el admin en `http://localhost:4200`; con `ADMIN_API_BASE_URL=<origen>` usa otra API |
| `make admin-lint` | Corre ESLint con angular-eslint en el admin |
| `make admin-test` | Corre los tests del admin y los de los scripts de `apps/admin/scripts/` |
| `make admin-build` | Build de producción del admin; antes verifica que la URL de la API de producción sea https y que coincida con el `connect-src` de `vercel.json`, y después que `index.html` traiga el `<meta>` de CSP de `autoCsp` |
| `make admin-preview` | Hace el build de producción y lo sirve en `http://127.0.0.1:4300` con las cabeceras de `apps/admin/vercel.json` |
| `make admin-csp-test` | Hace el build de producción y prueba su CSP en Chrome o Chromium headless |
| `make api-docs` | Muestra el contrato con Swagger UI en `http://localhost:8081` |
| `make api-flows` | Corre los flujos de Bruno contra la API local |
| `make api-build` | Compila el binario en `services/api/bin/api` |
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

## Regenerar el contrato

Todo cambio de la API empieza en `docs/api/openapi.yaml` ([ADR-007](adr/007-contrato-api-spec-first-oapi-codegen.md)). Claude Code sigue el procedimiento completo con la skill `contrato-api` (`.claude/skills/contrato-api/SKILL.md`).

1. Edita `docs/api/openapi.yaml`.
2. Ejecuta `make generate`, que actualiza `services/api/internal/handler/gen/`, `packages/api-types/` y `docs/api/bruno/generated/`.
3. Sube los archivos generados junto con el spec, incluidos los nuevos. CI falla si difieren o si `make generate` crea o borra archivos.

El código generado nunca se edita a mano.

## Frontends

### Web (`apps/web`), spike en borrador

**Spike sin ADR:** no se mergea hasta que exista el ADR de `apps/web`. Next.js 16 con App Router, en JavaScript con `// @ts-check` y JSDoc, y Chakra UI v3.

```sh
make web-dev        # http://localhost:3000, contra la API de make api-run
make web-typecheck  # tsc con checkJs sobre jsconfig.json
make web-test       # node --test de lib/*.test.mjs
```

- **API:** `lib/api.js` llama a la API pública de posts (`GET /api/v1/posts` y `GET /api/v1/posts/{slug}`) con `fetch` nativo desde el servidor. Next la cachea con `revalidate` (ISR, 60 s). La URL sale de `API_BASE_URL` (por defecto `http://localhost:8080`); con `make web-dev WEB_API_BASE_URL=<origen>` usa otra. Como las peticiones salen del servidor de Next y no del navegador, no hace falta agregar `localhost:3000` a `ALLOWED_ORIGINS`.
- **Páginas:**
  - `/`: los posts publicados; estática, regenerada como mucho cada minuto. Se prerenderiza en el build, así que `pnpm --filter @personal-blog/web build` necesita la API accesible: sin ella, el build falla.
  - `/posts/[slug]`: el post; `generateStaticParams` devuelve una lista vacía, así que el build no llama a la API y cada slug se genera en su primera visita y queda en caché. Un slug que no existe da 404, y uno que no cumple el patrón `Slug` del contrato da 404 sin llamar a la API.
- **Tipos:** `pnpm typecheck` (`tsc -p jsconfig.json`) verifica los JSDoc y los tipos del contrato importados de `@personal-blog/api-types` (ADR-007). `maxNodeModuleJsDepth: 0` evita que `tsc` analice el JavaScript de las dependencias.
- **Markdown:** `lib/render-markdown.js` usa la misma allowlist que el admin, duplicada (con un TODO) hasta que el ADR decida si se comparte en `packages/`. DOMPurify corre en el servidor sobre `jsdom`. Un test compara las listas con las de `apps/admin`.
- **Lo que falta antes de producción** (va en el ADR): CSP, tema propio y modo oscuro, job `web` en el CI (BLOG-052) y despliegue en Vercel.

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

`scripts/check-csp-browser.mjs` levanta `serve-dist.mjs` en el puerto 4310, abre `/login` en un navegador headless y lo controla por el protocolo de DevTools con el `WebSocket` nativo de Node, sin dependencias. Busca Chrome, Chromium o Brave en las rutas habituales; con `CHROME_PATH=<ruta>` usa otro. Comprueba que el admin arranca, que trae el `<meta>` y que no se ejecutan ni un `<img onerror>` ni un link `javascript:` inyectados. El job `admin` del CI la corre después del build, con el Chrome que traen los runners de Ubuntu.

Si no hay navegador headless, la prueba manual es esta: con `make admin-preview` abierto, pega en la consola de DevTools

```js
document.body.insertAdjacentHTML('beforeend', '<img src="/x.png" onerror="console.log(\'XSS\')">')
```

Lo esperado es que **no** aparezca `XSS` y sí una violación de `script-src-attr`. Si aparece `XSS`, el build no trae el `<meta>` de CSP.

Un `<script>` inline creado con `document.createElement('script')` sí se ejecuta, y es correcto: con `'strict-dynamic'`, el código que ya corre puede crear scripts, inline o no. Una inyección de HTML no puede hacerlo, porque `innerHTML` no ejecuta `<script>`.

En la consola también aparecen violaciones de Trusted Types en modo reporte, que causa el loader de `autoCsp`; son esperadas. Antes de producción hay que validarlo también en un preview de Vercel.

Estructura de `src/app/`:

- `core/`: configuración, sesión, interceptores y guards.
  - `session/session.service.ts`: estado de la sesión con signals. Como la cookie es `HttpOnly`, la sesión se conoce preguntando a `GET /api/v1/auth/me`, una sola vez, en la primera navegación.
  - `http/credentials.interceptor.ts`: agrega `withCredentials` solo a las peticiones al origen de `API_BASE_URL`.
  - `http/refresh.interceptor.ts` y `session/session-refresher.ts`: ante un 401 de la API hacen un solo `POST /auth/refresh` compartido y reintentan. No actúan sobre `/auth/login` ni `/auth/refresh`. Si el refresh falla, limpian la sesión y van a `/login?returnUrl=…`.
  - `session/session.guards.ts`: `authGuard` para las rutas protegidas y `guestGuard` para `/login`.
  - `http/problem-messages.ts`: traduce los errores de la API al español, incluido el tiempo de `Retry-After` en un 429.
  - `http/api-error.ts`: `ApiError`, el error que devuelven los servicios de la API: `message` ya en español, más el `status` y el `detail` del problem+json para decidir qué hacer.
  - `markdown/render-markdown.ts`: convierte Markdown con `marked` y sanitiza con DOMPurify (ADR-010, punto 4; ADR-012, punto 6).
    - **Allowlist explícita:** `ALLOWED_TAGS` y `ALLOWED_ATTR`.
    - **URLs:** un hook las valida con `new URL()`: absolutas solo `http(s)` o `mailto` (en links), relativas solo si resuelven al origen del admin, y anclas. DOMPurify deja pasar `data:` en `<img>`, y el navegador lee `/\host` como `//host`; los dos casos tienen test.
    - **Links:** abren en otra pestaña con `rel="noopener noreferrer"`.
    - **Uso:** el resultado se enlaza con `[innerHTML]`. `bypassSecurityTrust*` está prohibido por una regla `no-restricted-syntax` de ESLint.
    - **Tests:** los de `render-markdown.spec.ts` fallan si se quita DOMPurify o el hook de URLs.
  - `api/posts-api.ts`: `PostsApi`, los endpoints de admin de posts tipados con `@personal-blog/api-types`. Codifica el ID en la URL, puntos incluidos, para que no cambie la ruta de la petición.
- `features/`: una carpeta por pantalla, con carga diferida por ruta.
  - `posts/posts.routes.ts`: las rutas de posts, cargadas con `loadChildren` desde `app.routes.ts`. `/` redirige a `/posts`.
  - `posts/post-editor.page.ts`: crear (`/posts/new`) y editar (`/posts/:id`) en la misma ruta, que se carga en su propio chunk.
    - **Formulario:** los límites del contrato están en `post-form.ts`.
    - **Slug:** queda de solo lectura, con la explicación, si el post ya se publicó alguna vez o no es un borrador. Un 409 de slug duplicado o bloqueado se muestra en el campo.
    - **Acciones según el estado:** borrador → guardar o publicar; publicado → guardar cambios o despublicar; archivado → restaurar como borrador o publicar. También se puede archivar con confirmación.
    - **Al salir con cambios sin guardar:** `unsaved-changes.guard.ts` pregunta en un diálogo, y `beforeunload` cubre cerrar o recargar la pestaña.
  - `posts/posts-list.page.ts`: lista con filtro por estado y paginación de 20 en 20. El filtro y la página van en la URL (`?status=draft&offset=20`); un valor inválido se ignora. Archivar pide confirmación en un `alert-dialog`.
- `shared/ui/`: componentes helm de Spartan, copiados al repo, y componentes propios.
- `shared/markdown-editor/`: el editor de ADR-012, un textarea con la vista previa al lado. Su interfaz es solo `value` y `valueChange`, para poder cambiarlo por un WYSIWYG sin tocar el formulario.

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

Hoy están `alert-dialog`, `badge`, `button`, `card`, `empty`, `field`, `input`, `label`, `separator`, `table`, `textarea` y `utils`. `native-select`, `spinner` y `tabs` importan `@ng-icons/*`, que no es dependencia del admin; por eso el filtro de estado es un `<select>` nativo.

El admin no usa `provideSpartanHlm()`. Solo cambia el default de los overlays del CDK (`usePopover: false`) para que convivan con `<hlm-toaster>`, que el admin no tiene, y como importa `@angular/cdk/overlay` desde `app.config`, metería el overlay entero del CDK (unos 46 kB) en el bundle inicial. Tampoco sirve en las `providers` de una ruta: el CDK lo lee del injector raíz. Sin él, los diálogos se muestran en el top layer del navegador (`popover`). Si algún día entra `<hlm-toaster>`, hay que volver a ponerlo en `app.config` y aceptar ese tamaño.


## Colección de Bruno

La colección está en `docs/api/bruno/`, en formato OpenCollection (YAML):

- `generated/`: una petición por operación del contrato. `make generate` la regenera desde `docs/api/openapi.yaml` con el CLI de Bruno; no se edita a mano.
- `flows/`: flujos escritos a mano, con aserciones:
  - `flows/posts/` recorre el ciclo de vida de un post: login, crear borrador, editar, publicar, verlo en la API pública, intentar cambiar el slug ya publicado (409), archivar y comprobar que ya no aparece. Cada corrida crea un post nuevo con la hora en el título, que queda archivado en tu base.
  - `flows/sesion/` recorre login, `/me`, refresh, logout y `/me` sin sesión.
- `environments/local.yml`: `baseUrl` apunta a `http://localhost:8080`. `adminEmail` y `adminPassword` son variables secretas sin valor.

Para usarla desde la app de Bruno, que se instala aparte, abre la carpeta `docs/api/bruno`, elige el environment `local` y escribe el email y la contraseña en sus variables secretas. Bruno los guarda en tu equipo, fuera de los archivos del repo.

Desde la terminal, con la API levantada en otra:

```sh
make api-flows
```

Toma el email y la contraseña de `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` de `.env` y se los pasa al CLI como variables, sin escribirlos en ningún archivo. Deben ser los del administrador que existe en tu base.

Los flujos hacen unas 16 peticiones. Si los corres dos veces seguidas, la segunda puede chocar con el rate limit global de la API (429); espera un minuto.

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
