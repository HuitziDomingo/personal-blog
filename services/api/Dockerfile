FROM golang:1.27.4-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# Tag: nonroot. Se conserva junto al digest: sin tag, Dependabot lo cambiaría por
# el digest de latest, que corre como root.
FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab

ENV GIN_MODE=release

COPY --from=build /out/api /api

EXPOSE 8080

ENTRYPOINT ["/api"]
