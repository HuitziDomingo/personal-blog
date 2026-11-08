# ADR-017: Arquitectura de la Web Pública (Next.js)
* Estado: Aprobado — punto 3 reemplazado por ADR-020
* Fecha: 2026-11-07
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-001 (detalla `apps/web`), ADR-007, ADR-010 y ADR-011 (decisiones delegadas al ADR de `apps/web`)

## Contexto
`apps/web` es el sitio público de `huitzi.xyz`: portafolio y blog. Reemplaza al repositorio actual (`next-chakraUI`: Next 12, Chakra v1, JavaScript, Pages Router). El spike #53 probó Next 16 con App Router, Chakra v3 y `fetch` nativo contra la API local. ADR-011 exige que la web no haga que todos sus visitantes compartan el cupo de rate limit de las IPs de Vercel, y ADR-010 delega en cada frontend su CSP y la sanitización del Markdown. La documentación de Next.js indica que una CSP con nonces obliga a renderizar cada petición en el servidor y desactiva el ISR.

## Alternativas Consideradas
### Lenguaje
* Opción A (Seleccionada): TypeScript estricto. Los tipos del contrato (`packages/api-types`, ADR-007) se verifican en compilación.
* Opción B: JavaScript con JSDoc y `// @ts-check`. Descartada: verifica tipos, pero más débil y menos habitual que TypeScript en un monorepo que ya lo usa.
* Opción C: JavaScript sin tipos. Descartada: un cambio del contrato rompería la web en producción y no en el CI.

### Renderizado
* Opción A (Seleccionada): ISR (generación estática con revalidación por tiempo). Los visitantes reciben páginas en caché y casi no llegan a la API.
* Opción B: Renderizado dinámico en cada petición. Descartada: cada visita llama a la API desde las IPs de Vercel (ADR-011) y aumenta costo y latencia.

### CSP de scripts
* Opción A (Seleccionada): Sin nonces, con `script-src 'self' 'unsafe-inline'` y el resto de directivas estrictas. Compatible con ISR.
* Opción B: Nonces generados en `proxy.ts`. Descartada: obliga al renderizado dinámico y desactiva el ISR.
* Opción C: SRI experimental de Next.js. Descartada por ahora por ser experimental; se reevalúa cuando sea estable.

### Sanitización del Markdown
* Opción A (Seleccionada): Paquete compartido `packages/markdown` con la allowlist y la política de URLs del admin, usando el mismo motor (marked + DOMPurify) en las dos apps; en el servidor, DOMPurify sobre un DOM de jsdom.
* Opción B: Allowlist duplicada en cada app. Descartada: tarde o temprano divergen, y la web podría quedar más permisiva que el admin.
* Opción C: Otro sanitizador en el servidor (por ejemplo sanitize-html). Descartada: otro motor puede interpretar distinto el mismo HTML.

## Decisión
1. **Stack**: Next.js (última estable con más de 7 días, ADR-013), App Router, React y TypeScript estricto. Chakra UI v3 para la interfaz.
2. **Datos**: solo `fetch` nativo hacia la API con la revalidación de Next; sin axios ni TanStack Query. Tipos de `packages/api-types`. URL de la API por variable de entorno.
3. **Renderizado**: ISR con revalidación de 60 segundos en la lista y en cada post. Los posts publicados se pregeneran en el build. Un slug que no cumple el patrón del contrato responde 404 sin llamar a la API.
4. **CSP** (cabeceras desde `next.config`): `script-src 'self' 'unsafe-inline'`; `style-src 'self' 'unsafe-inline'` (Chakra/Emotion inyecta estilos); `default-src 'self'`; `img-src 'self' https: data:`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `upgrade-insecure-requests`. Además `X-Content-Type-Options: nosniff` y `Referrer-Policy: strict-origin-when-cross-origin`.
5. **Markdown**: `packages/markdown` es la única fuente de la allowlist, la política de URLs y el render (ADR-012, punto 6). El admin migra a ese paquete. El HTML se sanitiza en el servidor antes de enviarlo al navegador.
6. **Despliegue**: Vercel, con `apps/web` como raíz del proyecto, pnpm y Node 24, en `huitzi.xyz`. Sustituye al despliegue de `next-chakraUI` cuando la web nueva tenga el contenido del inventario.
7. **CI**: job `web` con su filtro en `changes` (ADR-014): `apps/web/**`, `packages/**`, lockfile, configuración del workspace y `ci.yml`. Lint, typecheck, tests y build.

## Consecuencias
* **Positivas**: Los visitantes no dependen de la API ni comparten cupo de rate limit. Un cambio del contrato rompe el CI de la web. Admin y web sanitizan exactamente igual.
* **Negativas**: `'unsafe-inline'` en `script-src` debilita la CSP frente a XSS; se acepta porque la web no recibe entrada de usuarios y el único contenido dinámico es Markdown del autor, sanitizado en el servidor. Un post nuevo tarda hasta 60 segundos en aparecer. jsdom aumenta el tamaño de la función del servidor. Cualquier slug inventado que cumpla el patrón llega a la API y genera una entrada de caché 404.
