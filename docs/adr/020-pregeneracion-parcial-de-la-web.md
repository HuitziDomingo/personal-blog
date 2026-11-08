# ADR-020: Pregeneración Parcial de Posts en el Build de la Web
* Estado: Aprobado
* Fecha: 2026-11-07
* Autor: León Nieves Huitzitzili Domingo
* Reemplaza: ADR-017 (punto 3: "los posts publicados se pregeneran en el build")

## Contexto
ADR-017 indica que todos los posts publicados se pregeneran en el build de `apps/web`. Al implementarlo (BLOG-059), cada post pregenerado es una petición a la API desde el build, y con unos 20 posts el build superaría la ráfaga del rate limit por IP (ADR-010) y recibiría `429`. La revalidación por tiempo (ISR) ya genera bajo demanda cualquier post que no se haya pregenerado.

## Alternativas Consideradas
* Opción A (Seleccionada): Pregenerar solo los N posts publicados más recientes (por defecto 10, configurable). El resto se genera con ISR en su primera visita.
* Opción B: Pregenerar todos y subir el rate limit para el build. Descartada: obliga a distinguir el tráfico del build en la API o a relajar el límite para todos.
* Opción C: No pregenerar ninguno. Descartada: la primera visita a cada post, incluida la portada, siempre llegaría a la API.

## Decisión
1. El build pregenera los N posts publicados más recientes; N se configura por variable de entorno y vale 10 por defecto.
2. Los demás posts publicados se generan bajo demanda con ISR y quedan en caché con la misma revalidación de ADR-017.
3. Un error `429` o `5xx` de la API durante el build o la revalidación nunca se convierte en `404`.

## Consecuencias
* **Positivas**: El build no depende de cuántos posts haya y no choca con el rate limit. Los posts recientes, los más visitados, siempre se sirven desde caché.
* **Negativas**: La primera visita a un post antiguo es más lenta y llega a la API. Si N es mayor que la ráfaga del rate limit, vuelve el problema; el valor por defecto debe quedar por debajo de ella.
