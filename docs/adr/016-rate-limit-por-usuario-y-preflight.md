# ADR-016: Rate Limit por Usuario Autenticado y Exclusión de Preflight CORS
* Estado: Aprobado
* Fecha: 2026-11-07
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-010 y ADR-011 (punto de rate limiting)

## Contexto
ADR-010 aplica un límite global por IP (60/min, ráfaga 20) a toda `/api/v1`, igual para tráfico anónimo y autenticado. Los E2E (BLOG-061) mostraron que una sola sesión normal del admin hace ráfagas de unas 30 peticiones en segundos y recibe `429` por la ráfaga de 20 por IP. Por otro lado, las peticiones `OPTIONS` de preflight CORS hoy no consumen ese límite, porque el middleware de CORS las responde y corta la cadena antes del rate limiter; pero por lo mismo no tienen ningún límite. El límite actual castiga al único usuario legítimo del admin y deja el preflight sin control.

## Alternativas Consideradas
### Preflight CORS
* Opción A (Seleccionada): Darle al preflight su propio límite por IP, generoso, sin consumir el límite global. Se responde antes de tocar la base de datos, así que es barato, pero queda acotado.
* Opción B: Dejarlo como hoy, excluido y sin límite. Descartada: deja una vía sin control para inundar el servidor.
* Opción C: Contarlo contra el límite global. Descartada: el navegador lo envía antes de cada petición que cambia estado sin acción del usuario, y gastaría su cupo.

### Tráfico autenticado
* Opción A (Seleccionada): Con un access token válido, el límite se lleva por usuario (`sub` del JWT) y es más alto. Sin token válido, se mantiene el límite por IP.
* Opción B: Subir el límite global por IP para todos. Descartada: también lo sube para el tráfico anónimo, que es el que hay que acotar.
* Opción C: Eximir por completo al tráfico autenticado. Descartada: una sesión robada o un bug del admin podrían saturar la API.

## Decisión
1. **Preflight**: las peticiones `OPTIONS` se siguen resolviendo en el middleware de CORS sin consumir el límite global, pero pasan por un bucket propio por IP (por defecto 120/min, ráfaga 60).
2. **Autenticados**: el rate limiter valida el access token con las mismas reglas de ADR-011 (HS256, `exp`, `iss`, `aud`). Si es válido, usa un bucket por usuario (por defecto 300/min, ráfaga 100). Un token inválido, vencido o ausente cae en el bucket por IP: nunca da más cupo.
3. **Anónimos**: sin cambios (60/min, ráfaga 20 por IP).
4. **Auth**: los límites de `/auth/login` y `/auth/refresh` por IP, y el de intentos fallidos por email, no cambian.
5. Todos los valores se configuran por variables de entorno, como en ADR-010.
6. El orden de los middlewares de ADR-010 se mantiene; la validación del token para elegir bucket no sustituye a la autenticación de las rutas protegidas.

## Consecuencias
* **Positivas**: El admin deja de recibir `429` en uso normal. El tráfico anónimo sigue igual de acotado. El preflight, que hoy no tiene límite, queda acotado sin gastar el cupo global.
* **Negativas**: El rate limiter verifica la firma del token en cada petición autenticada (una operación HMAC barata, pero extra). Hay tres buckets que configurar y probar. Los límites siguen siendo por instancia de Cloud Run (ADR-010).
