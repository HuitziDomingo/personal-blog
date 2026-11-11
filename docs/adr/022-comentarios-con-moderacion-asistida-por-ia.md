# ADR-022: Comentarios en los Posts con Moderación Asistida por IA
* Estado: Aprobado
* Fecha: 2026-11-11
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-010 y ADR-016 (seguridad y rate limit), ADR-017 (web pública), ADR-021 (asistente de escritura y puerto de proveedor)

## Contexto
La web pública (ADR-017) muestra posts sin interacción. Se quiere que los lectores comenten cada post y que un LLM ayude a moderar. Es la primera entrada de texto de usuarios anónimos de internet al sistema, y ese texto va a llegar a un LLM, así que es a la vez un problema de spam, de privacidad y de prompt injection.

Restricciones:
* Costo de $0: el mismo proveedor y plan gratuito del ADR-021.
* Un solo moderador (León) y poco tráfico.
* Guardar los menos datos personales posibles.
* La API corre en Cloud Run (ADR por definir, BLOG-054), donde el trabajo en segundo plano después de responder no tiene CPU garantizada.

## Alternativas Consideradas
### Identidad de quien comenta
* Opción A (Seleccionada): Anónimo con nombre, sin correo. Lo mínimo para conversar; no hay datos personales que proteger salvo el texto.
* Opción B: Login con GitHub. Descartada para la v1: frena el spam, pero exige OAuth, sesiones de lectores y espanta a quien solo quiere preguntar.
* Opción C: Correo obligatorio con verificación. Descartada: datos personales, envío de correos y más superficie, para un blog con poco tráfico.

### Moderación
* Opción A (Seleccionada): Premoderación. El LLM clasifica y sugiere; nada se publica sin la aprobación de León.
* Opción B: Publicación automática cuando el LLM aprueba con alta confianza. Descartada para la v1: un LLM se puede engañar (prompt injection) y se equivoca; se puede reconsiderar con datos de varios meses.
* Opción C: Sin LLM, solo moderación manual. Viable, pero se descarta: la clasificación ahorra tiempo y es un caso real del patrón de routing.

### Cuándo corre el LLM
* Opción A (Seleccionada): En la misma petición de envío, con un timeout corto. Con un modelo rápido tarda pocos segundos. Si falla o se agota, el comentario se guarda igual, sin análisis, y el admin puede pedir el análisis después.
* Opción B: En segundo plano después de responder (goroutine). Descartada: en Cloud Run la CPU se limita al terminar la respuesta y el trabajo puede no completarse.
* Opción C: Cola (Cloud Tasks o Pub/Sub). Descartada por ahora: infraestructura y costo desproporcionados para este volumen.

### Por dónde llega el comentario a la API
* Opción A (Seleccionada): El navegador lo envía directo a la API pública (`/api/v1/posts/{slug}/comments`). El límite por IP del ADR-010 funciona con la IP real que reenvía la infraestructura de Google. Requiere permitir el origen de la web en CORS y agregar la API al `connect-src` de la CSP de la web.
* Opción B: A través de un route handler de Next (BFF). Descartada: no cambia CORS ni la CSP, pero la API vería la IP de Vercel, y reenviar la del lector exige un secreto compartido entre Next y la API para que el encabezado sea confiable.

## Decisión
1. **Modelo de datos.** Colección `comments`: post, nombre (1 a 50 caracteres), contenido (1 a 2000), comentario padre opcional (un solo nivel de respuestas), estado (`pending`, `approved`, `rejected`), fecha y el resultado de la moderación (veredicto, categoría, motivo, modelo y fecha). No se guarda IP, correo, user agent ni ningún identificador del lector.
2. **Formato.** Solo texto. Los segmentos entre backticks se muestran como código en línea. No hay Markdown, HTML ni links clicables: una URL se muestra como texto, lo que le quita su valor al spam de SEO. El texto se escapa al renderizar.
3. **Envío anónimo.** `POST /api/v1/posts/{slug}/comments`, solo para posts publicados. Antispam: rate limit propio por IP (3 cada 10 minutos por defecto, configurable), un campo trampa oculto que, si llega con valor, se descarta en silencio, y los límites de tamaño del contrato. La respuesta siempre es «en revisión»; no revela el veredicto del modelo.
4. **Moderación con LLM como clasificador (routing).** Un puerto `CommentModerator` en el dominio, con adaptador de Gemini y fake (mismo patrón y configuración de proveedor que el ADR-021). Salida estructurada: veredicto (`approve`, `reject`, `review`), categoría (`none`, `spam`, `abuse`, `off_topic`, `prompt_injection`, `personal_data`) y un motivo corto. El comentario va como dato, separado de las instrucciones. Sin herramientas. Timeout corto (10 s por defecto) y sin reintentos.
5. **La IA sugiere, León decide.** Todo comentario queda `pending` hasta que León lo aprueba o rechaza en el admin. Una categoría `prompt_injection` o `personal_data` siempre se muestra como revisión humana, aunque el veredicto diga otra cosa. Si el análisis falló, el admin puede pedirlo de nuevo.
6. **Lectura pública.** `GET /api/v1/posts/{slug}/comments` devuelve solo los aprobados, sin datos de moderación. La web los renderiza en el servidor con el mismo ISR del post (ADR-017), así que un comentario aprobado aparece en menos de un minuto. El estado «pendiente» que ve quien comenta vive solo en esa página del navegador; no hay token ni cookie para lectores.
7. **Respuestas del autor.** León responde desde el admin autenticado. Su respuesta se publica aprobada y marcada como «Autor».
8. **Web.** El formulario es un componente de cliente que envía a la API. Se agregan el origen de la web a `ALLOWED_ORIGINS` y la API a `connect-src` de la CSP de la web; nada más cambia en la CSP.
9. **Privacidad.** El formulario avisa, antes de enviar, que el comentario lo revisa un modelo de Google en su plan gratuito (que puede usar el contenido para mejorar sus productos) y después León, y que no incluya datos personales. Una página de reglas de comentarios lo explica. Los comentarios rechazados se borran a los 30 días.
10. **Configuración.** `COMMENTS_ENABLED` es `false` por defecto: el formulario no se muestra y la API responde `404` al envío. La moderación con LLM se puede apagar por separado; sin ella, los comentarios llegan a la cola sin análisis.
11. **Pruebas.** Con el fake. El adaptador de Gemini, contra `httptest`. Un set de comentarios de ejemplo (normales, spam, abuso, inyección) para revisar a mano la calidad del clasificador con el modelo real, nunca en CI.

## Consecuencias
* **Positivas**: Nada se publica sin revisión humana, así que un error o un engaño al LLM no llega a la web. Sin datos personales del lector. El LLM ahorra tiempo sin ser punto de falla: si no responde, la cola sigue funcionando. Reutiliza el puerto, el proveedor y la configuración del ADR-021.
* **Negativas**: Un comentario tarda en publicarse lo que tarde León en revisarlo. El envío espera unos segundos al modelo. El texto de los comentarios llega a Google en su plan gratuito. El nombre no se verifica: cualquiera puede escribir con cualquier nombre. La web pasa a hacer peticiones desde el navegador a la API, lo que amplía su CSP y CORS.
