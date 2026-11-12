API_DIR := services/api
# Swagger UI para ver el contrato en local; fijada por tag y digest.
SWAGGER_UI_IMAGE := swaggerapi/swagger-ui:v5.33.3@sha256:b26661cd754a7efbb2e1aab419ffb5603320d8f35f0bd086d1d7506e23934d23

.PHONY: web-dev web-lint web-typecheck web-test web-build web-start e2e e2e-clean admin-dev admin-lint admin-test admin-build admin-preview admin-csp-test api-run api-watch api-test api-test-integration api-lint api-build mcp-build api-docker-build api-docs api-flows generate db-up db-down db-logs db-reset docs-architecture

api-run:
	@test -f .env || { echo "Falta .env: copia .env.example a .env"; exit 1; }
	@set -a && . ./.env && set +a && cd $(API_DIR) && go run ./cmd/api

# Como api-run, pero recompila y reinicia la API al guardar un .go (Air).
api-watch:
	@test -f .env || { echo "Falta .env: copia .env.example a .env"; exit 1; }
	@set -a && . ./.env && set +a && cd $(API_DIR) && go tool air

api-test:
	cd $(API_DIR) && go test -race ./...

api-test-integration: db-up
	@test -f .env || { echo "Falta .env: copia .env.example a .env"; exit 1; }
	@set -a && . ./.env && set +a && cd $(API_DIR) && MONGO_TEST_URI="$$MONGO_URI" go test -race -count=1 ./internal/repository/...

api-lint:
	cd $(API_DIR) && golangci-lint run ./...

api-build:
	cd $(API_DIR) && go build -o bin/api ./cmd/api

# Servidor MCP de solo lectura (ADR-019), en services/api/bin/mcp.
mcp-build:
	cd $(API_DIR) && go build -o bin/mcp ./cmd/mcp

api-docker-build:
	docker build -t personal-blog-api $(API_DIR)

api-docs:
	@echo "Contrato en http://localhost:8081 (Ctrl+C para salir)"
	docker run --rm -p 127.0.0.1:8081:8080 -v "$(CURDIR)/docs/api:/spec:ro" -e SWAGGER_JSON=/spec/openapi.yaml $(SWAGGER_UI_IMAGE)

# Corre los flujos de Bruno contra la API local, con el administrador de .env.
api-flows:
	@test -f .env || { echo "Falta .env: copia .env.example a .env"; exit 1; }
	@set -a && . ./.env && set +a && \
		test -n "$$INITIAL_ADMIN_EMAIL" && test -n "$$INITIAL_ADMIN_PASSWORD" || { echo "Faltan INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD en .env"; exit 1; }; \
		cd docs/api/bruno && "$(CURDIR)/node_modules/.bin/bru" run flows -r --env local \
		--env-var "adminEmail=$$INITIAL_ADMIN_EMAIL" --env-var "adminPassword=$$INITIAL_ADMIN_PASSWORD"

# Web pública (ADR-017) contra la API local; con WEB_API_BASE_URL=<origen> usa
# otra. web-build y web-start reproducen el ISR de producción en local.
web-dev:
	$(if $(WEB_API_BASE_URL),API_BASE_URL=$(WEB_API_BASE_URL)) pnpm --filter @personal-blog/web dev

web-lint:
	pnpm --filter @personal-blog/web lint

web-typecheck:
	pnpm --filter @personal-blog/web typecheck

web-test:
	pnpm --filter @personal-blog/web test

web-build:
	API_BASE_URL=$(or $(WEB_API_BASE_URL),http://localhost:8080) pnpm --filter @personal-blog/web build

web-start:
	API_BASE_URL=$(or $(WEB_API_BASE_URL),http://localhost:8080) pnpm --filter @personal-blog/web start

# Con ADMIN_API_BASE_URL=<origen> apunta el admin a otra API; sin ella usa el
# define de development en angular.json.
admin-dev:
	pnpm --filter @personal-blog/admin start $(if $(ADMIN_API_BASE_URL),--define "ADMIN_API_BASE_URL='$(ADMIN_API_BASE_URL)'")

admin-lint:
	pnpm --filter @personal-blog/admin lint

admin-test:
	pnpm --filter @personal-blog/admin test

admin-build:
	pnpm --filter @personal-blog/admin build

# Hace el build de producción y lo sirve con las cabeceras de apps/admin/vercel.json.
# Siempre reconstruye: un dist/ viejo puede no traer el <meta> de autoCsp.
admin-preview: admin-build
	cd apps/admin && node scripts/serve-dist.mjs

# Hace el build de producción y prueba su CSP en Chrome o Chromium headless.
admin-csp-test: admin-build
	cd apps/admin && node scripts/check-csp-browser.mjs

# E2E con Playwright contra el stack local: base temporal, API y admin en
# puertos libres, y un admin de prueba con credenciales generadas por la
# corrida. Limpia todo al terminar. E2E_ARGS va a playwright test.
e2e: db-up
	@test -f .env || { echo "Falta .env: copia .env.example a .env"; exit 1; }
	pnpm --filter @personal-blog/e2e exec playwright install chromium
	@set -a && . ./.env && set +a && cd e2e && node scripts/run.mjs $(E2E_ARGS)

# Borra las bases e2e_* que haya dejado una corrida interrumpida a la fuerza.
e2e-clean:
	docker compose exec -T mongo sh -c 'mongosh -u "$$MONGO_INITDB_ROOT_USERNAME" -p "$$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --quiet --eval "db.adminCommand({listDatabases: 1}).databases.map((d) => d.name).filter((n) => /^e2e_[0-9a-f]{12}$$/.test(n)).forEach((n) => { db.getSiblingDB(n).dropDatabase(); print(\"borrada \" + n) })"'

generate:
	cd $(API_DIR) && go tool oapi-codegen -config oapi-codegen.yaml ../../docs/api/openapi.yaml
	pnpm --filter @personal-blog/api-types generate
	./scripts/generate-bruno.sh

db-up:
	docker compose up -d --wait

db-down:
	docker compose down

db-logs:
	docker compose logs -f mongo

db-reset:
	@printf "Esto borra los datos de MongoDB local. Escribe 'borrar' para continuar: "; \
	read answer; \
	[ "$$answer" = "borrar" ] || { echo "Cancelado."; exit 1; }
	docker compose down -v

# Diagrama de arquitectura con archify (.claude/skills/archify, sin dependencias
# npm). Valida el JSON y regenera el HTML. Sin consulta de actualizaciones.
ARCHIFY := ARCHIFY_UPDATE_CHECK_DISABLED=1 node .claude/skills/archify/bin/archify.mjs
docs-architecture:
	$(ARCHIFY) validate architecture docs/architecture.architecture.json --repo-root . --quality showcase
	$(ARCHIFY) deliver architecture docs/architecture.architecture.json docs/architecture-diagram.html --repo-root . --quality showcase
	$(ARCHIFY) check docs/architecture-diagram.html --require-provenance
