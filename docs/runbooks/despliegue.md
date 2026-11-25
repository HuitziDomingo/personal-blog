# Runbook: despliegue a producción (ADR-025 y ADR-030)

Pasos manuales que hace León, en orden. Ningún agente ejecuta nada de esto (ADR-025, punto 14). Los comandos usan placeholders entre `<>`; ninguno lleva valores secretos. Los secretos se escriben siempre por la entrada estándar (`read -rs`), nunca en la línea de comandos, para que no queden en el historial de la shell. Ver también «Cómo cargar un secreto sin que se cuele otra cosa» en el paso 7.

Variables de entorno de cada app, con su propósito y origen: [docs/deploy/variables.md](../deploy/variables.md).

## Placeholders

| Placeholder | Qué es | De dónde sale |
|---|---|---|
| `<PROJECT_ID>` | Proyecto de GCP de la API | Lo eliges en el paso 1 (por ejemplo `huitzi-blog-prod`) |
| `<PROJECT_NUMBER>` | Número del proyecto | `gcloud projects describe <PROJECT_ID> --format='value(projectNumber)'` |
| `<BILLING_ACCOUNT_ID>` | Cuenta de facturación | `gcloud billing accounts list` |
| `<GITHUB_REPO_ID>` | Id numérico del repo en GitHub (no cambia si se renombra) | `gh api repos/HuitziDomingo/personal-blog --jq .id` (hoy `1441416732`) |
| `<GITHUB_OWNER_ID>` | Id numérico del dueño del repo en GitHub | `gh api users/HuitziDomingo --jq .id` (hoy `42973573`) |
| `<FILES_BUCKET>` | Bucket público de portadas y CV (`FILES_GCS_BUCKET`) | Lo eliges en el paso 8 (único en todo GCS) |
| `<BACKUP_BUCKET>` | Bucket privado de respaldos | Lo eliges en el paso 8 |
| `<ADMIN_EMAIL>` | Email del administrador inicial | Tuyo |

Región: `us-central1` en todo (ADR-025, punto 2: el mapeo de dominio solo existe en algunas regiones).

```sh
export PROJECT_ID=<PROJECT_ID>
export REGION=us-central1
gcloud config set project "$PROJECT_ID"
```

## 1. Proyecto y facturación

```sh
gcloud projects create "$PROJECT_ID" --name="personal-blog"
gcloud billing projects link "$PROJECT_ID" --billing-account=<BILLING_ACCOUNT_ID>
```

El proyecto de la API tiene facturación (Cloud Run la exige). La clave de Gemini se crea en **otro** proyecto, sin facturación (ADR-021 y ADR-025, punto 9).

## 2. APIs

```sh
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  storage.googleapis.com \
  monitoring.googleapis.com \
  billingbudgets.googleapis.com \
  cloudscheduler.googleapis.com
```

## 3. Presupuesto (unos 5 USD al mes)

Primero, para que el tope exista antes de gastar nada (ADR-025, punto 3). El presupuesto **solo avisa**; el tope real es `max-instances=1`.

El monto va en la **moneda de la cuenta de facturación**; otra moneda da error. Para ver cuál es:

```sh
gcloud billing accounts describe <BILLING_ACCOUNT_ID> --format='value(currencyCode)'
```

Con una cuenta en pesos mexicanos, 100 MXN son unos 5 USD. `--filter-projects` pide el **número** del proyecto, no su id:

```sh
gcloud billing budgets create \
  --billing-account=<BILLING_ACCOUNT_ID> \
  --display-name="personal-blog" \
  --budget-amount=100MXN \
  --filter-projects="projects/<PROJECT_NUMBER>" \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0
```

Los avisos llegan a los administradores de la cuenta de facturación por email.

## 4. Cuentas de servicio

Tres, cada una con lo mínimo (ADR-025, punto 7):

```sh
gcloud iam service-accounts create api-deploy  --display-name="Deploy de la API (GitHub Actions)"
gcloud iam service-accounts create api-runtime --display-name="Ejecución de la API (Cloud Run)"
gcloud iam service-accounts create mongo-backup --display-name="Respaldo de Mongo (Cloud Run Job)"

export DEPLOY_SA="api-deploy@$PROJECT_ID.iam.gserviceaccount.com"
export RUNTIME_SA="api-runtime@$PROJECT_ID.iam.gserviceaccount.com"
export BACKUP_SA="mongo-backup@$PROJECT_ID.iam.gserviceaccount.com"
```

| Cuenta | Roles | Dónde |
|---|---|---|
| `api-deploy` | `roles/run.developer` | Proyecto (crea y actualiza el servicio; no puede cambiar su IAM) |
| | `roles/artifactregistry.writer` | Solo el repositorio `api` (paso 6) |
| | `roles/iam.serviceAccountUser` | Solo sobre `api-runtime` y `mongo-backup` (para desplegar el servicio y el job con ellas) |
| `api-runtime` | `roles/secretmanager.secretAccessor` | Solo cada secreto que usa (paso 7) |
| | `roles/storage.objectUser` | Solo `<FILES_BUCKET>` (paso 8) |
| `mongo-backup` | `roles/secretmanager.secretAccessor` | Solo `mongo-uri` |
| | `roles/storage.objectCreator` | Solo `<BACKUP_BUCKET>`: crea respaldos, no puede leerlos ni borrarlos |
| | `roles/run.invoker` | Solo el job `mongo-backup` (paso 18): Cloud Scheduler lo ejecuta con esta cuenta |

`api-deploy` no tiene acceso a ningún secreto. `--set-secrets` solo guarda la referencia; quien lee el valor es `api-runtime` al arrancar.

```sh
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/run.developer --condition=None

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser

gcloud iam service-accounts add-iam-policy-binding "$BACKUP_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser
```

Los demás bindings van en los pasos 6, 7 y 8, sobre cada recurso.

## 5. Workload Identity Federation

GitHub Actions cambia su token de OIDC por credenciales de corta duración. No hay llaves JSON.

```sh
gcloud iam workload-identity-pools create github \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc personal-blog \
  --location=global \
  --workload-identity-pool=github \
  --display-name="personal-blog" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository_id=='<GITHUB_REPO_ID>' && assertion.ref=='refs/heads/main'"
```

La condición deja pasar solo tokens de este repo (por id, que no cambia aunque se renombre) y de `main`. La cuenta de despliegue, además, acepta un solo `subject`, el del environment `production` de GitHub. El respaldo ya no usa WIF: es un Cloud Run Job con su propia cuenta (ADR-030).

**El `subject` es inmutable.** Este repo usa el formato de *immutable subject* de GitHub: el `sub` del token lleva el id del dueño y el del repo además de sus nombres, `repo:<dueño>@<GITHUB_OWNER_ID>/<repo>@<GITHUB_REPO_ID>:environment:<environment>`, no `repo:HuitziDomingo/personal-blog:environment:production`. Con el formato viejo el binding no coincide y la autenticación del workflow falla. Para ver qué formato usa el repo:

```sh
gh api repos/HuitziDomingo/personal-blog/actions/oidc/customization/sub
```

La respuesta describe la plantilla del `sub` del repo. Con el formato inmutable, el `sub` del environment `production` es el de abajo; los dos ids salen de la tabla de placeholders.

```sh
export POOL="projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/$POOL/subject/repo:HuitziDomingo@42973573/personal-blog@1441416732:environment:production"
```

Nombre completo del provider (va en la variable de GitHub `GCP_WIF_PROVIDER`):

```sh
gcloud iam workload-identity-pools providers describe personal-blog \
  --location=global --workload-identity-pool=github --format='value(name)'
```

## 6. Artifact Registry

```sh
gcloud artifacts repositories create api \
  --repository-format=docker --location="$REGION" \
  --description="Imágenes de la API"

gcloud artifacts repositories add-iam-policy-binding api \
  --location="$REGION" --member="serviceAccount:$DEPLOY_SA" --role=roles/artifactregistry.writer
```

Política de limpieza: conserva las 5 imágenes más recientes y borra las de más de 30 días que no estén entre ellas. Guárdala en un archivo fuera del repo, `cleanup.json`:

```json
[
  { "name": "keep-recent", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 5 } },
  { "name": "delete-old", "action": { "type": "Delete" }, "condition": { "olderThan": "30d" } }
]
```

```sh
gcloud artifacts repositories set-cleanup-policies api \
  --location="$REGION" --policy=cleanup.json --no-dry-run
```

## 7. Secret Manager

```sh
# JWT_SECRET: aleatorio, nunca pasa por la pantalla.
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create jwt-secret --replication-policy=automatic --data-file=-

# URI de Mongo (del paso 9). Pégala cuando la pida; no se ve ni queda en el historial.
read -rs MONGO_URI && printf '%s' "$MONGO_URI" | gcloud secrets create mongo-uri --replication-policy=automatic --data-file=- ; unset MONGO_URI

# Clave de Gemini, creada en el proyecto SIN facturación (ADR-021).
read -rs GEMINI_API_KEY && printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --replication-policy=automatic --data-file=- ; unset GEMINI_API_KEY
```

**Cómo cargar un secreto sin que se cuele otra cosa:**

- **No copies el comando al portapapeles** para pegar después el secreto. Si en algún paso usas `pbpaste` (por ejemplo `pbpaste | gcloud secrets create …`), lee lo que esté en el portapapeles en ese momento, que puede ser el propio comando. El secreto queda guardado con un valor equivocado y sin que se vea.
- **Lo más seguro es la consola:** *Secret Manager → Crear secreto* (o *Nueva versión*), pegando el valor en el campo.
- **Si el valor está en tu `.env`,** léelo del archivo sin mostrarlo, quitando las comillas simples y dobles con que `.env` lo guarda (no sirve si el secreto contiene comillas):

  ```sh
  grep '^GEMINI_API_KEY=' .env | cut -d= -f2- | tr -d "'\"" | tr -d '\n' \
    | gcloud secrets create gemini-api-key --replication-policy=automatic --data-file=-
  ```

- Comprueba el largo sin ver el valor: `gcloud secrets versions access latest --secret=<secreto> | wc -c`.

Accesos, uno por secreto:

```sh
for s in jwt-secret mongo-uri gemini-api-key; do
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
done
gcloud secrets add-iam-policy-binding mongo-uri --member="serviceAccount:$BACKUP_SA" --role=roles/secretmanager.secretAccessor
```

**Token de Cloudflare (portadas, ADR-026):** solo cuando se encienda `IMAGES_ENABLED`, con un token limitado a Workers AI (BLOG-114). Mismo patrón: `cloudflare-ai-token`, acceso solo para `api-runtime`, y agregar `CLOUDFLARE_AI_TOKEN=cloudflare-ai-token:latest` a `--set-secrets` en `deploy-api.yml`.

Para rotar un secreto: `gcloud secrets versions add <secreto> --data-file=-` y volver a desplegar (Cloud Run lee `latest` al arrancar cada instancia).

## 8. Buckets

**Archivos (portadas y CV):** una sola configuración `FILES_*` para los dos (decisión de León sobre #143 y #128). Lectura pública, como piden ADR-026 (punto 9) y ADR-028 (punto 6: el PDF se sirve desde el dominio del almacenamiento, no desde `huitzi.xyz`).

```sh
gcloud storage buckets create gs://<FILES_BUCKET> \
  --location="$REGION" --uniform-bucket-level-access

gcloud storage buckets add-iam-policy-binding gs://<FILES_BUCKET> \
  --member=allUsers --role=roles/storage.objectViewer
gcloud storage buckets add-iam-policy-binding gs://<FILES_BUCKET> \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/storage.objectUser
```

La API lo usa con `FILES_STORE=gcs` (ya en `services/api/deploy/production.env.yaml`) y `FILES_GCS_BUCKET=<FILES_BUCKET>`, que el workflow agrega desde la variable de GitHub `FILES_GCS_BUCKET` (paso 10). Sin esa variable el workflow no despliega. `FILES_GCS_PUBLIC_URL` se deja sin definir: las URLs públicas salen de `https://storage.googleapis.com`. La API se autentica con la cuenta `api-runtime` de Cloud Run (Application Default Credentials), sin llaves.

> **Pendiente de decisión de León (ADR-028, punto 6):** GCS **no envía `X-Content-Type-Options: nosniff`** en los objetos públicos, y no hay forma de agregar esa cabecera desde los metadatos del objeto. El `Content-Type: application/pdf` sí se fija al subir y el archivo se sirve desde `storage.googleapis.com`, aislado de `huitzi.xyz` y `admin.huitzi.xyz`, que es la defensa principal. Opciones: aceptar el riesgo y corregir ADR-028 con un ADR nuevo, o servir los archivos a través de algo que sí ponga la cabecera (la propia API o un balanceador; este último cuesta unos $18 USD al mes, ADR-025). Compruébalo tras el primer PDF: `curl -sSI https://storage.googleapis.com/<FILES_BUCKET>/cv/<archivo>.pdf`.

`--pap` y `--no-pap` (prevención de acceso público) ya no reciben valor: `--public-access-prevention=enforced` o `=inherited` dan error. El bucket público se crea sin la bandera, y el de respaldos con `--pap`.

**Respaldos:** privado, con borrado a los 90 días (ADR-025, punto 5). Archivo `lifecycle.json` fuera del repo:

```json
{ "rule": [ { "action": { "type": "Delete" }, "condition": { "age": 90 } } ] }
```

```sh
gcloud storage buckets create gs://<BACKUP_BUCKET> \
  --location="$REGION" --uniform-bucket-level-access --pap
gcloud storage buckets update gs://<BACKUP_BUCKET> --lifecycle-file=lifecycle.json
gcloud storage buckets add-iam-policy-binding gs://<BACKUP_BUCKET> \
  --member="serviceAccount:$BACKUP_SA" --role=roles/storage.objectCreator
```

## 9. MongoDB Atlas M0

En la consola de Atlas (ADR-025, punto 4):

1. Crea un cluster **M0** en Google Cloud, región **Iowa (us-central1)**. Si M0 no se ofrece ahí, la región de Google Cloud más cercana que lo tenga.
2. **Database Access:**
   - `blog-api`: contraseña larga (generada por Atlas), rol `readWrite` **solo** sobre la base `personal_blog`.
   - `blog-mcp` (solo si algún día el MCP se conecta a producción, ADR-019): rol `read` solo sobre `personal_blog`.
3. **Network Access:** `0.0.0.0/0`. Riesgo aceptado en ADR-025: Cloud Run no tiene IP de salida fija gratuita. La defensa es la contraseña larga, el usuario con permisos mínimos y TLS (Atlas lo exige).
4. Copia la cadena de conexión `mongodb+srv://blog-api:<contraseña>@…/?retryWrites=true&w=majority` y guárdala con el paso 7 (`mongo-uri`). La contraseña va URL-encoded.

Los respaldos usan la misma URI; `readWrite` incluye la lectura que necesita `mongodump`.

## 10. Environments y variables de GitHub

**Settings → Environments:**

- `production`: *Required reviewers* = León; *Deployment branches* = solo `main`. Cada despliegue (de la API o del job de respaldo) espera tu aprobación.

Ya no hace falta el environment `backup` (ADR-030). Si lo creaste, bórralo.

**Settings → Secrets and variables → Actions → Variables** (no son secretas; nada va en *Secrets*):

| Variable | Valor |
|---|---|
| `GCP_PROJECT_ID` | `<PROJECT_ID>` |
| `GCP_WIF_PROVIDER` | El `name` del paso 5: `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/personal-blog` |
| `GCP_DEPLOY_SA` | `api-deploy@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SA` | `api-runtime@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_BACKUP_SA` | `mongo-backup@<PROJECT_ID>.iam.gserviceaccount.com` |
| `FILES_GCS_BUCKET` | `<FILES_BUCKET>` |
| `GCP_ARTIFACT_REPO` | `api` |
| `GCP_BACKUP_BUCKET` | `<BACKUP_BUCKET>` |
| `CLOUD_RUN_SERVICE` | `api` |
| `GEMINI_MODEL` | Modelo del asistente, incluido en el plan gratuito |

## 11. Primer despliegue de la API

1. *Actions → deploy-api → Run workflow*, rama `main`, `target` = `api` (ADR-030: nunca se dispara solo). El job `check` comprueba que el `ci` de ese commit esté en verde.
2. Aprueba el job `deploy` (environment `production`). Al terminar corre `scripts/smoke.sh --read-only` contra el servicio.
3. El servicio nace privado. Ábrelo a internet una sola vez (la cuenta de despliegue no puede cambiar el IAM del servicio, a propósito):

   ```sh
   gcloud run services add-iam-policy-binding api --region="$REGION" \
     --member=allUsers --role=roles/run.invoker
   ```

4. **Administrador inicial** (solo la primera vez, con la colección `users` vacía):

   ```sh
   read -rs ADMIN_PASSWORD && printf '%s' "$ADMIN_PASSWORD" | gcloud secrets create initial-admin-password --data-file=- ; unset ADMIN_PASSWORD
   gcloud secrets add-iam-policy-binding initial-admin-password --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
   gcloud run services update api --region="$REGION" \
     --update-env-vars=INITIAL_ADMIN_EMAIL=<ADMIN_EMAIL> \
     --update-secrets=INITIAL_ADMIN_PASSWORD=initial-admin-password:latest
   ```

   Entra al admin y comprueba la sesión. El siguiente despliegue del workflow quita las dos variables (reemplaza todas con `--env-vars-file` y `--set-secrets`). Después borra el secreto: `gcloud secrets delete initial-admin-password`.

## 12. Migración del contenido local (BLOG-159)

Copia los posts de tu Mongo local a Atlas y sus portadas de `services/api/tmp/files/` al bucket, con las URLs reescritas de `http://localhost:8080/media/...` a `https://storage.googleapis.com/<FILES_BUCKET>/...` (portada, imagen de Open Graph e imágenes del markdown; el `blurDataUrl` es un `data:` y se copia tal cual). Lo corres tú, desde la raíz del repo, con tu sesión de `gcloud`. Solo copia la colección `posts`: ni usuarios, ni sesiones, ni comentarios, ni CV, ni el índice del RAG.

1. Mongo local arriba y el proyecto correcto en `gcloud`:

   ```sh
   make db-up
   gcloud config get-value project   # debe ser <PROJECT_ID>
   ```

2. **Simulacro** (es el modo por defecto). La URI sale de Secret Manager dentro de `$(...)`: no pasa por la pantalla ni queda en el historial, y el comando nunca la imprime.

   ```sh
   TARGET_MONGO_URI="$(gcloud secrets versions access latest --secret=mongo-uri)" \
     make prod-migrate-content TARGET_DB=personal_blog TARGET_BUCKET=<FILES_BUCKET>
   ```

   Revisa lo que informa: cuántos posts se migran y cuáles se excluyen, qué hará con cada uno (`crear`, `actualizar`, `sin cambios`, `no se pisa` si se editó en Atlas después que en local, `conflicto`), qué URLs reescribe, qué archivos sube con qué `Content-Type`, y los problemas. Con cualquier problema (una portada que falta en disco, un slug que en Atlas tiene otro `_id`, una URL local que no sabe reescribir) sale con error y no escribe nada.

   Por defecto migra los estados `published` y `draft`; los `archived` (por ejemplo, los posts que dejan los flujos de Bruno) quedan fuera. Para elegir posts, `SLUGS=slug-1,slug-2`; para otros estados, `STATUSES=published`. Tu base local tiene posts de prueba (`prueba-isr-…`): usa `SLUGS` con los reales.

3. **Escritura**, con los mismos argumentos y `DRY_RUN=0`:

   ```sh
   TARGET_MONGO_URI="$(gcloud secrets versions access latest --secret=mongo-uri)" \
     make prod-migrate-content TARGET_DB=personal_blog TARGET_BUCKET=<FILES_BUCKET> DRY_RUN=0
   ```

   Sube primero los archivos (`gcloud storage cp --no-clobber`, con el `Content-Type`, `Cache-Control` y `Content-Disposition` con que los sube la API) y después escribe los posts por su `_id`, con sus fechas y su estado. Es idempotente: puedes volver a correrlo; no duplica posts ni vuelve a subir un archivo que ya está.

4. **Comprobación:**

   ```sh
   API_URL="$(gcloud run services describe api --region="$REGION" --format='value(status.url)')"
   curl -sS "$API_URL/api/v1/posts" | jq -r '.items[].slug'
   gcloud storage ls -L "gs://<FILES_BUCKET>/covers/**" | grep -E "^gs://|Content-Type|Cache-Control"
   ```

Después:

- **Portadas en la web:** solo se ven con `COVER_IMAGES_BASE_URL=https://storage.googleapis.com/<FILES_BUCKET>/covers/` en Vercel (paso 15 y [variables](../deploy/variables.md)).
- **RAG:** si `RAG_ENABLED=true`, entra al admin y usa *Ajustes → Reindexar todo*: el índice no se copia.
- **Autor:** `author_id` es el id de tu administrador local, que no existe en Atlas. Ninguna regla de la API depende de él; solo se devuelve en las respuestas.
- **Portadas de los posts de la web anterior** (`arreglos` y `backend-api`, BLOG-076): si en local apuntan a `http://localhost:3000/img/blog/...`, el comando lo reporta como problema. Excluye esos slugs con `SLUGS` y asígnales la portada en producción con `make api-migrate-covers` y `SITE_URL=https://huitzi.xyz` (ver `docs/development.md`, «Portadas de los posts migrados»).
- **Revertir:** si Atlas ya tenía posts, respáldalo antes (paso 18 o `mongodump`). Un post migrado por error se borra desde el admin.

## 13. Verificación del dominio

```sh
gcloud domains verify huitzi.xyz
```

Abre Search Console y agrega `huitzi.xyz` como propiedad de tipo **Dominio**, no **Prefijo de URL**: el mapeo de Cloud Run pide la verificación del dominio entero, y la de prefijo no cuenta. Crea en Vercel el registro `TXT` que te da (paso 16). Usa la misma cuenta de Google con la que corres `gcloud`.

## 14. Mapeo de dominio de Cloud Run

Gratuito, en vista previa (ADR-025, punto 2):

```sh
gcloud beta run domain-mappings create --service=api --domain=api.huitzi.xyz --region="$REGION"
gcloud beta run domain-mappings describe --domain=api.huitzi.xyz --region="$REGION"
```

`describe` muestra el registro DNS a crear (normalmente `CNAME api → ghs.googlehosted.com.`). El certificado se emite solo cuando el DNS resuelve; puede tardar hasta 24 h.

## 15. Vercel

Dos proyectos, plan Hobby, importados del mismo repo (ADR-025, punto 6):

| | Web | Admin |
|---|---|---|
| Root Directory | `apps/web` | `apps/admin` |
| Framework | Next.js | Other |
| Install Command | por defecto (pnpm, por `packageManager`) | por defecto |
| Build Command | por defecto (`next build`) | `pnpm build` (corre los chequeos de URL y CSP; nunca `ng build` directo) |
| Output Directory | por defecto | `dist/admin/browser` |
| Node.js | 24.x | 24.x |
| Production Branch | `main` | `main` |
| Dominio | `huitzi.xyz` (y `www` con redirección) | `admin.huitzi.xyz` |
| Variables (Production) | ver [docs/deploy/variables.md](../deploy/variables.md#web-vercel-proyecto-appsweb) | ninguna: la URL de la API está en `angular.json` |

**Previews sin la API de producción (ADR-025, punto 6).** No hay API de staging, así que lo más simple es no construir previews. En cada proyecto, *Settings → Git → Ignored Build Step*, comando:

```sh
[ "$VERCEL_ENV" != "production" ]
```

(Vercel salta el build cuando el comando sale con 0.) Si algún día quieres previews, necesitan otra API: la web exige `API_BASE_URL` y el admin tiene `https://api.huitzi.xyz` fijo en el build y en su CSP. Aun sin este paso, una preview del admin no podría iniciar sesión: el origen `*.vercel.app` no está en `ALLOWED_ORIGINS` y las cookies `SameSite=Strict` no viajan entre sitios.

Ningún secreto va en Vercel (ADR-025, punto 8): solo la URL pública de la API.

## 16. DNS en Vercel

Los nameservers de `huitzi.xyz` son los de Vercel, así que su DNS se administra en Vercel, no en DreamHost (DreamHost sigue siendo solo el registrador). En *Vercel → Domains → `huitzi.xyz` → DNS Records*, con los valores exactos que te muestren Search Console y Cloud Run:

| Nombre | Tipo | Valor | Para |
|---|---|---|---|
| `@` (`huitzi.xyz`) | `TXT` | `google-site-verification=…` (paso 13) | Verificación del dominio |
| `api` | `CNAME` | `ghs.googlehosted.com.` (el de `describe`, paso 14) | API |

La web (`huitzi.xyz` y `www`) y el admin (`admin.huitzi.xyz`) no necesitan registros a mano: Vercel los crea al asignar el dominio a cada proyecto (paso 15). Comprueba con `dig +short api.huitzi.xyz`, `dig +short admin.huitzi.xyz` y `dig +short TXT huitzi.xyz`.

## 17. Uptime check

```sh
gcloud monitoring uptime create api-health \
  --resource-type=uptime-url \
  --resource-labels=host=api.huitzi.xyz,project_id="$PROJECT_ID" \
  --protocol=https --path=/health --period=15
```

Con `min-instances=0`, cada chequeo puede despertar una instancia. Con 15 minutos el costo sigue en el nivel gratuito; no lo bajes de 5.

Crea una alerta sobre ese chequeo en *Monitoring → Alerting* con notificación por email.

## 18. Respaldo (Cloud Run Job, ADR-030)

1. *Actions → deploy-api → Run workflow*, rama `main`, `target` = `backup-job`, y aprueba el job. Crea o actualiza el Cloud Run Job `mongo-backup` (imagen de `services/api/deploy/backup/`); no lo ejecuta.
2. Programación semanal (domingos 09:00 UTC), una sola vez:

   ```sh
   PROJECT_ID="$PROJECT_ID" sh services/api/deploy/backup/scheduler.sh
   ```

3. Primera ejecución a mano y comprobación:

   ```sh
   gcloud run jobs execute mongo-backup --region="$REGION" --wait
   gcloud storage ls -l gs://<BACKUP_BUCKET>/
   ```

4. Prueba restaurarlo en tu Mongo local una vez (ver **Reversión → Base de datos**).

El historial de ejecuciones queda en *Cloud Run → Jobs → mongo-backup*; agrega una alerta de log en *Monitoring → Alerting* para las ejecuciones fallidas.

## 19. Verificación del primer despliegue (BLOG-041)

1. **Salud:** `curl -sS https://api.huitzi.xyz/health`.
2. **IP del cliente y `TRUSTED_PROXIES`:** con `TRUSTED_PROXIES` vacía, la API usa la IP del socket, que en Cloud Run es la del frontend de Google, no la tuya. Haz unas peticiones y revisa en Cloud Logging el campo `remoteIp` del log de acceso (`accesslog.go`; va truncado a /24 en IPv4 y /48 en IPv6, para no guardar datos personales, pero alcanza para ver de qué red llega):
   - si todas salen con la misma IP interna, el rate limit por IP está agrupando a todos los clientes;
   - decide el rango de confianza según lo que veas (por ejemplo, el de los frontends de Google) y ponlo en `TRUSTED_PROXIES` en `services/api/deploy/production.env.yaml`, en un PR. No confíes en `X-Forwarded-For` sin ese rango: cualquiera podría falsificar su IP.
3. **Cookies:** inicia sesión en `https://admin.huitzi.xyz` y revisa en DevTools que `access_token` y `refresh_token` lleguen con `Secure`, `HttpOnly`, `SameSite=Strict` y el dominio y path esperados (ADR-005).
4. **Cache-Control:** `curl -sSI https://api.huitzi.xyz/api/v1/posts` (pública) y `/api/v1/auth/me` o `/api/v1/admin/posts` con sesión (DevTools): las privadas deben llevar `no-store` y Cloud Run no debe agregar ni quitar cabeceras de caché.
5. **CORS:** desde la consola de `https://huitzi.xyz`, una petición a la API funciona; desde otro origen, no.
6. **Web y admin:** las cabeceras de seguridad (`curl -sSI https://huitzi.xyz`, `https://admin.huitzi.xyz`) coinciden con `apps/web/lib/security-headers.ts` y `apps/admin/vercel.json`.

## Reversión

**API (Cloud Run):** devuelve el tráfico a la revisión anterior. No hace falta reconstruir nada.

```sh
gcloud run revisions list --service=api --region="$REGION"
gcloud run services update-traffic api --region="$REGION" --to-revisions=<REVISION_ANTERIOR>=100
```

Mientras el tráfico esté fijado a una revisión, un despliegue nuevo no lo recibe. Cuando el arreglo esté en `main` y desplegado, vuelve a la más reciente:

```sh
gcloud run services update-traffic api --region="$REGION" --to-latest
```

**Web y admin (Vercel):** en el proyecto, *Deployments*, el despliegue anterior → *Instant Rollback*. Es inmediato y no reconstruye. Vercel deja de promover automáticamente los despliegues nuevos hasta que lo deshagas desde el mismo menú.

**Base de datos (Atlas):** solo si hay datos dañados. Primero restaura en local para comprobar el archivo:

```sh
gcloud storage cp gs://<BACKUP_BUCKET>/mongo-<FECHA>.archive.gz .
mongorestore --uri="mongodb://root:<contraseña-local>@127.0.0.1:27017/?authSource=admin" \
  --archive=mongo-<FECHA>.archive.gz --gzip --drop --nsInclude='personal_blog.*'
```

En producción, el mismo comando con la URI de Atlas de un usuario con permiso de escritura (escríbela con `read -rs`, no en la línea de comandos). `--drop` reemplaza las colecciones: todo lo escrito después del respaldo se pierde.

**Secretos:** agrega una versión nueva con el valor anterior (`gcloud secrets versions add <secreto> --data-file=-`, escrito con `read -rs`) y vuelve a desplegar o crea una revisión nueva (`gcloud run services update api --region="$REGION"`): cada instancia lee `latest` al arrancar. Después deshabilita la versión mala: `gcloud secrets versions disable <N> --secret=<secreto>`. No deshabilites la versión `latest` sin agregar otra: el servicio dejaría de arrancar.
