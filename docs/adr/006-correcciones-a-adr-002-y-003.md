# ADR-006: Correcciones a ADR-002 y ADR-003
* Estado: Aprobado — complementado por ADR-019
* Fecha: 2026-11-01
* Autor: León Nieves Huitzitzili Domingo
* Reemplaza: ADR-002 (ubicación de los DTOs y driver de MongoDB) y ADR-003 (flujo E2E crítico)

## Contexto
Los ADRs aprobados en `main` son inmutables, así que las correcciones a ADR-002 y ADR-003 se registran en este ADR nuevo. El resto de ambos ADRs sigue vigente.

## Alternativas Consideradas
### Ubicación de los DTOs HTTP
* Opción original (ADR-002): `domain` contiene "Entidades puras, DTOs e interfaces de repositorios". Se descarta porque los DTOs HTTP pertenecen al transporte, y el propio ADR-002 busca desacoplar la lógica de negocio de los frameworks HTTP.

### Driver de MongoDB
* Opción original (ADR-002): `go.mongodb.org/mongo-driver`, sin indicar la versión mayor. Se descarta porque el proyecto usa la v2, cuya ruta de módulo es distinta.

### Flujo E2E crítico
* Opción original (ADR-003): `Auth -> Creación de Post -> Moderación -> Publicación`. Se descarta porque la moderación pasa a una fase futura y el flujo crítico no puede depender de ella.

## Decisión
1. **DTOs y dominio** (reemplaza ese punto de ADR-002): `domain` contiene entidades y puertos, sin tags de transporte. Los DTOs HTTP van en `handler`.
2. **Driver de MongoDB** (reemplaza ese punto de ADR-002): `go.mongodb.org/mongo-driver/v2`.
3. **Flujo E2E crítico** (reemplaza ese punto de ADR-003): `Auth -> Creación de Post -> Publicación`, sin moderación, que pasa a fase futura.

## Consecuencias
* **Positivas**: `domain` no depende del transporte, la versión del driver queda explícita y el E2E valida un flujo que no depende de la moderación.
* **Negativas**: `handler` debe mapear entre DTOs y entidades, la moderación queda sin cobertura E2E hasta que se implemente, y ADR-002 y ADR-003 deben leerse junto con este ADR.
