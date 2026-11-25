# ADR-031: DNS de huitzi.xyz en Vercel
* Estado: Propuesto
* Fecha: 2026-11-25
* Autor: León Nieves Huitzitzili Domingo (borrador de Claude para su revisión)
* Corrige: ADR-025, punto 1 (registros DNS en DreamHost)

## Contexto
ADR-025, punto 1, dice que los registros DNS de `huitzi.xyz`, `admin.huitzi.xyz` y `api.huitzi.xyz` viven en DreamHost. Al desplegar, León encontró que los nameservers de `huitzi.xyz` son los de Vercel: el DNS del dominio se administra en Vercel, y los registros que se creen en DreamHost no tienen efecto.

El runbook de despliegue (BLOG-134) seguía a ADR-025 y pedía crear en DreamHost el `TXT` de verificación de Google Search Console y el `CNAME` de `api` hacia `ghs.googlehosted.com.` (BLOG-160 lo corrige). Los ADRs aprobados no se editan, así que la corrección va en este ADR.

## Alternativas Consideradas
* Opción A (Seleccionada): dejar el DNS en Vercel, como ya está. Vercel crea solo los registros de los dominios que se asignan a sus proyectos (web y admin), y los demás (`TXT` de verificación y `CNAME` de la API) se agregan en *Vercel → Domains → DNS Records*.
* Opción B: volver a los nameservers de DreamHost, como decía ADR-025. Descartada: obliga a mover un DNS que ya funciona, a crear a mano los registros de Vercel y a esperar la propagación. No aporta nada.
* Opción C: un DNS aparte (por ejemplo, Cloudflare o Cloud DNS). Descartada: una cuenta o un servicio más, y Cloud DNS tiene costo por zona.

## Decisión
1. **El DNS de `huitzi.xyz` se administra en Vercel** (nameservers de Vercel). Reemplaza «con los registros DNS en DreamHost» de ADR-025, punto 1. El resto del punto no cambia: `huitzi.xyz` → web, `admin.huitzi.xyz` → admin, `api.huitzi.xyz` → API, el mismo sitio para las cookies `SameSite=Strict` de ADR-005.
2. **Registros a mano en Vercel:** el `TXT` `google-site-verification=…` en la raíz, para la propiedad de tipo **Dominio** de Search Console que exige el mapeo de dominio de Cloud Run (ADR-025, punto 2), y el `CNAME` `api` → `ghs.googlehosted.com.`
3. **Registros de la web y el admin:** los crea Vercel al asignar cada dominio a su proyecto. No se escriben a mano.
4. **DreamHost** queda como registrador del dominio, sin papel en el DNS.

## Consecuencias
* **Positivas**: el ADR coincide con la realidad. Un solo panel para el DNS y para los dominios de la web y el admin. Vercel mantiene solos los registros de sus proyectos.
* **Negativas**: el DNS de la API depende de la cuenta de Vercel. Si algún día la web o el admin salen de Vercel, hay que mover los nameservers o recrear los registros en otro DNS antes de quitar el dominio de Vercel, o `api.huitzi.xyz` deja de resolver. Los registros de la API no se versionan en el repo; el runbook los documenta.
