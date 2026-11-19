# ADR-027: RAG sobre los Posts del Autor para el Asistente de Escritura
* Estado: Aprobado
* Fecha: 2026-11-19
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-021 (asistente de escritura y puerto de proveedor) y ADR-019 (servidor MCP)

## Contexto
El asistente de escritura (ADR-021) mejora un borrador sin conocer los posts ya publicados: no sabe qué temas se cubrieron, cómo se explicaron ni qué términos usa el autor. Pasarle todos los posts en cada llamada es caro, lento, consume la cuota gratuita de Gemini y mete ruido. El fine-tuning sirve para cambiar estilo o formato, no para que el modelo conozca datos que además cambian con cada publicación.

Se quiere un botón en el admin que mejore el borrador usando como contexto los fragmentos más relevantes de los posts publicados (Retrieval-Augmented Generation), con costo de $0. El blog tiene y tendrá pocos posts: menos de 1000.

## Alternativas Consideradas
### Almacenamiento y búsqueda de vectores
* Opción A (Seleccionada): colección en MongoDB y similitud coseno en memoria en Go. Con 1000 posts serían unos 5000 fragmentos de 768 dimensiones, alrededor de 15 MB, y recorrerlos todos tarda milisegundos. Sin infraestructura nueva y sin dependencias.
* Opción B: Atlas Vector Search. Descartada por ahora: no funciona con MongoDB 8.0 standalone en local y el plan M0 tiene límites. Se reconsidera con más de unos 20 000 fragmentos.
* Opción C: base de datos vectorial dedicada (Pinecone, Qdrant u otra). Descartada: un servicio más, costo y operación para un volumen que no lo necesita.

### Primer uso
* Opción A (Seleccionada): botón en el asistente del admin para mejorar el borrador con el contexto de los posts propios.
* Opción B: herramienta de búsqueda semántica en el servidor MCP. Pospuesta: ADR-019 establece que el MCP no llama a proveedores de IA, y cambiarlo requiere su propio ADR.

## Decisión
1. **Workflow, no agente.** Fragmentar, generar embeddings, buscar, aumentar el prompt y generar, en ese orden fijo decidido por el código. Sin herramientas.
2. **Embeddings.** Gemini embeddings de 768 dimensiones, en el proyecto de Google sin facturación (ADR-021). Los documentos y la consulta se generan con su tipo de tarea correspondiente (documento o consulta). Puerto `Embedder` en el dominio, con adaptadores de Gemini y fake.
3. **Fragmentación.** Divisor propio en Go, sin dependencias: corta por secciones `##`, con un tamaño máximo por fragmento (unos 800 caracteres por defecto) y sin cortar nunca un bloque de código. Cada fragmento conserva el título de su sección.
4. **Almacenamiento.** Colección `post_chunks` con el post, su slug, el título de la sección, el texto, el embedding, el modelo que lo generó y un `contentHash` del post. Puerto `ChunkRepository` en el dominio.
5. **Indexación.** Al publicar o editar un post publicado se reindexan solo sus fragmentos, detectando cambios con `contentHash`. Al archivar o despublicar se borran. Un botón «Reindexar todo» en el admin reconstruye el índice. Si falla la generación de embeddings, el post se guarda igual y el índice queda pendiente de reindexar.
6. **Cambio de modelo.** Vectores de modelos distintos no se comparan: si cambia el modelo configurado, la búsqueda ignora los fragmentos de otro modelo y se debe reindexar todo.
7. **Búsqueda.** El borrador se convierte en embedding de consulta. Se calcula la similitud coseno contra todos los fragmentos del modelo actual, en memoria, y se devuelven los 4 mejores que superen un umbral mínimo configurable, excluyendo el post que se está editando. Si ninguno supera el umbral, la generación sigue sin contexto.
8. **Generación.** Una sola llamada a Gemini con el borrador y los fragmentos recuperados, separados de las instrucciones y marcados como datos (ADR-021). Sugiere mejoras que mantengan la voz del autor, señala contradicciones con posts anteriores y propone links internos a los posts recuperados. Salida estructurada validada; todo es una sugerencia que el autor acepta o descarta.
9. **Qué se indexa.** Solo posts publicados del autor. Nunca comentarios de lectores ni otra entrada externa, para cerrar la prompt injection indirecta por el contenido recuperado.
10. **Límites.** Mismo bucket por usuario que el asistente (ADR-021), timeout por llamada y sin reintentos. La indexación respeta la cuota gratuita de embeddings: si se agota, queda pendiente.
11. **Configuración.** `RAG_ENABLED` es `false` por defecto. Con `true` y sin el asistente configurado, la API no arranca.
12. **Evaluación.** Un set de unas 10 consultas con el post que debería aparecer, para medir recall@4 a mano con el modelo real. Nunca en CI. Los tests usan fakes.
13. **Fuera de alcance.** Anclas por sección en los links internos, búsqueda semántica en el MCP o en la web pública y búsqueda híbrida (palabras clave más vectores). Cada una requiere su propio ADR.

## Consecuencias
* **Positivas**: El asistente conoce el blog sin aumentar el costo. Sin infraestructura ni dependencias nuevas. El índice se mantiene solo. El mismo patrón de puertos permite cambiar el proveedor de embeddings o el almacenamiento sin tocar el dominio. Base práctica para explicar RAG en entrevistas.
* **Negativas**: La búsqueda en memoria carga todos los vectores en cada consulta; con mucho más volumen habrá que migrar a búsqueda vectorial. Cambiar de modelo obliga a reindexar todo. La cuota gratuita de embeddings no está verificada. El umbral mínimo se ajusta a prueba y error con el set de evaluación.
