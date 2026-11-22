# ADR-025: Despliegue a Producción con Costo Cercano a Cero
* Estado: Aprobado
* Fecha: 2026-11-19
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-005 y ADR-010 (seguridad), ADR-013 y ADR-023 (dependencias), ADR-017 y ADR-020 (web), ADR-021, ADR-022, ADR-026 y ADR-027 (IA)

## Contexto
El sistema está completo en local: API en Go, admin en Angular, web en Next.js y MongoDB. Hay que publicarlo en `huitzi.xyz` (dominio en DreamHost) con costo mensual cercano a $0, sin llaves de servicio guardadas en GitHub y con un tope de gasto que no dependa solo de una alerta.

La investigación de BLOG-054 descartó Firebase Hosting delante de la API (solo reenvía la cookie `__session`, y la sesión usa `access_token` y `refresh_token`) y un balanceador de carga (unos $18 USD al mes). El mapeo de dominio de Cloud Run es gratuito, aunque está en vista previa y solo en algunas regiones, entre ellas `us-central1`.

## Alternativas Consideradas
### API
* Opción A (Seleccionada): Cloud Run en `us-central1` con mapeo de dominio gratuito.
* Opción B: Cloud Run detrás de un balanceador de carga. Descartada: unos $18 USD al mes.
* Opción C: Firebase Hosting con rewrites a Cloud Run. Descartada: solo reenvía la cookie `__session`.

### Base de datos
* Opción A (Seleccionada): MongoDB Atlas M0, gratuito.
* Opción B: MongoDB en una VM propia. Descartada: costo y operación de backups, parches y seguridad.

### Tope de costo
* Opción A (Seleccionada): `max-instances=1` en Cloud Run, más una alerta de presupuesto. El límite de instancias acota el gasto; la alerta solo avisa.
* Opción B: solo alerta de presupuesto. Descartada: una alerta no detiene el gasto.

## Decisión
1. **Dominios.** `huitzi.xyz` → web, `admin.huitzi.xyz` → admin y `api.huitzi.xyz` → API, con los registros DNS en DreamHost. Al ser el mismo sitio, las cookies `SameSite=Strict` de ADR-005 funcionan sin cambios.
2. **API.** Cloud Run en `us-central1`, con mapeo de dominio gratuito (requiere verificar el dominio en Google Search Console). Imagen distroless desde Artifact Registry en la misma región, con una política de limpieza que conserva solo las últimas versiones.
3. **Tope de costo.** `max-instances=1` y `min-instances=0`. Con una sola instancia, el rate limit en memoria (ADR-010, ADR-016, ADR-021, ADR-022 y ADR-026) sigue siendo exacto. Alerta de presupuesto de $5 USD al mes.
4. **Base de datos.** MongoDB Atlas M0, en la región de Google Cloud más cercana a `us-central1` que ofrezca M0. Usuario de base de datos dedicado para la API con permisos solo sobre su base, contraseña larga y TLS. Riesgo aceptado: acceso de red desde `0.0.0.0/0`, porque Cloud Run no tiene IP de salida fija gratuita. El servidor MCP (ADR-019) usa un usuario de solo lectura si algún día se conecta a producción.
5. **Respaldos.** M0 no hace respaldos. Una GitHub Action semanal ejecuta `mongodump` y sube el archivo a un bucket privado de Google Cloud Storage, separado del de portadas, con una regla de borrado de los respaldos de más de 90 días. La Action se autentica con Workload Identity Federation y lee la URI de Mongo desde Secret Manager en tiempo de ejecución; la URI no se guarda en GitHub.
6. **Web y admin.** Vercel (plan Hobby, uso personal), un proyecto por app, con despliegue automático desde `main`. Las previsualizaciones de los PR no usan la API de producción.
7. **CI/CD de la API.** GitHub Actions despliega a Cloud Run al mergear en `main` cambios de `services/api`, solo con el CI en verde y con aprobación manual del autor en el environment `production` de GitHub. Autenticación con Workload Identity Federation, sin llaves JSON. Cuentas de servicio separadas:
   * de despliegue: publicar en Artifact Registry y desplegar en Cloud Run, sin acceso a secretos;
   * de ejecución de la API: leer solo sus secretos y escribir solo en el bucket de portadas.
8. **Secretos.** Secret Manager para `JWT_SECRET`, la URI de Mongo, la clave de Gemini y el token de Cloudflare. Nada en variables de GitHub, en el repo ni en Vercel, salvo la URL pública de la API.
9. **Gemini.** La clave sigue en su proyecto de Google sin facturación (ADR-021), separado del proyecto de la API, para que el costo de $0 siga garantizado aunque este tenga facturación.
10. **Funciones al lanzar.** Asistente de escritura encendido (solo el admin). Comentarios (ADR-022), portadas con IA (ADR-026) y RAG (ADR-027) apagados hasta pasar sus pruebas con modelos reales; se encienden con variables de entorno, sin desplegar código nuevo.
11. **Configuración de producción.** `GIN_MODE=release`, `LOG_FORMAT=json` hacia Cloud Logging, `ALLOWED_ORIGINS` con los orígenes de la web y el admin en `https`, y `TRUSTED_PROXIES` según cómo Cloud Run entrega la IP del cliente (se verifica en el primer despliegue antes de confiar en el rate limit por IP).
12. **Observabilidad.** Cloud Logging, un uptime check gratuito a `/health` y la alerta de presupuesto.
13. **Reversión.** API: redirigir el tráfico a la revisión anterior de Cloud Run. Web y admin: el rollback instantáneo de Vercel. Documentado en un runbook en `docs/`.
14. **Fuera del repo.** La creación de proyectos, cuentas de servicio, secretos, buckets, Atlas, Vercel y DNS la hace el autor a mano siguiendo el runbook. Ningún agente toca la nube ni los secretos.

## Consecuencias
* **Positivas**: Costo esperado de $0 al mes con un tope real. Sin llaves de larga duración en GitHub. Despliegues trazables y reversibles. Las funciones con IA se activan por configuración.
* **Negativas**: El mapeo de dominio está en vista previa y limita la región. Con `min-instances=0` hay arranques en frío. Atlas M0 queda expuesto a internet y sin respaldos propios. Vercel Hobby es solo para uso personal: un uso comercial exigiría el plan de pago. Una sola instancia no tolera picos grandes de tráfico.
