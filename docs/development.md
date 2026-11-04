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
├── apps/                 # Pendiente: web (Next.js) y admin (Angular)
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
| `make admin-dev` | Levanta el admin en `http://localhost:4200` |
| `make admin-lint` | Corre ESLint con angular-eslint en el admin |
| `make admin-test` | Corre los tests del admin |
| `make admin-build` | Build de producción del admin |
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

`apps/web` todavía no existe.

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

El admin llama a la API en `http://localhost:8080`, otro origen, como en producción. `ALLOWED_ORIGINS` de `.env` debe incluir `http://localhost:4200`; ya viene así en `.env.example`.

Estructura de `src/app/`:

- `core/`: configuración, sesión, interceptores y guards.
  - `session/session.service.ts`: estado de la sesión con signals. Como la cookie es `HttpOnly`, la sesión se conoce preguntando a `GET /api/v1/auth/me`, una sola vez, en la primera navegación.
  - `http/credentials.interceptor.ts`: agrega `withCredentials` solo a las peticiones al origen de `API_BASE_URL`.
  - `http/refresh.interceptor.ts` y `session/session-refresher.ts`: ante un 401 de la API hacen un solo `POST /auth/refresh` compartido y reintentan. No actúan sobre `/auth/login` ni `/auth/refresh`. Si el refresh falla, limpian la sesión y van a `/login?returnUrl=…`.
  - `session/session.guards.ts`: `authGuard` para las rutas protegidas y `guestGuard` para `/login`.
  - `http/problem-messages.ts`: traduce los errores de la API al español, incluido el tiempo de `Retry-After` en un 429.
- `features/`: una carpeta por pantalla, con carga diferida por ruta.
- `shared/ui/`: componentes helm de Spartan, copiados al repo, y componentes propios.

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


## Colección de Bruno

La colección está en `docs/api/bruno/`, en formato OpenCollection (YAML):

- `generated/`: una petición por operación del contrato. `make generate` la regenera desde `docs/api/openapi.yaml` con el CLI de Bruno; no se edita a mano.
- `flows/`: flujos escritos a mano, con aserciones. `flows/sesion/` recorre login, `/me`, refresh, logout y `/me` sin sesión.
- `environments/local.yml`: `baseUrl` apunta a `http://localhost:8080`. `adminEmail` y `adminPassword` son variables secretas sin valor.

Para usarla desde la app de Bruno, que se instala aparte, abre la carpeta `docs/api/bruno`, elige el environment `local` y escribe el email y la contraseña en sus variables secretas. Bruno los guarda en tu equipo, fuera de los archivos del repo.

Desde la terminal, con la API levantada en otra:

```sh
make api-flows
```

Toma el email y la contraseña de `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` de `.env` y se los pasa al CLI como variables, sin escribirlos en ningún archivo. Deben ser los del administrador que existe en tu base.

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
