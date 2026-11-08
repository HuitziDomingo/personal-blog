# ADR-012: Arquitectura del Dashboard de Administración (Angular)
* Estado: Aprobado — punto del editor (textarea con vista previa) reemplazado por ADR-018
* Fecha: 2026-11-02
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-001 (detalla `apps/admin`), ADR-005 y ADR-010/011 (flujo de sesión, CSP y sanitización del lado del admin)

## Contexto
ADR-001 define `apps/admin` con Angular, Spartan UI y Tailwind CSS, pero no su arquitectura interna, su hosting ni cómo consume la API. El admin lo usa un solo usuario (el autor) para iniciar sesión y gestionar posts. Es el primer consumidor del flujo de cookies de ADR-005, y ADR-010/011 delegan en cada frontend la Content-Security-Policy y la sanitización del Markdown. La API se servirá bajo un subdominio de `huitzi.xyz` (ADR-011), y la cookie `SameSite=Strict` exige que el admin también viva bajo ese dominio. Se prioriza la estabilidad sobre lo más nuevo.

## Alternativas Consideradas
### Hosting
* Opción A (Seleccionada): Vercel, como sitio estático en `admin.huitzi.xyz`. Ya se usa para `apps/web`, no suma proveedor y permite cabeceras (CSP) por configuración.
* Opción B: Firebase Hosting. Descartada: suma un proveedor y otra configuración de dominio sin una ventaja concreta.
* Opción C: Cloud Storage con Load Balancer. Descartada: el Load Balancer tiene costo fijo.
* Opción D: Contenedor en Cloud Run con nginx. Descartada: servidor y contenedor que mantener para servir archivos estáticos.

### Estado
* Opción A (Seleccionada): Signals de Angular en servicios inyectables.
* Opción B: NgRx SignalStore. Descartada: un solo usuario y pocas pantallas no justifican la capa adicional.

### Cliente HTTP
* Opción A (Seleccionada): `HttpClient` de Angular tipado con `packages/api-types` (ADR-007). Sus interceptores resuelven credenciales, refresh y errores en un solo lugar.
* Opción B: `openapi-fetch`. Descartada: tipado más automático, pero obliga a reimplementar fuera de Angular lo que dan los interceptores.

### Editor de Markdown
* Opción A (Seleccionada): `textarea` con vista previa renderizada y sanitizada.
* Opción B: Editor enriquecido (Milkdown, TipTap). Descartada para el MVP: más dependencias y más superficie de XSS.

### Entorno local
* Opción A (Seleccionada): Admin en `localhost:4200` y API en `localhost:8080`, como orígenes distintos. Reproduce el caso real de producción (CORS, credenciales y verificación de `Origin`).
* Opción B: Proxy de desarrollo de Angular hacia la API. Descartada: simplifica el arranque pero oculta en local los problemas de CORS que aparecerían en producción.

## Decisión
1. **Versión y modo**
   * La major estable más reciente de Angular que soporte `spartan/ui` 1.x, verificada al crear el proyecto y fijada con versión exacta en `package.json`. Al 2026-11-03 es Angular 22. `@angular/build` debe ser 22.1.5 o posterior, que conserva `integrity` y `crossorigin` en el loader de `autoCsp` (angular-cli#33844).
   * Zoneless (el modo por defecto desde Angular 21), componentes standalone y signals.
   * Formularios con Reactive Forms. Las APIs experimentales (Signal Forms, `httpResource` u otras) no se usan mientras no sean estables en la versión elegida.
2. **UI**: `spartan/ui` (brain como dependencia, helm copiado al proyecto) y Tailwind CSS. El estilo visual (BLOG-017) se define aparte. El CLI de Spartan no entra al repo, porque arrastra Nx (ADR-004 lo descartó) y Nx ya sufrió versiones maliciosas publicadas en npm. Los componentes helm se generan con el CLI en un proyecto Angular temporal fuera del repo, de la misma versión, y se copian a `shared/ui/`. Entran `@spartan-ng/brain` y las dependencias que importan los componentes helm copiados (por ejemplo `class-variance-authority`, `clsx`, `tailwind-merge` y `@ng-icons/*`), cada una justificada en su PR. Los alias `@spartan-ng/helm/*` en `tsconfig` y el tema de Tailwind, que el CLI configuraría solo, se replican a mano.
3. **Estructura** de `apps/admin/src/app`:
   * `core/`: sesión, interceptores, guards y configuración.
   * `features/auth/` y `features/posts/`: pantallas con carga diferida por ruta.
   * `shared/ui/`: componentes helm de Spartan y componentes propios reutilizables.
4. **Consumo de la API**
   * Tipos importados solo de `packages/api-types`; ningún tipo de la API se escribe a mano.
   * Un interceptor agrega `withCredentials` a todas las peticiones hacia la API.
   * Ante un `401`, un interceptor llama una sola vez a `/api/v1/auth/refresh` y reintenta la petición original. Las peticiones que fallen mientras el refresh está en curso esperan a ese mismo refresh (single-flight), para no disparar rotaciones concurrentes del refresh token. Si el refresh falla, se limpia la sesión y se redirige al login.
   * Los errores `application/problem+json` se traducen a mensajes en español en el admin (la API responde en inglés, según CLAUDE.md).
5. **Sesión**
   * La cookie es `HttpOnly`, así que el admin no puede leerla. El contrato agrega `GET /api/v1/auth/me`, que devuelve el usuario autenticado o `401`. El admin lo consulta al arrancar para saber si hay sesión.
   * Las rutas protegidas usan guards funcionales (`CanMatchFn`) basados en el estado de sesión.
6. **Markdown y XSS** (ADR-010, punto 4)
   * La vista previa convierte Markdown con `marked` y sanitiza el HTML con DOMPurify y una allowlist explícita de etiquetas y atributos.
   * El resultado se enlaza con `[innerHTML]`, que además pasa por el sanitizador de Angular. Prohibido `bypassSecurityTrust*` sobre contenido de usuario.
7. **Content-Security-Policy**: dividida en dos partes, porque el navegador aplica todas las políticas presentes y un recurso debe cumplir cada una.
   * **Scripts, con `autoCsp` de Angular**: en el build genera un `<meta>` con `script-src` basado en hashes y `'strict-dynamic'`, sin `'unsafe-inline'`.
   * **Cabecera de Vercel, sin `default-src` ni `script-src`**: si los incluyera, bloquearía el script inline que inyecta `autoCsp`, como advierte la documentación de Angular. Como no hay `default-src`, cada directiva se declara de forma explícita:
     `connect-src` limitado al origen de la API; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: https:`; `font-src 'self'`; `media-src 'none'`; `frame-src 'none'`; `worker-src 'self'`; `manifest-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'` (solo funciona en la cabecera; en un `<meta>` se ignora).
   * `style-src` admite `'unsafe-inline'`, porque los estilos de componentes se inyectan en línea y un sitio estático no puede generar nonces por petición. Se acepta como riesgo menor.
   * **Trusted Types solo en modo de reporte**: el loader que genera `autoCsp` asigna `script.src` con un string, sin política de Trusted Types, así que exigirlos bloquearía la carga del admin. Se envía `Content-Security-Policy-Report-Only: require-trusted-types-for 'script'; trusted-types angular angular#bundler dompurify` para detectar violaciones sin romper nada. Se pasa a modo obligatorio con un ADR nuevo cuando Angular lo soporte junto con `autoCsp`.
   * Además: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y `X-Robots-Tag: noindex` (el admin no debe indexarse).
   * Se valida en un preview de Vercel, antes de producción, que la consola no muestre violaciones de CSP aparte de las de Trusted Types que reporta el loader de `autoCsp`. Sin `report-to`, los reportes solo llegan a la consola del navegador.
8. **Testing** (ADR-003): Vitest con Testing Library para servicios, interceptores, guards y componentes. Playwright para el flujo crítico.
9. **CI**: job `admin` en `ci.yml` con su filtro en el job `changes` (ADR-008, BLOG-021), con lint, tests y build.

## Consecuencias
* **Positivas**: El admin reproduce en local el escenario de producción. Los tipos no pueden divergir del contrato. El refresh concurrente no rompe la rotación de tokens. La superficie de XSS queda reducida a una vista previa sanitizada dos veces.
* **Negativas**: `style-src 'unsafe-inline'` debilita la CSP para estilos. La CSP queda repartida entre el `<meta>` del build y la cabecera de Vercel, así que un cambio en una puede romper la otra. Trusted Types no se exige, solo se reporta. Generar los componentes helm fuera del repo es un paso manual al agregar cada componente, y los alias de `tsconfig` y el tema de Tailwind se mantienen a mano. El contrato y la API necesitan un endpoint nuevo (`/auth/me`). El interceptor de refresh es lógica delicada que exige tests propios. Las APIs nuevas de Angular quedan fuera hasta que sean estables, aunque simplificarían código.
