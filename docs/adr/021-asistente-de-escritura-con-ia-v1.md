# ADR-021: Asistente de Escritura con IA (v1) como Workflow sobre un Puerto de Proveedor
* Estado: Aprobado
* Fecha: 2026-11-09
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-002 y ADR-006 (arquitectura hexagonal), ADR-010 y ADR-016 (seguridad y rate limit), ADR-019 (MCP)

## Contexto
El admin ya tiene la interfaz de un asistente de escritura con un puerto `WritingAssistant` y una implementación falsa, apagada en producción (BLOG-072). Falta decidir cómo la API genera sugerencias reales con un LLM: qué hace la primera versión, con qué proveedor, cuánto puede costar y cómo se protege.

Restricciones:
* Costo de $0 al mes, garantizado por diseño y no solo por vigilancia.
* Un solo usuario (el admin) y tráfico muy bajo.
* El navegador nunca llama al proveedor: la API key vive solo en el backend.
* El texto que se envía y lo que el modelo devuelve son datos no confiables (prompt injection, ADR-010 y ADR-019).

## Alternativas Consideradas
### Forma de la solución
* Opción A (Seleccionada): Workflow. El código decide el flujo y cada operación es una sola llamada al modelo, sin herramientas. Los pasos se conocen de antemano, así que no hay nada que el modelo tenga que decidir.
* Opción B: Agente con herramientas (por ejemplo, las del servidor MCP del ADR-019). Descartada para la v1: costo y número de llamadas impredecibles, pruebas más difíciles y una superficie de ataque mayor sin ganar nada para estas dos tareas.

### Proveedor
* Opción A (Seleccionada): Gemini API en su plan gratuito, con la key en un proyecto de Google sin facturación. Sin medio de pago no hay forma de que se genere un cargo; al agotar la cuota, la API rechaza la petición.
* Opción B: API de Claude. Descartada por ahora: el plan Pro no incluye créditos de API y no tiene plan gratuito. Queda como adaptador futuro.
* Opción C: Groq en su plan gratuito. Viable, se descarta solo para tener un proveedor; puede ser un adaptador de respaldo.
* Opción D: Modelo local con Ollama. Descartada para producción (Cloud Run sin GPU). Se puede usar en desarrollo local como adaptador opcional.

## Decisión
1. **Alcance v1.** Dos operaciones independientes: mejorar la redacción de un borrador (devuelve Markdown) y sugerir título, extracto y tags. La sugerencia de portada del puerto del admin (`suggestCover`) no se conecta en la v1. Imágenes, agentes y escritura vía MCP quedan fuera y cada uno requiere un ADR nuevo.
2. **Puerto en el dominio.** `services/api` define un puerto de asistente de escritura en `domain`/`service` con adaptadores intercambiables: Gemini (producción) y fake (tests y CI, ADR-015). Cambiar o agregar un proveedor no toca el dominio ni el contrato.
3. **SDK.** El adaptador de Gemini usa el SDK oficial de Go (`google.golang.org/genai`), versión estable con más de 7 días (ADR-013). El modelo se elige por configuración (`GEMINI_MODEL`), siempre uno incluido en el plan gratuito.
4. **Costo $0.** La key se crea en un proyecto de Google dedicado y sin facturación, separado del proyecto donde corre la API. Localmente vive en `.env` (ignorado por git); en producción, en Secret Manager. Nunca en el repo ni en el admin.
5. **Contrato.** Dos operaciones nuevas en `docs/api/openapi.yaml` (spec-first, ADR-007), solo para usuarios autenticados, con la misma protección de origen que el resto de las mutaciones (ADR-010). El contenido enviado tiene un tamaño máximo definido en el contrato.
6. **Salida tratada como dato.**
   * Las instrucciones van en el mensaje de sistema y el borrador va delimitado y marcado como dato, nunca concatenado a las instrucciones.
   * Los metadatos se piden con salida estructurada (JSON Schema) y la API los valida con las mismas reglas que un post; si no cumplen, la operación falla.
   * El Markdown devuelto se renderiza con el mismo sanitizado que cualquier post (`packages/markdown`).
   * Todo es una sugerencia: el admin la muestra para aceptar o descartar y nada se guarda automáticamente.
7. **Límites.** Un bucket propio por usuario para estas operaciones, más estricto que el general del ADR-016 (por defecto 5 por minuto, configurable). Timeout por llamada al proveedor (por defecto 30 s) y sin reintentos automáticos. Si el proveedor rechaza por cuota o falla, la API responde `503` con problem+json (ADR-005).
8. **Configuración.** `ASSISTANT_ENABLED` es `false` por defecto. Con `true` y sin `GEMINI_API_KEY`, la API no arranca (falla cerrado). Con `false`, las operaciones responden `503` con un detalle que indica que el asistente está desactivado.
9. **Privacidad.** Se acepta que el plan gratuito use el contenido enviado para mejorar los productos de Google. Solo se envían el título y el contenido del borrador; nunca datos de usuarios, secretos ni otros posts. Los logs registran modelo, latencia, tokens y resultado, nunca el contenido ni la key.
10. **Pruebas.** Unitarias con el fake. El adaptador de Gemini se prueba contra un servidor HTTP local (`httptest`) con respuestas grabadas. Ningún job de CI llama a un modelo real.

## Consecuencias
* **Positivas**: Costo cero garantizado por la ausencia de facturación, no por una alerta. El proveedor se puede cambiar sin tocar dominio ni contrato. Flujo predecible y fácil de probar. Base para una v2 con agente, que se decidirá en otro ADR.
* **Negativas**: Cuota gratuita limitada y sujeta a cambios de Google, con posibles `503` en uso intenso. El contenido enviado puede usarse para entrenar, así que no sirve para borradores privados. La calidad en español puede ser menor que la de un modelo de pago. Un proyecto de Google más que administrar.
