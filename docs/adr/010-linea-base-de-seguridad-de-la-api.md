# ADR-010: Línea Base de Seguridad de la API
* Estado: Aprobado — complementado por ADR-011 y ADR-016
* Fecha: 2026-11-02
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-005 (extiende el rate limiting a toda la API y define el resto de controles de seguridad)

## Contexto
ADR-005 define cookies `HttpOnly`, CORS y rate limiting solo en `/api/v1/auth/login`. La API será pública en internet, la consumen dos frontends y guarda contenido que se renderiza como HTML (posts en Markdown). Hace falta una línea base explícita contra inyección, abuso de endpoints, XSS, CSRF y fugas de información, para que cada endpoint nuevo la cumpla desde el primer PR en lugar de revisarla al final.

## Alternativas Consideradas
### Rate limiting global
* Opción A (Seleccionada): Token bucket en memoria por IP (`golang.org/x/time/rate`), con límites más estrictos en autenticación. Sin costo ni infraestructura extra. El límite es por instancia (misma limitación aceptada en ADR-005).
* Opción B: Cloud Armor. Descartada para el MVP: requiere un Load Balancer de pago delante de Cloud Run.
* Opción C: Contador compartido en MongoDB con TTL. Descartada para el MVP: agrega una escritura a la base por cada petición.

### Defensa contra XSS en el contenido de los posts
* Opción A (Seleccionada): La API guarda el Markdown tal cual y los frontends lo sanitizan al renderizar, con una allowlist de etiquetas. Es donde existe el riesgo (el navegador) y no se pierde el contenido original.
* Opción B: Sanitizar en la API al guardar. Descartada: altera el contenido de forma irreversible y no protege si un frontend renderiza de forma insegura.

## Decisión
1. **Inyección NoSQL**
   * Los cuerpos y parámetros se decodifican solo en los tipos generados por oapi-codegen (ADR-007), nunca en `map[string]any` ni en `bson.M` construidos desde la entrada del usuario.
   * Los filtros de Mongo se construyen en `repository` solo con valores tipados. Prohibidos `$where`, `$function`, `$accumulator` y cualquier operador que ejecute JavaScript.
   * Una búsqueda por texto del usuario se escapa con `regexp.QuoteMeta` o usa índices de texto.
   * Los IDs se validan como `ObjectID` antes de consultar; un ID inválido responde 404, no 500.
2. **Rate limiting** (complementa ADR-005)
   * Límite global por IP en todas las rutas de `/api/v1`, y límites más estrictos en `/auth/login` y `/auth/refresh`. Los valores por defecto viven en `config` y se ajustan por variable de entorno.
   * El login además limita los intentos fallidos por email, para frenar ataques distribuidos contra una sola cuenta.
   * Al exceder el límite: `429` en `application/problem+json` con cabecera `Retry-After`.
   * La IP del cliente se obtiene solo a través de proxies de confianza configurados en Gin; un `X-Forwarded-For` enviado por el cliente no debe permitir evadir el límite. Se verifica con un test y en el primer despliegue en Cloud Run.
   * Las entradas inactivas se eliminan de memoria para que el limitador no crezca sin control.
3. **Límites de recursos**
   * Tamaño máximo del cuerpo de petición (1 MB por defecto) con `http.MaxBytesReader`.
   * Paginación con `maximum` declarado en `openapi.yaml`; ningún listado devuelve colecciones completas.
   * Se mantienen los timeouts del servidor HTTP ya definidos.
4. **XSS**
   * La API solo responde JSON con `Content-Type` correcto y `X-Content-Type-Options: nosniff`.
   * El Markdown de los posts se sanitiza al renderizar en `apps/web` y `apps/admin` con una allowlist. Nunca se inserta HTML sin sanitizar (en Angular, nada de `bypassSecurityTrustHtml` sobre contenido de usuario).
   * La Content-Security-Policy de cada frontend se define en su propio ADR.
5. **Cabeceras de seguridad de la API**: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` y `Cache-Control: no-store` en las respuestas de autenticación.
6. **CSRF y CORS**
   * Cookies con `SameSite=Strict` (ADR-005), y además verificación de la cabecera `Origin` contra la allowlist en todos los métodos que cambian estado.
   * CORS con lista exacta de orígenes, sin comodines, con `AllowCredentials`.
7. **JWT**
   * Algoritmo fijo `HS256`; cualquier otro `alg` (incluido `none`) se rechaza con `jwt.WithValidMethods`.
   * Secreto de al menos 32 bytes aleatorios, desde Secret Manager en producción.
   * Se validan `exp`, `iat`, `iss` y `aud`.
8. **Secretos**: nunca en el repositorio. `.env` local ignorado por git; Secret Manager en producción. GitHub secret scanning con push protection activado.
9. **Análisis continuo**: `gosec` en golangci-lint, `govulncheck` en CI, Dependabot (alertas y actualizaciones de seguridad) y CodeQL para Go y TypeScript.
10. **Logs**: nunca contraseñas, hashes, tokens, cookies ni emails. Los errores 5xx no exponen su causa al cliente (ya implementado con problem+json).
11. **Contenedor**: imagen distroless (ADR-004) ejecutada con usuario no root.

## Consecuencias
* **Positivas**: Cada endpoint nuevo tiene una lista de verificación de seguridad desde su primer PR. La superficie de inyección queda limitada por los tipos generados del contrato. El abuso de endpoints se frena sin costo de infraestructura.
* **Negativas**: El rate limiting no es global entre instancias de Cloud Run y se reinicia al escalar a cero. Cada frontend debe implementar su propia sanitización y CSP. Hay más middleware que mantener y probar, y los límites por defecto necesitarán ajuste con tráfico real.
