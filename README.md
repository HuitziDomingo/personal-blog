# personal-blog

CMS y blog técnico sobre orquestación de agentes de IA para `huitzi.xyz`.

## Estructura

Monorepo según el [ADR-001](docs/adr/001-stack-y-monorepo.md):

```text
personal-blog/
├── apps/
│   ├── admin/          # Dashboard: Angular + Spartan UI + Tailwind CSS
│   └── web/            # Sitio público: Next.js + Chakra UI (portafolio y blog)
├── packages/
│   ├── api-types/      # Tipos TypeScript generados del contrato
│   └── markdown/       # Render y sanitización de Markdown (admin y web)
├── e2e/                # E2E con Playwright del flujo crítico (make e2e)
├── services/
│   └── api/            # API: Go + Gin + MongoDB
├── docs/
│   ├── adr/            # Decisiones de arquitectura
│   ├── api/            # Contrato OpenAPI y colección de Bruno
│   ├── development.md  # Guía de desarrollo
│   ├── web/            # Posts de la web anterior, listos para el admin
│   └── roadmap.md      # Backlog
├── scripts/            # Scripts de generación
├── docker-compose.yml  # MongoDB local
└── Makefile            # Comandos del proyecto
```

`apps/web` es el sitio público (portafolio y blog) en Next.js para Vercel ([ADR-017](docs/adr/017-arquitectura-de-la-web-publica-nextjs.md)), todavía sin desplegar.

## Estado

- **API:** autenticación con cookies `HttpOnly` (login, refresh, logout y `/auth/me`), línea base de seguridad de ADR-010, y CRUD de posts: API pública de posts publicados y endpoints de admin para crear, editar, publicar y archivar. Además, un servidor MCP de solo lectura por stdio (ADR-019), sin conectar a ningún cliente, y el backend del asistente de escritura con Gemini (ADR-021): mejorar la redacción y sugerir metadatos, apagado por defecto (`ASSISTANT_ENABLED`). También el backend de comentarios (ADR-022): envío anónimo con premoderación, lectura pública de los aprobados y la cola del admin, apagado por defecto (`COMMENTS_ENABLED`), con moderación con LLM opcional (`COMMENTS_MODERATION_ENABLED`): Gemini sugiere y el autor decide.
- **Admin:** proyecto Angular con sesión, guard de rutas e interceptores de credenciales y refresh, lista de posts en `/posts` con filtro por estado, paginación y archivar, editor de posts WYSIWYG con Milkdown (`/posts/new` y `/posts/:id`) que guarda Markdown, con vista previa sanitizada, y layout con menú lateral u offcanvas, tema claro, oscuro o del sistema y color de acento. El editor tiene el panel «Asistente», conectado a la API del asistente y visible solo en development (`ADMIN_ASSISTANT_ENABLED`).
- **E2E:** Playwright con el flujo crítico de ADR-006 (login, borrador, edición, publicación, API pública y archivo), la contraseña incorrecta y el logout, con `make e2e` contra el stack local en una base temporal. Todavía no corre en el CI.
- **Web:** Next.js con TypeScript estricto (ADR-017): portafolio con el contenido de la web anterior (inicio, trabajos) y blog con ISR de 60 s, cada post con su Markdown sanitizado en el servidor; modo claro, oscuro y sistema; SEO (canónicas, Open Graph, sitemap, robots y RSS); CSP y cabeceras, y job `web` en el CI. Sin desplegar todavía.
- **Despliegue:** pendiente; nada está en producción.

El detalle de cada tarea está en el [roadmap](docs/roadmap.md).

## Arranque rápido

Resumen para levantar todo en local. El detalle (variables, comandos, tests y troubleshooting) está en [docs/development.md](docs/development.md).

### Prerrequisitos

Node.js 24 (`.nvmrc`), pnpm 10 con `corepack`, Go 1.27 y Docker con Compose v2. Las versiones exactas están en [Prerrequisitos](docs/development.md#prerrequisitos).

### Primer arranque

```sh
nvm use
corepack enable
pnpm install
cp .env.example .env
openssl rand -base64 32   # pega el resultado en JWT_SECRET, entre comillas simples
```

En `.env`:

- `JWT_SECRET` es obligatorio (al menos 32 bytes); sin él, la API no arranca.
- `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` crean el administrador inicial la primera vez que arranca la API con la colección `users` vacía. La contraseña va de 12 caracteres a 72 bytes; si lleva `$`, `#` o espacios, entre comillas simples.

`.env` nunca se sube a git. Ver [Primer arranque](docs/development.md#primer-arranque) y [Variables de la API](docs/development.md#variables-de-la-api).

### Levantar todo

Una terminal por servicio, desde la raíz del repo:

| Terminal | Comando | Qué levanta |
| --- | --- | --- |
| 1 | `make db-up` | MongoDB en Docker (sale al terminar; `make db-down` lo para) |
| 2 | `make api-watch` | API en `http://localhost:8080`, con recarga al guardar |
| 3 | `make admin-dev` | Admin en `http://localhost:4200` |
| 4 | `make web-dev` | Web en `http://localhost:3000` |
| 5 | `make api-docs` | Contrato OpenAPI (Swagger UI) en `http://localhost:8081` |

Comprueba la API con `curl localhost:8080/ready` (`{"status":"ready"}`). Entra al admin con el administrador inicial. Todos los comandos: [Comandos del Makefile](docs/development.md#comandos-del-makefile).

### Asistente de escritura (opcional)

Está apagado por defecto ([ADR-021](docs/adr/021-asistente-de-escritura-con-ia-v1.md)). Para encenderlo en `.env`:

- `ASSISTANT_ENABLED=true`
- `GEMINI_API_KEY`: una key de un proyecto de Google **sin facturación** (plan gratuito). Nunca se sube a git.
- `GEMINI_MODEL`: un modelo incluido en el plan gratuito.

Con `ASSISTANT_ENABLED=true` y sin key o sin modelo, la API no arranca. Un cambio en `.env` exige parar y relanzar la API. Con el asistente apagado, el panel «Asistente» del editor (en `make admin-dev`) responde «El asistente está desactivado en la API».

Para ver qué modelos puede usar tu key, exporta la key en tu terminal sin escribirla en el comando (por ejemplo con `read -s GEMINI_API_KEY && export GEMINI_API_KEY`) y lista los que admiten `generateContent`:

```sh
curl -s -H "x-goog-api-key: $GEMINI_API_KEY" \
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000" \
  | jq -r '.models[] | select(.supportedGenerationMethods | index("generateContent")) | .name'
```

Para probar uno:

```sh
m=nombre-del-modelo   # uno de la lista, sin el prefijo models/
curl -s -H "x-goog-api-key: $GEMINI_API_KEY" -H 'Content-Type: application/json' \
  "https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent" \
  -d '{"contents":[{"parts":[{"text":"Hola"}]}]}'
```

En zsh usa `${m}` con llaves: sin ellas, zsh lee los dos puntos de `$m:generateContent` como un modificador de la variable y rompe la URL. Un 429 significa que el modelo no tiene cuota gratuita o que ya la gastaste. Más en [Asistente de escritura](docs/development.md#asistente-de-escritura).

### Colección de Bruno

En la app de Bruno: **Open Collection**, elige la carpeta `docs/api/bruno` (no la raíz del repo) y el environment **local**. Escribe `adminEmail` y `adminPassword` en sus variables secretas; Bruno las guarda en tu equipo, fuera del repo. Ejecuta primero el login: las demás peticiones usan su cookie.

Desde la terminal, con la API levantada:

```sh
make api-flows
```

Corre los flujos con el administrador de `.env`. Solo con el asistente **apagado** (`ASSISTANT_ENABLED=false`): el flujo `asistente` espera un 503 y falla a propósito con el asistente encendido, para no gastar cuota de Gemini. Ver [Colección de Bruno](docs/development.md#colección-de-bruno).

## Decisiones

Las decisiones de arquitectura están en [docs/adr](docs/adr/).
