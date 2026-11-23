#!/bin/sh
# Un respaldo: mongodump de toda la URI a un archivo .archive.gz y subida a
# gs://$BACKUP_BUCKET/mongo-<fecha UTC>.archive.gz. Lo ejecuta el Cloud Run Job
# mongo-backup (Dockerfile de este directorio).
#
# Entorno:
#   MONGO_URI       secreto mongo-uri de Secret Manager (--set-secrets).
#   BACKUP_BUCKET   bucket privado de respaldos, con borrado a los 90 días.
#   METADATA_HOST   metadata server (por defecto el de Cloud Run). Solo para
#   STORAGE_HOST    probar en local con fakes; en producción no se definen.
#
# La URI no pasa por la línea de comandos ni por el log: va a un archivo de
# configuración de mongodump con permisos 600, como el token de GCS.
set -eu
umask 077

: "${MONGO_URI:?falta MONGO_URI}"
: "${BACKUP_BUCKET:?falta BACKUP_BUCKET}"
metadata="${METADATA_HOST:-http://metadata.google.internal}"
storage="${STORAGE_HOST:-https://storage.googleapis.com}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

printf 'uri: "%s"\n' "$MONGO_URI" > "$work/mongodump.yaml"
unset MONGO_URI

name="mongo-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
mongodump --config "$work/mongodump.yaml" --archive="$work/$name" --gzip --quiet
rm -f "$work/mongodump.yaml"

# Token de acceso de la cuenta de servicio del job (solo puede crear objetos en
# el bucket de respaldos).
token=$(curl --fail --silent --show-error -H 'Metadata-Flavor: Google' \
  "$metadata/computeMetadata/v1/instance/service-accounts/default/token" |
  sed -E 's/.*"access_token" *: *"([^"]+)".*/\1/')
printf 'Authorization: Bearer %s\n' "$token" > "$work/auth"
unset token

# ifGenerationMatch=0: solo crea, nunca sobrescribe un respaldo existente.
curl --fail --silent --show-error -o /dev/null \
  -H @"$work/auth" -H 'Content-Type: application/gzip' \
  --data-binary @"$work/$name" \
  "$storage/upload/storage/v1/b/$BACKUP_BUCKET/o?uploadType=media&ifGenerationMatch=0&name=$name"

echo "respaldo subido: gs://$BACKUP_BUCKET/$name ($(wc -c < "$work/$name") bytes)"
