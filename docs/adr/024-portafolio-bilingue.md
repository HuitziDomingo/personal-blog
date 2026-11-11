# ADR-024: Portafolio Bilingüe (Español e Inglés)
* Estado: Aprobado
* Fecha: 2026-11-11
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-017 (web pública) y ADR-020 (pregeneración)

## Contexto
La web pública (ADR-017) está completa en español: textos, navegación y `<html lang="es">`. El portafolio es la carta de presentación de León para trabajo remoto con empresas de Canadá y Europa del Este, donde los reclutadores leen en inglés. El blog, en cambio, se escribe en español para la comunidad hispanohablante. Además, los textos del portafolio están desactualizados respecto al CV y LinkedIn.

## Alternativas Consideradas
### Alcance
* Opción A (Seleccionada): Portafolio bilingüe. Inicio, «Acerca de mí» y trabajos en español e inglés; los posts del blog se quedan en el idioma en que se escriben.
* Opción B: Solo español. Descartada: el portafolio no sirve para el objetivo profesional principal.
* Opción C: Todo en inglés. Descartada: se pierde el público del blog y del canal de YouTube.

### Rutas
* Opción A (Seleccionada): Español en la raíz, sin cambiar ninguna URL existente (`/`, `/works`, `/blog/...`), e inglés bajo `/en` (`/en`, `/en/works`, `/en/works/{id}`).
* Opción B: Prefijo para los dos idiomas (`/es`, `/en`). Descartada: rompe las URLs actuales e indexadas sin ganar nada.
* Opción C: Subdominio (`en.huitzi.xyz`). Descartada: más DNS, certificados y configuración de Vercel para un sitio pequeño.

### Implementación
* Opción A (Seleccionada): Diccionarios propios tipados, sin librería de i18n. Un archivo de contenido por idioma con el mismo tipo de TypeScript, así que una traducción faltante no compila.
* Opción B: Una librería de i18n (next-intl u otra). Descartada por ahora: dependencia nueva y middleware para dos idiomas y unas cuantas páginas.

## Decisión
1. **Rutas.** Español en la raíz con las URLs actuales; inglés bajo `/en` para inicio, trabajos y detalle de trabajo. El blog no se duplica: desde la versión en inglés, la navegación enlaza a `/blog` indicando que está en español.
2. **`lang` correcto.** Dos layouts raíz con grupos de rutas de Next, uno por idioma, para que cada página entregue su `<html lang>`. Sin cambiar `lang` desde el cliente.
3. **Contenido.** Un archivo por idioma (por ejemplo `lib/content/es.ts` y `lib/content/en.ts`) con el mismo tipo. Los componentes reciben el idioma o el diccionario; ningún texto visible queda fijo en un componente.
4. **Sin redirección automática.** No se redirige por `Accept-Language`, cookie ni geolocalización: las páginas siguen siendo estáticas o ISR (ADR-017 y ADR-020) y los buscadores ven siempre lo mismo. Un selector ES/EN visible en el header lleva a la página equivalente del otro idioma.
5. **SEO.** Cada página declara su canonical y sus alternativas `hreflang` (`es`, `en` y `x-default` hacia español). El sitemap incluye las dos versiones. La imagen Open Graph y la descripción van en el idioma de la página. El RSS sigue siendo solo del blog en español.
6. **Formato.** Fechas y números con `Intl` según el idioma de la página.
7. **Accesibilidad.** El selector es un link real con `hreflang` y `lang` en su texto («English», «Español»), con objetivo táctil de al menos 44 px.
8. **Textos.** Se reescriben una vez en los dos idiomas, alineados con el CV y LinkedIn (cargo, fechas y experiencia). Las traducciones pueden partir de un borrador hecho con un LLM, pero León aprueba cada texto antes del merge. Ningún dato inventado: lo que falte va como pendiente, no como suposición.
9. **Posts en inglés.** Fuera de alcance. El día que exista el primero, se decide en un ADR nuevo (por ejemplo, un campo de idioma en el contrato y un `/en/blog`).
10. **CSP.** No cambia.

## Consecuencias
* **Positivas**: El portafolio sirve para reclutadores internacionales sin romper ninguna URL. Una traducción faltante falla en el build. Sin dependencias nuevas ni middleware. Los textos quedan consistentes con el CV.
* **Negativas**: Cada cambio de texto del portafolio se hace en dos idiomas. Dos layouts raíz duplican algo de estructura. Un lector en inglés que entra al blog lo encuentra en español.
