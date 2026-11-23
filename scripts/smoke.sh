#!/usr/bin/env bash
# Smoke test de la API desplegada (BLOG-022, ADR-025). Sale con código != 0 si
# algo falla. Necesita bash, curl y jq.
#
# Uso:
#   API_URL=http://127.0.0.1:8090 ORIGIN=http://localhost:3000 \
#     SMOKE_ADMIN_EMAIL=… SMOKE_ADMIN_PASSWORD=… scripts/smoke.sh
#   API_URL=https://api.huitzi.xyz scripts/smoke.sh --read-only
#
# Siempre (solo lectura):
#   - /health y /ready;
#   - el listado de posts y un post (si hay alguno publicado);
#   - el CV: /api/v1/cv y la descarga del PDF vigente (si hay alguno);
#   - las cabeceras de seguridad y que una petición de otro origen no cambie
#     estado.
# Sin --read-only, con SMOKE_ADMIN_EMAIL y SMOKE_ADMIN_PASSWORD (un admin; por
# ejemplo, el inicial de un Mongo local), además escribe:
#   - inicia sesión, crea y publica un post de prueba y sube un CV de prueba;
#   - comentarios (si COMMENTS_ENABLED): envía uno, comprueba que queda
#     pendiente y oculto, lo aprueba y comprueba que se ve;
#   - RAG (si está encendido): consulta su estado. La búsqueda con contexto
#     llama a Gemini y no se prueba aquí (cuota); ver make api-rag-eval.
# Nunca corras el modo de escritura contra producción.
#
# La contraseña se lee del entorno y va a curl por un archivo temporal
# (--data @archivo), no por la línea de comandos.
set -euo pipefail

API_URL="${API_URL:?define API_URL, por ejemplo http://127.0.0.1:8090}"
API_URL="${API_URL%/}"
ORIGIN="${ORIGIN:-}"
READ_ONLY=false
[ "${1:-}" = "--read-only" ] && READ_ONLY=true

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
umask 077

passed=0
failed=0
skipped=0
ok() { echo "ok      $1"; passed=$((passed + 1)); }
fail() { echo "FALLA   $1"; failed=$((failed + 1)); }
skip() { echo "omitido $1"; skipped=$((skipped + 1)); }

# request MÉTODO RUTA [args de curl…]: deja el cuerpo en $work/body y el
# código HTTP en $status. Nunca imprime cookies ni cuerpos de login.
status=000
request() {
  local method=$1 path=$2
  shift 2
  status=$(curl --silent --show-error --max-time 30 --retry 2 --retry-all-errors \
    -o "$work/body" -w '%{http_code}' -X "$method" \
    -b "$work/cookies" -c "$work/cookies" "$@" "$API_URL$path") || status=000
}

expect() {
  local want=$1 name=$2
  if [ "$status" = "$want" ]; then ok "$name"; else fail "$name (HTTP $status, se esperaba $want)"; fi
}

# --- Salud ------------------------------------------------------------------
request GET /health
expect 200 "GET /health"
request GET /ready
expect 200 "GET /ready (Mongo responde)"

# --- Cabeceras de seguridad (ADR-010) ----------------------------------------
headers=$(curl --silent --show-error --max-time 30 -D - -o /dev/null "$API_URL/health" | tr -d '\r')
for header in "content-security-policy: default-src 'none'" "x-content-type-options: nosniff" "strict-transport-security:"; do
  if grep -qi "^$header" <<<"$headers"; then ok "cabecera ${header%%:*}"; else fail "falta la cabecera ${header%%:*}"; fi
done

# --- Posts -------------------------------------------------------------------
check_posts() {
  request GET "/api/v1/posts?limit=5"
  expect 200 "GET /api/v1/posts"
  slug=$(jq -r '.items[0].slug // empty' "$work/body" 2>/dev/null || true)
  if [ -z "$slug" ]; then
    skip "GET /api/v1/posts/{slug}: no hay posts publicados"
    return
  fi
  request GET "/api/v1/posts/$slug"
  expect 200 "GET /api/v1/posts/$slug"
  if [ "$status" = 200 ] && jq -e '.content | length > 0' "$work/body" >/dev/null; then ok "el post trae su contenido"; else fail "el post no trae contenido"; fi
}

# --- CV ----------------------------------------------------------------------
check_cv() {
  request GET /api/v1/cv
  expect 200 "GET /api/v1/cv"
  url=$(jq -r '.es.url // .en.url // empty' "$work/body" 2>/dev/null || true)
  if [ -z "$url" ]; then
    skip "descarga del CV: no hay un PDF vigente"
    return
  fi
  code=$(curl --silent --show-error --max-time 30 -o "$work/cv.pdf" -w '%{http_code}' "$url") || code=000
  if [ "$code" = 200 ] && [ "$(head -c 5 "$work/cv.pdf")" = "%PDF-" ]; then ok "descarga del CV ($url)"; else fail "descarga del CV ($url, HTTP $code)"; fi
}

# --- Origen ajeno (ADR-005, ADR-010) ----------------------------------------
check_foreign_origin() {
  request POST /api/v1/auth/logout -H 'Origin: https://evil.example'
  expect 403 "un origen que no está en ALLOWED_ORIGINS no puede cambiar estado"
}

check_posts
check_cv
check_foreign_origin

# --- Escritura (solo en local) ------------------------------------------------
if $READ_ONLY; then
  skip "escritura: modo --read-only"
elif [ -z "${SMOKE_ADMIN_EMAIL:-}" ] || [ -z "${SMOKE_ADMIN_PASSWORD:-}" ] || [ -z "$ORIGIN" ]; then
  skip "escritura: faltan SMOKE_ADMIN_EMAIL, SMOKE_ADMIN_PASSWORD u ORIGIN"
else
  auth=(-H "Origin: $ORIGIN" -H 'Content-Type: application/json')

  jq -n --arg e "$SMOKE_ADMIN_EMAIL" --arg p "$SMOKE_ADMIN_PASSWORD" '{email: $e, password: $p}' > "$work/login.json"
  request POST /api/v1/auth/login "${auth[@]}" --data @"$work/login.json"
  rm -f "$work/login.json"
  expect 200 "login del admin"

  stamp=$(date -u +%Y%m%d%H%M%S)
  slug="smoke-$stamp"
  jq -n --arg s "$slug" '{title: "Smoke test", slug: $s, excerpt: "Post de prueba del smoke test.", content: "## Prueba\n\nTexto del smoke test.", tags: ["smoke"], status: "published"}' > "$work/post.json"
  request POST /api/v1/admin/posts "${auth[@]}" --data @"$work/post.json"
  expect 201 "crear y publicar un post de prueba"
  check_posts

  printf '%%PDF-1.4\n%% smoke test\n1 0 obj << >> endobj\ntrailer << >>\n%%%%EOF\n' > "$work/upload.pdf"
  request POST /api/v1/admin/cv/es -H "Origin: $ORIGIN" -H 'Content-Type: application/pdf' --data-binary @"$work/upload.pdf"
  expect 201 "subir un CV de prueba"
  check_cv

  jq -n '{name: "Smoke", content: "Comentario del smoke test."}' > "$work/comment.json"
  request POST "/api/v1/posts/$slug/comments" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' --data @"$work/comment.json"
  if [ "$status" = 404 ]; then
    skip "comentarios: COMMENTS_ENABLED=false"
  else
    expect 202 "enviar un comentario"
    if jq -e '.status == "pending"' "$work/body" >/dev/null 2>&1; then ok "el comentario queda pendiente"; else fail "el comentario no quedó pendiente"; fi

    request GET "/api/v1/posts/$slug/comments"
    if [ "$status" = 200 ] && jq -e '.total == 0' "$work/body" >/dev/null; then ok "un comentario pendiente no es público"; else fail "un comentario pendiente se ve en público"; fi

    request GET "/api/v1/admin/comments?status=pending" -H "Origin: $ORIGIN"
    id=$(jq -r --arg c "Comentario del smoke test." '[.items[] | select(.content == $c)][0].id // empty' "$work/body" 2>/dev/null || true)
    if [ -n "$id" ]; then
      ok "el admin ve el comentario en la cola"
      request POST "/api/v1/admin/comments/$id/approve" "${auth[@]}"
      expect 200 "aprobar el comentario"
      request GET "/api/v1/posts/$slug/comments"
      if jq -e '.total == 1' "$work/body" >/dev/null 2>&1; then ok "el comentario aprobado es público"; else fail "el comentario aprobado no se ve"; fi
    else
      fail "el comentario no aparece en la cola del admin"
    fi
  fi

  request GET /api/v1/admin/rag/status -H "Origin: $ORIGIN"
  if [ "$status" = 200 ]; then
    ok "estado del RAG: $(jq -c '.' "$work/body")"
    skip "búsqueda RAG: llama a Gemini (cuota); se mide con make api-rag-eval"
  elif [ "$status" = 404 ] || [ "$status" = 503 ]; then
    skip "RAG apagado (HTTP $status)"
  else
    fail "estado del RAG (HTTP $status)"
  fi

  request POST /api/v1/auth/logout "${auth[@]}"
  expect 204 "cerrar sesión"
fi

echo
echo "smoke: $passed ok, $failed fallas, $skipped omitidos"
[ "$failed" -eq 0 ]
