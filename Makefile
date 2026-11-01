API_DIR := services/api

.PHONY: api-run api-test api-lint api-build

api-run:
	cd $(API_DIR) && go run ./cmd/api

api-test:
	cd $(API_DIR) && go test -race ./...

api-lint:
	cd $(API_DIR) && golangci-lint run ./...

api-build:
	cd $(API_DIR) && go build -o bin/api ./cmd/api
