# ADR-008: CI con Detección de Cambios y Job Puerta
* Estado: Aprobado
* Fecha: 2026-11-01
* Autor: León Nieves Huitzitzili Domingo
* Reemplaza: ADR-004 (punto de CI/CD)

## Contexto
ADR-004 define un workflow independiente por ruta, filtrado con `paths`. Si un job filtrado por `paths` se exige como check obligatorio en el ruleset de `main`, los PRs que no tocan esa ruta nunca lo reportan y quedan bloqueados.

## Alternativas Consideradas
* Opción A (Seleccionada): Un solo workflow con detección de cambios y un job puerta como único check obligatorio.
* Opción B: Quitar el filtro de `paths`. Descartada: corre todo en cada PR y obliga a tocar el ruleset por cada app.
* Opción C: Workflow dummy con el mismo nombre. Descartada: dos checks con el mismo nombre en PRs mixtos.

## Decisión
Se usa un único workflow, `.github/workflows/ci.yml`, sin filtro de `paths`, que corre en `pull_request` y en `push` a `main`:
* Job `changes`: detecta qué partes del repo cambiaron con `dorny/paths-filter`, fijado por SHA de commit y no por tag para reducir el riesgo de supply chain.
* Job `api`: corre solo si cambió `services/api/**` o el propio `ci.yml`.
* Job `ci`: job puerta que necesita a los anteriores y corre siempre. Falla si alguno terminó en `failure` o `cancelled`; `skipped` cuenta como éxito.

El check obligatorio del ruleset es `ci`.

## Consecuencias
* **Positivas**: Los PRs que no tocan la API no se bloquean ni la prueban, y agregar una app no obliga a tocar el ruleset.
* **Negativas**: Una dependencia de terceros para detectar cambios y un job extra por PR.
