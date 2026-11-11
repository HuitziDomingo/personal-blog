# ADR-023: Excepción de Seguridad para Go en la Política de Dependencias
* Estado: Aprobado
* Fecha: 2026-11-11
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-013 (punto 1, edad mínima y su excepción)

## Contexto
ADR-013 fija 7 días de antigüedad mínima para las dependencias y define una excepción para parches de seguridad urgentes, pero solo para npm (`minimumReleaseAgeExclude`). En Go la edad mínima solo la aplica el cooldown de Dependabot. El 2026-11-11 se publicó una vulnerabilidad en `net/http` de Go 1.27.3 que el código de la API alcanza; `govulncheck` empezó a fallar en main y en todo PR de la API, y la versión con el arreglo (Go 1.27.4) tenía un día. Se actualizó en su propio PR (#83), sin una regla escrita que lo cubriera.

## Alternativas Consideradas
* Opción A (Seleccionada): Extender la excepción de ADR-013 a Go con condiciones verificables: vulnerabilidad alcanzable según `govulncheck` y versión publicada por quien mantiene el código afectado.
* Opción B: Esperar siempre los 7 días. Descartada: deja main y todos los PR de la API en rojo y la vulnerabilidad expuesta una semana, por una versión oficial del equipo de Go.
* Opción C: Excluir `govulncheck` del CI mientras se espera. Descartada: apaga el control justo cuando importa.

## Decisión
1. Una versión de Go (directivas `go` y `toolchain` de `go.mod`, e imágenes de build) o de un módulo de Go puede entrar antes de los 7 días solo si se cumplen las dos condiciones:
   * `govulncheck` reporta una vulnerabilidad **alcanzable** por el código que la versión nueva corrige;
   * la versión la publica quien mantiene el código afectado: el equipo de Go para la toolchain y la librería estándar, o el repositorio oficial del módulo.
2. Va en su propio PR, sin otros cambios, con el ID de la vulnerabilidad, la salida de `govulncheck` y el enlace al anuncio o release oficial.
3. Una vulnerabilidad no alcanzable no justifica la excepción: espera el cooldown normal.
4. Se recomienda que la versión tenga al menos 24 horas publicada, salvo que la vulnerabilidad se esté explotando activamente.

## Consecuencias
* **Positivas**: Las vulnerabilidades alcanzables se corrigen el mismo día con una regla escrita, no caso por caso. `govulncheck` sigue siendo un control que bloquea.
* **Negativas**: Una versión oficial comprometida entraría sin la ventana de 7 días; el riesgo se acota con la condición de origen y el PR aislado. Exige revisar a mano el anuncio oficial.
