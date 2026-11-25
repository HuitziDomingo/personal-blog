# Variables de entorno

Lista completa de las variables de la API, la web, el admin y los workflows, con su propósito y de dónde sale cada una en producción. **Solo nombres: ningún valor secreto va en este archivo ni en el repo.**

`services/api/internal/config/variables_doc_test.go` comprueba que la tabla de la API y el código usen exactamente los mismos nombres: una variable nueva en el código sin fila aquí, o una fila que el código ya no lee, hace fallar `make api-test`.

**Origen en producción:**
- **SM**: Secret Manager, montado en Cloud Run con `--set-secrets` (`.github/workflows/deploy-api.yml`).
- **Archivo**: `services/api/deploy/production.env.yaml`, aplicado con `--env-vars-file`.
- **GitHub**: variable de Actions (no secreta) que el workflow agrega al archivo al desplegar.
- **Cloud Run** / **Vercel**: la pone la plataforma o el proyecto.
- **Defecto**: no se define; vale el valor por defecto del código.

## API (Cloud Run)

Las obligatorias que faltan se nombran todas juntas al arrancar (`missing required environment variables: …`), sin imprimir valores, y la API sale con código 1.

| Variable | Propósito | Obligatoria | Origen en producción |
|---|---|---|---|
| `PORT` | Puerto en el que escucha. | No (por defecto `8080`) | Cloud Run |
| `MONGO_URI` | Conexión a MongoDB (Atlas M0 en producción). | **Sí** | SM `mongo-uri` |
| `MONGO_DB_NAME` | Base de datos de la API. | **Sí** | Archivo |
| `JWT_SECRET` | Firma de los tokens de sesión y clave de los tokens de vista previa (HKDF). Mínimo 32 bytes. | **Sí** | SM `jwt-secret` |
| `ALLOWED_ORIGINS` | Orígenes exactos (`https://…`, sin `*`) que pueden cambiar estado con cookies; CORS y comprobación de `Origin`. | Sí en la práctica | Archivo |
| `MAX_BODY_BYTES` | Tamaño máximo del cuerpo de una petición JSON. | No (1 MiB) | Archivo |
| `TRUSTED_PROXIES` | Proxies cuya cabecera `X-Forwarded-For` se cree, para la IP del rate limit. | No (vacía) | Archivo (vacía hasta el paso 19 del runbook) |
| `GIN_MODE` | `release` en producción. | No | Archivo |
| `LOG_FORMAT` | `json` para Cloud Logging (`severity`, `message`, `httpRequest`). | No (`text`) | Archivo |
| `INITIAL_ADMIN_EMAIL` | Crea el primer admin si no hay usuarios. | No | `gcloud run services update`, solo la primera vez |
| `INITIAL_ADMIN_PASSWORD` | Contraseña de ese primer admin. | No | SM `initial-admin-password`, solo la primera vez; se borra después |
| `RATE_LIMIT_GLOBAL_PER_MINUTE`, `RATE_LIMIT_GLOBAL_BURST` | Límite por IP de todas las rutas (ADR-010). | No (60/min, ráfaga 20) | Defecto |
| `RATE_LIMIT_LOGIN_PER_MINUTE`, `RATE_LIMIT_LOGIN_BURST` | Límite por IP del login. | No (5/min, 5) | Defecto |
| `RATE_LIMIT_REFRESH_PER_MINUTE`, `RATE_LIMIT_REFRESH_BURST` | Límite por IP del refresh. | No (10/min, 10) | Defecto |
| `RATE_LIMIT_PREFLIGHT_PER_MINUTE`, `RATE_LIMIT_PREFLIGHT_BURST` | Límite por IP de los `OPTIONS` de CORS. | No (120/min, 60) | Defecto |
| `RATE_LIMIT_USER_PER_MINUTE`, `RATE_LIMIT_USER_BURST` | Límite por usuario autenticado (ADR-016). | No (300/min, 100) | Defecto |
| `RATE_LIMIT_ASSISTANT_PER_MINUTE`, `RATE_LIMIT_ASSISTANT_BURST` | Límite del asistente de escritura (ADR-021). | No (5/min, 5) | Defecto |
| `RATE_LIMIT_IMAGES_PER_MINUTE`, `RATE_LIMIT_IMAGES_BURST` | Límite de generación de portadas (ADR-026). | No (2/min, 2) | Defecto |
| `RATE_LIMIT_IMAGES_PER_DAY` | Tope diario de portadas generadas por usuario. | No (20) | Defecto |
| `RATE_LIMIT_CV_UPLOADS_MAX`, `RATE_LIMIT_CV_UPLOADS_WINDOW_MINUTES` | Subidas del CV por usuario en la ventana (ADR-028). | No (10 cada 60 min) | Defecto |
| `ASSISTANT_ENABLED` | Enciende el asistente de escritura del admin. | No (`false`) | Archivo (`true`, ADR-025 punto 10) |
| `GEMINI_API_KEY` | Clave de Gemini, de un proyecto sin facturación (ADR-021). | Con el asistente, la moderación o el RAG | SM `gemini-api-key` |
| `GEMINI_MODEL` | Modelo del asistente. | Con el asistente | GitHub `GEMINI_MODEL` |
| `ASSISTANT_TIMEOUT_SECONDS` | Tope de una llamada del asistente. | No (30) | Archivo |
| `ASSISTANT_THINKING_LEVEL` | `minimal`, `low`, `medium` o `high`. | No (`low`) | Archivo |
| `ASSISTANT_MAX_OUTPUT_TOKENS` | Tope de tokens de respuesta del asistente. | No (16384) | Archivo |
| `COMMENTS_ENABLED` | Enciende los comentarios públicos (ADR-022). Debe coincidir con la web. | No (`false`) | Archivo (`false` al lanzar) |
| `COMMENTS_RATE_LIMIT_MAX`, `COMMENTS_RATE_LIMIT_WINDOW_MINUTES` | Comentarios por IP en la ventana. | No (3 cada 10 min) | Defecto |
| `COMMENTS_MODERATION_ENABLED` | Moderación con Gemini de los comentarios. | No (`false`) | Archivo (`false` al lanzar) |
| `COMMENTS_MODERATION_MODEL` | Modelo de la moderación. | No (`gemini-3.6-flash`) | Defecto |
| `COMMENTS_MODERATION_TIMEOUT_SECONDS` | Tope de una moderación. | No (10) | Defecto |
| `COMMENTS_MODERATION_MAX_OUTPUT_TOKENS` | Tope de tokens de la moderación. | No (512) | Defecto |
| `RAG_ENABLED` | Enciende el RAG del asistente (ADR-027). Necesita el asistente. | No (`false`) | Archivo (`false` al lanzar) |
| `RAG_EMBEDDING_MODEL` | Modelo de embeddings. | No (`gemini-embedding-2`) | Defecto |
| `RAG_MIN_SCORE` | Similitud coseno mínima de un fragmento para usarlo como contexto. | No (0,55) | Defecto (revisar con `make api-rag-eval`) |
| `RAG_CHUNK_MAX_CHARS` | Tamaño máximo de un fragmento al indexar. | No (800) | Defecto |
| `RAG_TIMEOUT_SECONDS` | Tope de la búsqueda de contexto. | No (10) | Defecto |
| `RAG_INDEX_TIMEOUT_SECONDS` | Tope de indexar un post al publicarlo. | No (30) | Defecto |
| `RAG_REINDEX_TIMEOUT_SECONDS` | Tope del reindexado completo. | No (120) | Defecto |
| `FILES_STORE` | Almacén de portadas y CV: vacío (subir responde 503), `local` (desarrollo) o `gcs`. | No | Archivo (`gcs`) |
| `FILES_GCS_BUCKET` | Bucket público de portadas (`covers/`) y CV (`cv/`). | Con `FILES_STORE=gcs` | GitHub `FILES_GCS_BUCKET` |
| `FILES_GCS_PUBLIC_URL` | Origen público del bucket, `https`. | No (`https://storage.googleapis.com`) | Defecto |
| `FILES_LOCAL_DIR`, `FILES_LOCAL_BASE_URL` | Directorio y URL base de `FILES_STORE=local`. | Con `FILES_STORE=local` | Nunca en producción |
| `IMAGES_ENABLED` | Generación de portadas con Workers AI (ADR-026). Necesita el asistente y un almacén. | No (`false`) | Archivo (`false` al lanzar) |
| `IMAGES_TIMEOUT_SECONDS` | Tope de una generación. | No (30) | Defecto |
| `CLOUDFLARE_ACCOUNT_ID` | Cuenta de Cloudflare de Workers AI (no es secreta). | Con `IMAGES_ENABLED=true` | Archivo, al encenderlas |
| `CLOUDFLARE_AI_TOKEN` | Token de Workers AI, solo de lectura de AI. | Con `IMAGES_ENABLED=true` | SM `cloudflare-ai-token`, al encenderlas |

## Web (Vercel, proyecto `apps/web`)

Ninguna variable de la web es secreta ni se expone al navegador: no hay `NEXT_PUBLIC_*`.

| Variable | Propósito | Obligatoria | Valor en producción |
|---|---|---|---|
| `API_BASE_URL` | Origen de la API para leer posts, CV y comentarios. | **Sí** (sin ella el build falla) | `https://api.huitzi.xyz` |
| `SITE_URL` | URL pública del sitio: canonical, sitemap, RSS y links internos. | No (`https://huitzi.xyz`) | `https://huitzi.xyz` |
| `COMMENTS_ENABLED` | Muestra los comentarios. Igual que en la API. | No (`false`) | `false` al lanzar |
| `COVER_IMAGES_BASE_URL` | Prefijo permitido de las portadas generadas (`images.remotePatterns`). | Con portadas con IA | `https://storage.googleapis.com/<FILES_BUCKET>/covers/` |
| `WEB_PRERENDER_LIMIT` | Posts que se generan en el build (ADR-020). | No (10) | sin definir |
| `WEB_SKIP_API` | Build sin API, **solo para el CI**. | No | **Nunca** en Vercel (el build falla a propósito) |
| `VERCEL`, `VERCEL_ENV`, `NODE_ENV`, `NEXT_PHASE` | Plataforma y Next. | — | las pone la plataforma |

## Admin (Vercel, proyecto `apps/admin`)

El admin no lee variables de Vercel: la URL de la API está en `apps/admin/angular.json` (configuración `production`, `ADMIN_API_BASE_URL = 'https://api.huitzi.xyz'`) y `scripts/check-api-base-url.mjs` exige que coincida con el `connect-src` de `apps/admin/vercel.json`. Cambiarla es un PR.

## Workflows (variables de GitHub Actions)

Ningún workflow usa *Secrets* de GitHub: todas son *Variables* y ninguna es secreta.

| Variable | Workflow | Valor |
|---|---|---|
| `GCP_PROJECT_ID` | deploy-api, backup-mongo | `<PROJECT_ID>` |
| `GCP_WIF_PROVIDER` | deploy-api, backup-mongo | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/personal-blog` |
| `GCP_DEPLOY_SA` | deploy-api | `api-deploy@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SA` | deploy-api | `api-runtime@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_ARTIFACT_REPO` | deploy-api | `api` |
| `CLOUD_RUN_SERVICE` | deploy-api | `api` |
| `GEMINI_MODEL` | deploy-api | modelo del asistente |
| `FILES_GCS_BUCKET` | deploy-api | `<FILES_BUCKET>` |
| `GCP_BACKUP_SA` | backup-mongo | `mongo-backup@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_BACKUP_BUCKET` | backup-mongo | `<BACKUP_BUCKET>` |

## Secretos (Secret Manager)

| Secreto | Variable | Quién lo lee |
|---|---|---|
| `mongo-uri` | `MONGO_URI` | `api-runtime`; `mongo-backup` (respaldo) |
| `jwt-secret` | `JWT_SECRET` | `api-runtime` |
| `gemini-api-key` | `GEMINI_API_KEY` | `api-runtime` |
| `initial-admin-password` | `INITIAL_ADMIN_PASSWORD` | `api-runtime`, solo el primer arranque |
| `cloudflare-ai-token` | `CLOUDFLARE_AI_TOKEN` | `api-runtime`, al encender las portadas |
