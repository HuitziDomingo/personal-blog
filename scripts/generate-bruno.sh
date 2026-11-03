#!/bin/sh
# Regenera docs/api/bruno/generated/ desde docs/api/openapi.yaml.
# El CLI no sobrescribe un directorio existente, así que importa a uno temporal
# y reemplaza generated/ con las carpetas por tag. La raíz de la colección
# (opencollection.yml) es la de docs/api/bruno, escrita a mano.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
spec="$root/docs/api/openapi.yaml"
target="$root/docs/api/bruno/generated"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cd "$root"
pnpm exec bru import openapi --source "$spec" --output "$tmp/collection" --collection-name api >/dev/null
rm "$tmp/collection/opencollection.yml"

rm -rf "$target"
mv "$tmp/collection" "$target"
