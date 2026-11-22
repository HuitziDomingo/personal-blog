# ADR-029: Portadas Generadas con IA Guardadas sin Recodificar
* Estado: Aprobado
* Fecha: 2026-11-21
* Autor: León Nieves Huitzitzili Domingo
* Corrige: ADR-026, punto 8 (tamaño fijo y formato webp al guardar)

## Contexto
ADR-026 decidió guardar las portadas en un tamaño fijo (por ejemplo 1024 × 576) y en formato webp. Al implementarlo se encontró que:
* `flux-1-schnell` en Cloudflare Workers AI no acepta ancho ni alto: solo `prompt` y `steps`, y devuelve una imagen en Base64 de formato y resolución no documentados.
* La librería estándar de Go no codifica webp; hacerlo exige una dependencia nueva, y si usa cgo rompe la imagen distroless.
* Los términos de Black Forest Labs (sec. 1.3(p)) y su Usage Policy prohíben quitar marcas de IA, metadatos C2PA o marcas de agua. Recodificar o recortar la imagen en la API podría borrarlos sin que se note.

## Alternativas Consideradas
* Opción A (Seleccionada): guardar la imagen tal como la entrega el proveedor, sin recodificar ni recortar, y hacer el recorte y la conversión al mostrarla.
* Opción B: recortar y recodificar en JPEG con la librería estándar. Descartada: puede borrar marcas de IA y pierde calidad con una segunda compresión.
* Opción C: codificar en webp con una dependencia nueva. Descartada: dependencia extra, posible cgo y el mismo riesgo sobre las marcas.
* Opción D: otro modelo que acepte tamaño. Descartada por ahora: su ficha no documenta parámetros ni licencia.

## Decisión
1. **Sin recodificar.** La API guarda los bytes que devuelve el proveedor, sin recortar, redimensionar ni recodificar. Esto reemplaza el tamaño fijo y el formato webp del punto 8 de ADR-026; el resto de ese punto (límites de peticiones, timeout y `503` al agotar la cuota) sigue vigente.
2. **Validación.** Antes de guardar, la API comprueba el tipo real por la firma del archivo (solo formatos de imagen que la web pueda servir), el tamaño máximo y que las dimensiones se puedan leer. El nombre del archivo lo genera la API.
3. **Presentación.** La web recorta la portada a 16:9 al mostrarla (`object-fit: cover`) y `next/image` entrega el formato y el tamaño adecuados a cada dispositivo.
4. **Vista borrosa.** La miniatura borrosa (`blurDataURL`) se genera a partir de una copia en memoria y se guarda aparte; el archivo original no se modifica. Si el formato del proveedor no se puede decodificar con la librería estándar, se permite `golang.org/x/image`, mantenido por el equipo de Go, con las reglas de ADR-013.
5. **Verificación.** Una imagen real de prueba registra el formato, la resolución y si trae metadatos C2PA o marcas de IA. El resultado se anota en el PR que active la generación (`IMAGES_ENABLED=true`).

## Consecuencias
* **Positivas**: Se respetan las marcas de IA del proveedor. Sin dependencias nuevas para codificar y sin pérdida de calidad. Menos procesamiento en la API.
* **Negativas**: El archivo guardado puede ser más pesado que un webp optimizado; la optimización la hace la web al servirlo. El formato depende del proveedor y puede cambiar sin aviso, por lo que la validación por firma es obligatoria.
