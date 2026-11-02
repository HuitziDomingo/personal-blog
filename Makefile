API_DIR := services/api

.PHONY: api-run api-test api-lint api-build generate db-up db-down db-logs db-reset

api-run:
	@test -f .env || { echo "Falta .env: copia .env.example a .env"; exit 1; }
	@set -a && . ./.env && set +a && cd $(API_DIR) && go run ./cmd/api

api-test:
	cd $(API_DIR) && go test -race ./...

api-lint:
	cd $(API_DIR) && golangci-lint run ./...

api-build:
	cd $(API_DIR) && go build -o bin/api ./cmd/api

generate:
	cd $(API_DIR) && go tool oapi-codegen -config oapi-codegen.yaml ../../docs/api/openapi.yaml
	pnpm --filter @personal-blog/api-types generate

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
