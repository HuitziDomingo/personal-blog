# ADR-032: Cambio y restablecimiento de la contraseña del admin
* Estado: Propuesto
* Fecha: 2026-11-26
* Autor: León Nieves Huitzitzili Domingo (borrador de Claude para su revisión)
* Complementa: ADR-005 (sesión con JWT y refresh tokens), ADR-010 (línea base de seguridad)

## Contexto
La contraseña del admin solo se fija una vez: el bootstrap de ADR-005 la toma de `INITIAL_ADMIN_PASSWORD` cuando la colección `users` está vacía. Con la API en producción (ADR-025), no hay forma de cambiarla desde el admin ni de recuperarla si se olvida o se filtra: cambiar la variable no hace nada si ya hay usuarios.

La sesión tiene dos piezas (ADR-005): un JWT de acceso de 15 minutos que la API valida sin consultar la base, y refresh tokens de 7 días guardados como hash, agrupados en familias (una por login). Cambiar la contraseña sin tocar la sesión dejaría dentro, por hasta 7 días, a quien ya tuviera una sesión robada.

El blog tiene un solo usuario y no envía correos, así que no hay «olvidé mi contraseña» por email.

## Alternativas consideradas
**Sesiones al cambiar la contraseña:**
* Opción A: revocar todas las familias menos la de la sesión actual. La API tendría que identificar la familia actual por el refresh token de la cookie. Si quien cambia la contraseña lo hace porque sospecha que le robaron esa cookie, la sesión robada sigue viva.
* Opción B (Seleccionada): revocar todos los refresh tokens del usuario, también el de la sesión actual, y abrir una sesión nueva para quien la cambió en la misma respuesta. Para el usuario es lo mismo que A (sigue dentro), pero no depende de cuál cookie traiga la petición, y una copia de la cookie actual también deja de servir.
* Opción C: revocar todo y obligar a iniciar sesión de nuevo. Igual de seguro que B, con un paso más para el usuario sin ganar nada.

**JWT de acceso ya emitidos:**
* Opción A (Seleccionada): aceptar que sigan valiendo hasta que vencen (15 minutos como mucho). Sin el refresh token no se renuevan.
* Opción B: guardar `passwordChangedAt` en el usuario y rechazar los JWT con `iat` anterior. Obliga a leer el usuario en cada petición autenticada, que hoy no toca la base. Si un caso real lo pide, se agrega con otro ADR; mientras, el runbook explica cómo cortarlos ya rotando `JWT_SECRET`.

**Recuperación sin acceso al admin:**
* Opción A: «olvidé mi contraseña» por email. Descartada: no hay correo saliente, y agrega un endpoint público que se puede atacar.
* Opción B: cambiar `INITIAL_ADMIN_PASSWORD` y que el bootstrap la reescriba. Descartada: el bootstrap no debe tocar usuarios existentes (ADR-005), y la contraseña viviría en una variable del servicio.
* Opción C (Seleccionada): un comando que se corre a mano contra el MongoDB, con la URI de Secret Manager.

## Decisión
1. **Endpoint `POST /api/v1/auth/password`**, con `accessCookie`. Recibe la contraseña actual y la nueva. Comprueba la actual con bcrypt. Una actual incorrecta responde 400 y no 401: la sesión es válida, y un 401 haría que el admin intente renovarla y la cierre. `detail` distingue el motivo.
2. **Reglas de la contraseña nueva:** al menos 14 caracteres, contados como caracteres y no como bytes; como mucho 72 bytes en UTF-8, el límite de bcrypt; distinta de la actual. El contrato valida 14 a 72 caracteres, y el service valida además los bytes y que sea distinta. El bootstrap del admin inicial conserva su mínimo de 12: solo corre una vez, y subirlo rompería `.env` existentes sin ganancia.
3. **Hash:** bcrypt con `bcrypt.DefaultCost`, el mismo algoritmo y costo del bootstrap (ADR-002). Solo se guarda el hash.
4. **Sesiones (opción B):** al cambiarla, la API revoca todos los refresh tokens vigentes del usuario (`RevokeAllForUser`, con índice en `user_id`) y responde 204 con las cookies de una sesión nueva. Los JWT de acceso de otros dispositivos vencen solos en 15 minutos como mucho.
5. **Rate limit propio:** 5 intentos por usuario cada 15 minutos, salgan bien o mal, además del límite por usuario de ADR-016. Sin sesión, el bucket es por IP. Va antes de leer el cuerpo, así que cada intento rechazado también cuenta.
6. **Auditoría:** cada cambio y cada rechazo dejan un log con `audit=password_change`, el id del usuario y el motivo (`incorrect_current_password`, `unchanged`, `invalid_new_password`) o el número de sesiones revocadas. Nunca la contraseña, el hash, tokens ni el email (ADR-010, punto 10). Si la contraseña se guardó pero la revocación falló, el log lo dice como error.
7. **Admin:** pantalla *Perfil* (`/profile`), enlazada como «Cambiar contraseña» en la sección Perfil del menú, con confirmación de la nueva, medidor de fuerza orientativo (la API solo exige el largo) y mensajes en regiones `alert` y `status`.
8. **Comando de emergencia `cmd/reset-admin-password`** (`make reset-admin-password`):
   * Lee el email y la contraseña nueva (dos veces) de la terminal sin eco, con `golang.org/x/term`. Nunca por argumento ni variable de entorno, para que no queden en la lista de procesos ni en el historial. Si stdin no es una terminal, no arranca.
   * La URI llega en `TARGET_MONGO_URI`, sin valor por defecto, y no se imprime. La base, en `TARGET_DB`.
   * Por defecto es un simulacro: comprueba que el usuario existe y que la contraseña cumple las reglas. Con `DRY_RUN=0` guarda el hash y revoca todos los refresh tokens del usuario.
   * Usa el mismo caso de uso que el endpoint para validar y guardar, así las reglas no se separan.
   * El procedimiento está en `docs/runbooks/recuperar-acceso-admin.md`.

## Consecuencias
* **Positivas**: León puede cambiar la contraseña desde el admin y recuperarla sin tocar Atlas a mano. Una sesión robada deja de renovarse en cuanto se cambia la contraseña. El comando reutiliza las reglas y el hash del endpoint.
* **Negativas**: durante hasta 15 minutos, un JWT de acceso robado sigue valiendo después del cambio; cortarlo antes exige rotar `JWT_SECRET`, que cierra todas las sesiones. El rate limit vive en memoria por instancia, como los demás (ADR-010). Una dependencia nueva, `golang.org/x/term`, del proyecto Go. Si la revocación falla después de guardar el hash, la contraseña queda cambiada con las sesiones vivas: la API responde 500 y lo registra; correr el comando de emergencia con otra contraseña las revoca.
