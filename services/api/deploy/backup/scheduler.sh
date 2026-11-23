#!/bin/sh
# Cloud Scheduler que ejecuta el Cloud Run Job mongo-backup cada semana
# (ADR-030). NO lo ejecuta ningún workflow ni agente: lo corre León una vez,
# después de desplegar el job con deploy-api (target backup-job). Ver
# docs/runbooks/despliegue.md, paso 17.
#
# Uso: PROJECT_ID=<PROJECT_ID> sh services/api/deploy/backup/scheduler.sh
set -eu

: "${PROJECT_ID:?define PROJECT_ID}"
REGION=us-central1
BACKUP_SA="mongo-backup@$PROJECT_ID.iam.gserviceaccount.com"

# El scheduler se autentica como la cuenta del respaldo, que solo puede
# ejecutar este job.
gcloud run jobs add-iam-policy-binding mongo-backup \
  --project "$PROJECT_ID" --region "$REGION" \
  --member="serviceAccount:$BACKUP_SA" --role=roles/run.invoker

# Domingos a las 09:00 UTC (03:00 en la Ciudad de México).
gcloud scheduler jobs create http mongo-backup-weekly \
  --project "$PROJECT_ID" --location "$REGION" \
  --schedule="0 9 * * 0" --time-zone="Etc/UTC" \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/mongo-backup:run" \
  --http-method=POST \
  --oauth-service-account-email="$BACKUP_SA" \
  --attempt-deadline=5m \
  --description="Respaldo semanal de MongoDB Atlas a GCS (ADR-030)"
