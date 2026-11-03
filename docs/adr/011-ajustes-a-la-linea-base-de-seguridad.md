# ADR-011: Ajustes a la Línea Base de Seguridad
* Estado: Aprobado
* Fecha: 2026-11-02
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-010 (agrega reglas a sus puntos 2, 3, 5, 6 y 7, sin reemplazar ninguna)

## Contexto
La verificación técnica de ADR-010 dejó puntos sin resolver. Gin confía en todos los proxies por defecto, y `SetTrustedProxies(nil)` haría que todos los clientes parezcan el mismo. La documentación de Cloud Run no describe `X-Forwarded-For`. ADR-010 tampoco define qué hacer con peticiones sin `Origin` ni dónde se sirve la API, y en `golang-jwt/v5` `exp` es opcional por defecto.

## Alternativas Consideradas
### Peticiones sin `Origin`
* Opción A (Seleccionada): Permitirlas. Los navegadores lo envían en los métodos que cambian estado, y curl y Bruno siguen funcionando.
* Opción B: Rechazarlas. Descartada: rompe curl y Bruno sin proteger a ningún navegador.

### IP real del cliente en Gin
* Opción A (Seleccionada): `SetTrustedProxies` solo con el rango del par directo de Cloud Run.
* Opción B: Configuración por defecto. Descartada: un `X-Forwarded-For` falsificado evade el límite.
* Opción C: `SetTrustedProxies(nil)`. Descartada: todos los clientes comparten un mismo cupo.
* Opción D: `TrustedPlatform`. Descartada: no hay constante para Cloud Run.

### Carga de `GET /ready` sobre MongoDB
* Opción A (Seleccionada): Cachear el resultado del ping durante 5 segundos.
* Opción B: Un ping por petición. Descartada: el endpoint queda fuera del límite de `/api/v1` y se podría usar para cargar la base.

## Decisión
1. **Rate limiting** (ADR-010, punto 2)
   * La configuración de proxies confiables solo acepta el rango del par directo de Cloud Run, tomado de configuración, y limita `RemoteIPHeaders` a `X-Forwarded-For`. No se usa `TrustedPlatform`. El rango se mide y confirma en el primer despliegue.
   * `apps/web` consultará la API desde servidores de Vercel que comparten IP; el ADR de `apps/web` debe resolverlo (por ejemplo con ISR) para que los visitantes no compartan un mismo cupo.
2. **Límites de recursos** (ADR-010, punto 3)
   * `GET /ready` cachea el resultado del ping a MongoDB durante 5 segundos, para que no se pueda usar para cargar la base.
3. **Cabeceras** (ADR-010, punto 5)
   * Cloud Run puede reescribir `Cache-Control` cuando hay `Set-Cookie`; se verifica en el primer despliegue.
4. **CSRF y CORS** (ADR-010, punto 6)
   * Métodos que cambian estado con un `Origin` fuera de la allowlist: `403`. Sin `Origin`: se permiten, porque los navegadores siempre lo envían en esos métodos y el CSRF requiere un navegador; así funcionan curl y Bruno.
   * La API se sirve bajo un subdominio de `huitzi.xyz` para que `SameSite=Strict` funcione; el mecanismo de dominio se decide en el ADR de despliegue.
5. **JWT** (ADR-010, punto 7)
   * Se usan `WithValidMethods([HS256])`, `WithExpirationRequired`, `WithIssuedAt`, `WithIssuer` y `WithAudience`; un token sin `exp` se rechaza.

## Consecuencias
* **Positivas**: BLOG-034 y BLOG-012 pueden implementarse sin decisiones abiertas sobre la IP real, `Origin` o los JWT.
* **Negativas**: El rango de proxies y el `Cache-Control` quedan sin confirmar hasta el primer despliegue. `/ready` puede tardar hasta 5 segundos en reflejar una caída de MongoDB. El ADR de `apps/web` y el de despliegue heredan una decisión pendiente cada uno.
