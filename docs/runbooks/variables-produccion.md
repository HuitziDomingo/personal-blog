# Variables de entorno de producción

Cruzadas con `.env.example`, `services/api/internal/config/config.go`, `apps/web/lib/config.ts`, `apps/admin/angular.json` y los workflows. Ningún valor de esta tabla es secreto; los secretos solo se nombran.

**Origen:**
- **SM**: Secret Manager, montado en Cloud Run con `--set-secrets` (`deploy-api.yml`).
- **Archivo**: `services/api/deploy/production.env.yaml`, aplicado con `--env-vars-file`.
- **Cloud Run**: la pone la plataforma.
- **Vercel**: variables del proyecto, entorno *Production*.
- **GitHub**: variable de Actions (no secreta).

## API (Cloud Run)

| Variable | Origen | Obligatoria | Valor en producción |
|---|---|---|---|
| `PORT` | Cloud Run | Sí (la pone Cloud Run) | `8080` |
| `MONGO_URI` | SM `mongo-uri` | Sí | `mongodb+srv://blog-api:…@…` (secreto) |
| `MONGO_DB_NAME` | Archivo | Sí | `personal_blog` |
| `JWT_SECRET` | SM `jwt-secret` | Sí (≥ 32 bytes) | secreto |
| `ALLOWED_ORIGINS` | Archivo | Sí en la práctica (vacía, ningún navegador cambia estado) | `https://huitzi.xyz,https://admin.huitzi.xyz` |
| `MAX_BODY_BYTES` | Archivo | No (por defecto 1 MiB) | `1048576` |
| `TRUSTED_PROXIES` | Archivo | No | vacía hasta verificar el primer despliegue (runbook, paso 18) |
| `GIN_MODE` | Archivo | No | `release` |
| `LOG_FORMAT` | Archivo | No | `json` |
| `INITIAL_ADMIN_EMAIL` | `gcloud run services update`, solo la primera vez | No | `<ADMIN_EMAIL>` |
| `INITIAL_ADMIN_PASSWORD` | SM `initial-admin-password`, solo la primera vez | No | secreto; se borra después (runbook, paso 11) |
| `RATE_LIMIT_{GLOBAL,LOGIN,REFRESH,PREFLIGHT,USER,ASSISTANT}_{PER_MINUTE,BURST}` | — | No | Sin definir: los valores por defecto de ADR-010, ADR-016 y ADR-021 |
| `ASSISTANT_ENABLED` | Archivo | No | `true` (ADR-025, punto 10) |
| `GEMINI_API_KEY` | SM `gemini-api-key` | Con el asistente o la moderación encendidos | secreto, de un proyecto sin facturación |
| `GEMINI_MODEL` | GitHub `GEMINI_MODEL`, agregada al archivo por el workflow | Con el asistente encendido | modelo del plan gratuito |
| `ASSISTANT_TIMEOUT_SECONDS` | Archivo | No | `30` |
| `ASSISTANT_THINKING_LEVEL` | Archivo | No | `low` |
| `ASSISTANT_MAX_OUTPUT_TOKENS` | Archivo | No | `16384` |
| `COMMENTS_ENABLED` | Archivo | No | `false` al lanzar (debe coincidir con la web) |
| `COMMENTS_RATE_LIMIT_MAX`, `COMMENTS_RATE_LIMIT_WINDOW_MINUTES` | — | No | por defecto (3 cada 10 min) |
| `COMMENTS_MODERATION_ENABLED` | Archivo | No | `false` al lanzar |
| `COMMENTS_MODERATION_MODEL`, `COMMENTS_MODERATION_TIMEOUT_SECONDS`, `COMMENTS_MODERATION_MAX_OUTPUT_TOKENS` | — | No | por defecto (`gemini-3.6-flash`, 10, 512) |

### Pendientes de merge

Al mergear cada PR, agrega sus variables a `production.env.yaml` (y los secretos a `--set-secrets` en `deploy-api.yml`). Todas nacen apagadas.

| Variable | PR | Origen | Valor al lanzar |
|---|---|---|---|
| `RAG_ENABLED` | #144 (BLOG-132) | Archivo | `false` (ADR-025, punto 10) |
| `RAG_EMBEDDING_MODEL`, `RAG_MIN_SCORE`, `RAG_CHUNK_MAX_CHARS`, `RAG_TIMEOUT_SECONDS`, `RAG_INDEX_TIMEOUT_SECONDS`, `RAG_REINDEX_TIMEOUT_SECONDS` | #144 | Archivo o por defecto | por defecto; `RAG_MIN_SCORE` según `make api-rag-eval` |
| `FILES_STORE` | #143 (BLOG-137) y el PR del adaptador de GCS | Archivo | `gcs` cuando exista el adaptador |
| Bucket de `FILES_*` (nombre exacto según el PR del adaptador de GCS) | PR del adaptador de GCS | Archivo | `<FILES_BUCKET>` |
| `FILES_LOCAL_DIR`, `FILES_LOCAL_BASE_URL` | #143 | — | solo desarrollo, sin definir |
| `RATE_LIMIT_CV_UPLOADS_MAX`, `RATE_LIMIT_CV_UPLOADS_WINDOW_MINUTES` | #143 | — | por defecto |
| `IMAGES_ENABLED` | #128 (BLOG-112) | Archivo | `false` (ADR-025, punto 10) |
| `CLOUDFLARE_ACCOUNT_ID` | #128 | Archivo | `<CLOUDFLARE_ACCOUNT_ID>` (no es secreto) |
| `CLOUDFLARE_AI_TOKEN` | #128 | SM `cloudflare-ai-token` | secreto (BLOG-114) |
| `IMAGES_TIMEOUT_SECONDS`, `RATE_LIMIT_IMAGES_{PER_MINUTE,BURST,PER_DAY}` | #128 | — | por defecto |
| `IMAGES_STORE`, `IMAGES_GCS_BUCKET`, `IMAGES_LOCAL_*` | #128 | — | se reemplazan por `FILES_*` (decisión de León) |

## Web (Vercel, proyecto `apps/web`)

| Variable | Origen | Obligatoria | Valor en producción |
|---|---|---|---|
| `API_BASE_URL` | Vercel | Sí (sin ella el build falla) | `https://api.huitzi.xyz` |
| `SITE_URL` | Vercel | No (por defecto `https://huitzi.xyz`) | `https://huitzi.xyz` |
| `COMMENTS_ENABLED` | Vercel | No | `false` al lanzar; igual que en la API |
| `WEB_PRERENDER_LIMIT` | Vercel | No | sin definir (10, ADR-020) |
| `WEB_SKIP_API` | — | No | **nunca** en Vercel (el build falla a propósito) |
| `VERCEL`, `VERCEL_ENV`, `NODE_ENV`, `NEXT_PHASE` | Vercel y Next | — | las pone la plataforma |

## Admin (Vercel, proyecto `apps/admin`)

| Variable | Origen | Valor |
|---|---|---|
| `ADMIN_API_BASE_URL` | `apps/admin/angular.json` (configuración `production`), no Vercel | `'https://api.huitzi.xyz'`; `scripts/check-api-base-url.mjs` exige que coincida con el `connect-src` de `vercel.json` |

El admin no lee variables de Vercel: cambiar la URL de la API es un PR.

## Workflows (variables de GitHub Actions)

| Variable | Workflow | Valor |
|---|---|---|
| `GCP_PROJECT_ID` | deploy-api, backup-mongo | `<PROJECT_ID>` |
| `GCP_WIF_PROVIDER` | deploy-api, backup-mongo | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/personal-blog` |
| `GCP_DEPLOY_SA` | deploy-api | `api-deploy@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SA` | deploy-api | `api-runtime@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_ARTIFACT_REPO` | deploy-api | `api` |
| `CLOUD_RUN_SERVICE` | deploy-api | `api` |
| `GEMINI_MODEL` | deploy-api | modelo del asistente |
| `GCP_BACKUP_SA` | backup-mongo | `mongo-backup@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_BACKUP_BUCKET` | backup-mongo | `<BACKUP_BUCKET>` |

Ningún workflow usa *Secrets* de GitHub.
