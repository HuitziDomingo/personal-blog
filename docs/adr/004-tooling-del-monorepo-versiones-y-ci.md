# ADR-004: Tooling del Monorepo, Versiones y CI/CD
* Estado: Aprobado
* Fecha: 2026-10-31
* Autor: León Nieves

## Contexto y Problema
Se requiere definir la estrategia de herramientas para la gestión del monorepo, la fijación de versiones de los entornos de ejecución (Node.js y Go), así como la automatización del flujo de Integración Continua (CI) y Despliegue Continuo (CD) para las aplicaciones (`apps/web`, `apps/admin`) y servicios (`services/api`).

## Alternativas Consideradas
### Orquestación de Monorepo
#### Opción A (Seleccionada)
Light Monorepo usando `pnpm workspaces` para proyectos Node.js, un único módulo de Go en `services/api`, y un `Makefile` en la raíz.

#### Opción B
Nx o Turborepo. Descartados por agregar complejidad innecesaria sobre el backend de Go.

### Despliegue de la API
#### Opción A (Seleccionada)
Serverless Containers en **GCP Cloud Run** ($0 USD de costo base al escalar a 0 instancias).

#### Opción B
VPS dedicado (Compute Engine / DigitalOcean). Descartado por costo fijo y mantenimiento del SO.

## Decisión
### Herramientas de Monorepo
Adopción de `pnpm workspaces` + `Makefile`. `go.work` no se adopta: con un solo módulo de Go no aporta nada, y se agregará mediante un ADR cuando exista un segundo módulo.

### Fijación de Versiones
* Node.js: Versión LTS fijada en `.nvmrc` (v24.x) y `package.json`. Se prefiere la 24 (LTS en mantenimiento hasta abril de 2028) por estabilidad: la 26 acaba de entrar en LTS y no está verificada con Angular ni Next.js.
* Go: Versión 1.27 fijada en `services/api/go.mod`.
* MongoDB local: Imagen `mongo:8.0`, la misma versión de Atlas.
* Docker: Compilación multi-etapa con imagen base `distroless/static-debian12`.

### CI/CD
Workflows independientes en GitHub Actions por ruta (`paths`):
* `.github/workflows/api.yml`
* `.github/workflows/admin.yml`
* `.github/workflows/web.yml`

## Consecuencias
### Positivas
* Simplicidad en el entorno de Go, costo $0 USD en producción mientras el volumen de peticiones sea bajo y pruebas ejecutadas solo en el código modificado por PR.

### Negativas
* Mantenimiento manual del `Makefile` y administración de tres workflows separados en GitHub Actions.