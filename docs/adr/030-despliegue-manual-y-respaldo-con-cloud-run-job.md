# ADR-030: Despliegue Manual de la API y Respaldo con Cloud Run Job
* Estado: Propuesto
* Fecha: 2026-11-22
* Autor: León Nieves Huitzitzili Domingo (borrador de Claude para su revisión)
* Corrige: ADR-025, punto 5 (respaldo como GitHub Action) y punto 7 (despliegue al mergear en `main`)

## Contexto
ADR-025 decidió dos cosas que, al preparar el primer despliegue, conviene cambiar:
* **Punto 7:** GitHub Actions despliega la API al mergear en `main` cambios de `services/api`, con aprobación manual en el environment `production`. En la práctica, cada merge de la API abre un despliegue pendiente aunque no se quiera publicar todavía, y hoy, sin la nube configurada, cada uno termina en una corrida fallida de `deploy-api` (por ejemplo, la del 2026-11-22 a las 05:56 UTC).
* **Punto 5:** el respaldo semanal de Atlas M0 es una GitHub Action programada. Depende de que GitHub ejecute el `schedule` (GitHub lo pospone o lo desactiva en repos con poca actividad), necesita un environment `backup` y un `subject` de WIF propio, e instala `mongodump` en cada corrida. Hoy también falla cada domingo, porque la nube aún no existe.

León pidió que el despliegue sea solo manual y que el respaldo corra como Cloud Run Job con Cloud Scheduler.

## Alternativas Consideradas
### Disparador del despliegue
* Opción A (Seleccionada): `workflow_dispatch` únicamente. El workflow exige `main` y el check `ci` en verde del mismo commit, y conserva la aprobación en el environment `production`.
* Opción B: dejar `workflow_run` al mergear (ADR-025). Descartada: despliegues pendientes que no se pidieron y corridas fallidas mientras no hay nube.
* Opción C: desplegar al crear un tag o release. Descartada por ahora: un paso más sin beneficio para un solo autor.

### Respaldo
* Opción A (Seleccionada): Cloud Run Job `mongo-backup` con su propia imagen (`mongodump` fijado por versión y sha256), lanzado por Cloud Scheduler cada semana. La URI de Mongo se monta desde Secret Manager con `--set-secrets` y el archivo se sube a GCS con el token de la cuenta del job.
* Opción B: la GitHub Action programada de ADR-025. Descartada: el `schedule` de GitHub no es confiable y la Action amplía la superficie de WIF.
* Opción C: Atlas con respaldos propios. Descartada: M0 no los ofrece y un plan de pago rompe el costo de $0.

## Decisión
1. **Despliegue manual.** `deploy-api.yml` solo tiene `workflow_dispatch`, con un input `target` (`api` o `backup-job`). Antes de pedir la aprobación comprueba que la referencia es `main` y que el check `ci` de ese commit pasó. Lo demás de ADR-025 sigue igual: WIF sin llaves, cuentas de servicio separadas, `min-instances=0`, `max-instances=1`, `us-central1` y aprobación en `production`.
2. **Respaldo con Cloud Run Job.** El job `mongo-backup` corre con la cuenta `mongo-backup`, que solo puede leer el secreto `mongo-uri`, crear objetos en el bucket privado de respaldos (no leerlos ni borrarlos) y ejecutar su propio job. El bucket conserva la regla de borrado a los 90 días de ADR-025.
3. **Programación.** Cloud Scheduler `mongo-backup-weekly` ejecuta el job los domingos a las 09:00 UTC, autenticado como `mongo-backup`. La definición vive en `services/api/deploy/backup/scheduler.sh` y la aplica León una vez, como el resto de la nube (ADR-025, punto 14).
4. **Se retira la Action `backup-mongo.yml`** y, con ella, el environment `backup` y su `subject` de WIF. La cuenta `api-deploy` necesita `iam.serviceAccountUser` sobre `mongo-backup` para desplegar el job.

## Consecuencias
* **Positivas**: Nada se despliega sin pedirlo. Se acaban las corridas fallidas mientras no hay nube. El respaldo no depende del `schedule` de GitHub y su imagen ya trae las herramientas verificadas. Una cuenta de servicio menos con acceso por WIF.
* **Negativas**: Un merge en `main` ya no publica la API: hay que lanzar el workflow (riesgo de olvidar desplegar un arreglo). Cloud Scheduler y Cloud Run Jobs son dos servicios más que configurar (ambos dentro del nivel gratuito con una ejecución semanal). El respaldo deja de verse en la pestaña *Actions*: su historial queda en Cloud Run y en Cloud Logging.
