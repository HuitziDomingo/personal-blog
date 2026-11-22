# ADR-026: Portadas de Posts Generadas con IA
* Estado: Aprobado — parcialmente reemplazado por ADR-029 (punto 8)
* Fecha: 2026-11-17
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-021 (asistente de escritura; aquí se decide su punto 1, imágenes fuera de alcance) y ADR-017 (web pública)

## Contexto
ADR-021 dejó la generación de imágenes para una fase 2. El admin ya tiene un botón de sugerencia de portada que devuelve una idea en texto (descripción y texto alternativo) sin proveedor real. Se quiere generar la imagen de portada de un post a partir de su contenido, con la misma regla de costo de $0.

La investigación (noviembre de 2026) encontró que la API de Gemini ya no genera imágenes en el plan gratuito: la opción más barata cuesta alrededor de $0,034 por imagen y requiere facturación. Cloudflare Workers AI incluye 10 000 neuronas diarias gratis en su plan Free, y en ese plan no cobra al pasar el límite. El modelo FLUX.1 [schnell] tiene licencia Apache-2.0, que permite uso comercial. Los términos de servicio de Black Forest Labs no reclaman la propiedad de las imágenes generadas. Cloudflare declara retención cero de datos; los términos de servicio de Black Forest Labs (sec. 1.2(e)) permiten entrenar con entradas y salidas salvo exclusión por correo; no está claro cuál rige las llamadas a través de Cloudflare.

## Alternativas Consideradas
### Proveedor de imágenes
* Opción A (Seleccionada): Cloudflare Workers AI con `flux-1-schnell` en el plan Workers Free. Costo de $0 garantizado: en ese plan pasar el límite no genera cargos. Se llama por REST desde Go, sin SDK.
* Opción B: Gemini o Imagen de pago. Descartada: rompe la regla de $0 y exige facturación en el proyecto de la clave de Gemini.
* Opción C: Hugging Face u otros planes gratuitos. Descartada por ahora: límites menos claros o modelos con licencias más restrictivas.

### Almacenamiento
* Opción A (Seleccionada): Google Cloud Storage en el proyecto de la API, junto a los respaldos. La web cachea las imágenes con `next/image`.
* Opción B: Cloudflare R2. Descartada: suma un segundo proveedor de almacenamiento sin necesidad.
* Opción C: Vercel Blob. Descartada: escribir desde Cloud Run exige un token de Vercel, y al superar el límite el almacén se bloquea 30 días, dejando la web sin portadas.

## Decisión
1. **Flujo (workflow, no agente).** Primero, el Gemini de texto gratuito (ADR-021) propone la idea de la portada: un tema y el texto alternativo, con salida estructurada. Segundo, la API arma el prompt de imagen con una plantilla cerrada y ese tema, y llama a `flux-1-schnell`. Sin herramientas y sin reintentos.
2. **Primer paso.** Se conecta la sugerencia de portada en texto que ya existe en el admin (`suggestCover`) al Gemini real, antes de generar imágenes.
3. **Puertos.** `ImageGenerator` (adaptadores: Cloudflare y fake) e `ImageStore` (adaptadores: GCS y disco local para desarrollo) en el dominio. Ningún test ni el CI llaman a proveedores reales.
4. **Revisión humana.** La imagen generada se devuelve al admin como vista previa y no se guarda. Solo al aceptarla se sube a GCS y se asigna al post. Nada se publica sin aceptarla.
5. **Modelo de datos.** El post suma un campo `cover` opcional con la URL, el texto alternativo y si fue generada con IA. Un post sin portada se publica igual.
6. **Transparencia.** Una portada generada con IA muestra la leyenda «Imagen generada con IA» («AI-generated image» en inglés) en la web.
7. **Contenido.** La plantilla prohíbe personas reales, marcas, logotipos, estilos de artistas con nombre y texto dentro de la imagen. El tema que propone Gemini se valida (largo y caracteres) antes de usarlo. Las imágenes solo se generan a partir de posts del autor, nunca de comentarios ni de otra entrada de lectores. Como el modelo no documenta un filtro de seguridad, la revisión humana es la defensa.
8. **Límites.** Un bucket propio por usuario (por defecto 2 por minuto y 20 por día, configurable), timeout por llamada y un `503` claro si se agota la cuota. Tamaño de portada fijo (por ejemplo 1024 × 576) y formato webp al guardar.
9. **Almacenamiento y servicio.** Bucket de GCS solo con las portadas aceptadas, con lectura pública y escritura únicamente desde la cuenta de servicio de la API. La web las sirve con `next/image`. Ni la CSP de la web ni la del admin cambian, porque ya permiten imágenes `https:`.
10. **Configuración.** `IMAGES_ENABLED` es `false` por defecto. Con `true` y sin `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN` o el bucket configurado, la API no arranca. El token de Cloudflare tiene permisos solo para Workers AI y vive en Secret Manager; localmente, en `.env`.
11. **Condición previa.** Antes de activar la generación se leen los términos de Black Forest Labs enlazados por Cloudflare. Si restringen el uso comercial de las salidas, la generación queda apagada y se decide de nuevo. Además, antes de activar la generación: (a) León solicita la exclusión de entrenamiento a legal@blackforestlabs.ai, y (b) se leen la Usage Policy de BFL y la documentación de uso de datos de Workers AI de Cloudflare.

## Consecuencias
* **Positivas**: Portadas sin costo y sin servicios de pago. Ninguna CSP cambia. La imagen nunca se publica sin revisión. El proveedor se puede cambiar sin tocar el dominio.
* **Negativas**: Un proveedor y una cuenta más (Cloudflare). La cuota gratuita puede cambiar y la cifra de imágenes por día es una estimación. El modelo no documenta un filtro de contenido. Las imágenes generadas pueden parecerse a obras existentes o repetirse para otras personas.
