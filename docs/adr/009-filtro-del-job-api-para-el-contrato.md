# ADR-009: Filtro del Job `api` para el Contrato de API
* Estado: Aprobado — complementado por ADR-014
* Fecha: 2026-11-02
* Autor: León Nieves Huitzitzili Domingo
* Reemplaza: ADR-008 (cláusula del filtro del job `api`)

## Contexto
ADR-008 hace correr el job `api` solo si cambió `services/api/**` o el propio `ci.yml`. ADR-007 pide que el CI regenere el código del contrato y falle si hay diferencias. Con el filtro original, un PR que solo cambie `docs/api/openapi.yaml` o los tipos generados se salta ese check.

## Alternativas Consideradas
* Opción A (Seleccionada): Ampliar el filtro del job `api` a todo lo que afecta a la generación del contrato.
* Opción B: Agregar solo `docs/api/**`. Descartada: editar a mano `packages/api-types/schema.d.ts`, o cambiar la versión de `openapi-typescript` en el lockfile, seguiría sin pasar el check.
* Opción C: Un job separado para el check de drift. Descartada: repite la preparación de Go y Node, y obliga a sumar otro filtro para detectar lo mismo.

## Decisión
El job `api` corre si cambió alguna de estas rutas:
* `services/api/**`
* `docs/api/**`
* `packages/api-types/**`
* `pnpm-lock.yaml`
* `.github/workflows/ci.yml`

El resto de ADR-008 sigue vigente.

## Consecuencias
* **Positivas**: Ningún cambio que afecte al contrato se salta el check de drift.
* **Negativas**: El job `api` corre también en PRs sin cambios en Go, y cualquier cambio en `pnpm-lock.yaml`, incluido uno que solo afecte a los frontends, lo dispara.
