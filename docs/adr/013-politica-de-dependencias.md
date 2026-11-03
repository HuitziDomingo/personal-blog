# ADR-013: Política de Dependencias y Cadena de Suministro
* Estado: Aprobado
* Fecha: 2026-11-03
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-004 (tooling y versiones) y ADR-010 (punto 9, análisis continuo)

## Contexto
El monorepo depende de módulos de Go, paquetes de npm, imágenes de Docker y GitHub Actions. Los ataques a la cadena de suministro publican versiones maliciosas de paquetes legítimos (en npm ya ocurrió con paquetes populares, Nx entre ellos) y suelen detectarse y retirarse en pocos días. El scaffold de `apps/admin` (ADR-012) y después `apps/web` van a sumar cientos de paquetes de npm. Hoy cada versión se elige caso por caso, y las GitHub Actions están fijadas por tag, salvo `dorny/paths-filter`.

## Alternativas Consideradas
### Edad mínima de las versiones
* Opción A (Seleccionada): 7 días de antigüedad mínima, con `minimumReleaseAge` de pnpm y `cooldown` de Dependabot. Cubre la ventana en la que suelen retirarse las versiones maliciosas, sin retrasar demasiado las mejoras.
* Opción B: Sin edad mínima. Descartada: instala versiones publicadas horas antes, que es justo la ventana de mayor riesgo.
* Opción C: 30 días. Descartada como regla general por lenta; una versión con más tiempo publicada se puede preferir caso por caso.

### Fijación de GitHub Actions
* Opción A (Seleccionada): Por SHA de commit, con la versión en un comentario. Dependabot actualiza el SHA y el comentario.
* Opción B: Por tag de versión. Descartada: un tag se puede mover a otro commit, incluido uno malicioso.

## Decisión
1. **Edad mínima de 7 días**
   * npm: `minimumReleaseAge: 10080` (minutos) en `pnpm-workspace.yaml`.
   * Dependabot: `cooldown` de 7 días en todos los ecosistemas. Las actualizaciones de seguridad no esperan el cooldown.
   * Excepción: un parche de seguridad urgente se agrega a `minimumReleaseAgeExclude` en su propio PR, con el motivo, y se quita de la lista cuando la versión supera los 7 días.
2. **Scripts de instalación**: se mantiene el comportamiento de pnpm 10, que no ejecuta los scripts de instalación de las dependencias. Solo los paquetes listados en `onlyBuiltDependencies` pueden ejecutarlos, cada uno justificado en su PR.
3. **Lockfile**: `pnpm-lock.yaml` y `go.sum` se versionan. El CI instala con `pnpm install --frozen-lockfile` y falla si el lockfile no coincide.
4. **Fijación**
   * GitHub Actions por SHA de commit, con la versión en un comentario.
   * Imágenes de Docker por tag y digest (como ya se hace con distroless).
   * Herramientas de npm con versión exacta.
5. **Dependencias nuevas**: cada una se justifica en su PR (ya lo exige CLAUDE.md), incluidas las transitivas que traen scripts de instalación o binarios.

## Consecuencias
* **Positivas**: Una versión maliciosa publicada y retirada en pocos días nunca llega al repo. Los tags movidos de Actions o Docker no cambian lo que se ejecuta. Ninguna dependencia ejecuta código al instalarse sin aprobación explícita.
* **Negativas**: Las mejoras llegan con al menos 7 días de retraso. Un parche de seguridad urgente exige un PR de excepción. Los SHA de Actions son menos legibles que los tags. Go no tiene una edad mínima nativa: en módulos de Go solo la aplica el cooldown de Dependabot, no una instalación manual con `go get`.
