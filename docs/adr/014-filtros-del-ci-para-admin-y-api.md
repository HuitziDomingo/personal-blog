# ADR-014: Filtros del CI para los Jobs `admin` y `api`
* Estado: Aprobado
* Fecha: 2026-11-03
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-008 (agrega el job `admin`) y ADR-009 (amplía el filtro del job `api`)

## Contexto
ADR-008 define un solo `ci.yml` con detección de cambios y un job puerta `ci`, y prevé un job por app. `apps/admin` ya existe (BLOG-015), pero el CI no ejecuta su lint, sus tests ni su build: cualquier cambio en Angular se mergea sin verificación. Además, el filtro del job `api` (ADR-009) no incluye el `Makefile` ni `scripts/`, desde donde se regenera el contrato. Un cambio solo en esos archivos no ejecuta el check de drift hasta el siguiente PR que toque la API.

## Alternativas Consideradas
### Filtro del job `admin`
* Opción A (Seleccionada): `apps/admin/**` más todo lo que cambia cómo compila o se instala: tipos del contrato, lockfile, configuración del workspace, versión de Node y el propio workflow.
* Opción B: Solo `apps/admin/**`. Descartada: un cambio en `packages/api-types` o en el lockfile puede romper el build del admin sin que corra su job.

### Cobertura del `Makefile` y `scripts/`
* Opción A (Seleccionada): Incluirlos en el filtro del job `api`, que es el que ejecuta `make generate` y el check de drift.
* Opción B: Un job `contract` separado. Descartada por ahora: repite la preparación de Go y Node, como ya concluyó ADR-009.

## Decisión
1. **Job `admin`**
   * Corre si cambia alguna de estas rutas: `apps/admin/**`, `packages/api-types/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.nvmrc`, `.github/workflows/ci.yml`.
   * Pasos: `pnpm install --frozen-lockfile`, lint con angular-eslint, tests con Vitest y build de producción. El build falla si se superan los budgets de `angular.json`.
   * Node con la versión de `.nvmrc`.
2. **Job `api`**: al filtro de ADR-009 se agregan `Makefile` y `scripts/**`.
3. **Job puerta `ci`**: depende también de `admin`, con la misma regla de ADR-008: falla si algún job necesario falla o se cancela, y `skipped` cuenta como éxito.
4. **Regla de trabajo**: ningún PR de `apps/admin` con lógica nueva se mergea antes de que exista este job.

## Consecuencias
* **Positivas**: Todo cambio en Angular pasa por lint, tests y build antes del merge. Un cambio en los tipos del contrato verifica a la vez la API y el admin. El check de drift cubre todo lo que genera código.
* **Negativas**: Un cambio en `pnpm-lock.yaml` dispara `api` y `admin` aunque solo afecte a una de las dos apps. Un cambio en el `Makefile` dispara `api` aunque solo toque comandos del admin. Cuando llegue `apps/web` habrá que agregar su job y su filtro con la misma lógica.
