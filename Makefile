API_DIR := services/api
# Swagger UI para ver el contrato en local; fijada por tag y digest.
SWAGGER_UI_IMAGE := swaggerapi/swagger-ui:v5.33.3@sha256:b26661cd754a7efbb2e1aab419ffb5603320d8f35f0bd086d1d7506e23934d23

.PHONY: api-run api-test api-test-integration api-lint api-build api-docker-build api-docs api-flows generate db-up db-down db-logs db-reset

api-run:
	@test -f .env || { echo "Falta .env: copia .env.example a .env"; exit 1; }
	@set -a && . ./.env && set +a && cd $(API_DIR) && go run ./cmd/api

api-test:
	cd $(API_DIR) && go test -race ./...

api-test-integration: db-up
	@test -f .env || { echo "Falta .env: copia .env.example a .env"; exit 1; }
	@set -a && . ./.env && set +a && cd $(API_DIR) && MONGO_TEST_URI="$$MONGO_URI" go test -race -count=1 ./internal/repository/...

api-lint:
	cd $(API_DIR) && golangci-lint run ./...

api-build:
	cd $(API_DIR) && go build -o bin/api ./cmd/api

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
