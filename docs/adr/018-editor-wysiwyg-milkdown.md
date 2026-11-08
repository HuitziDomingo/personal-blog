# ADR-018: Editor WYSIWYG del Admin con Milkdown
* Estado: Aprobado
* Fecha: 2026-11-07
* Autor: León Nieves Huitzitzili Domingo
* Reemplaza: ADR-012 (punto del editor: textarea con vista previa)

## Contexto
ADR-012 eligió para el MVP un `textarea` con vista previa, y dejó el editor detrás de un componente con interfaz `value` / `valueChange` para poder cambiarlo. Con el admin funcionando, se busca un editor visual moderno y gratuito. La API guarda Markdown y la seguridad de ADR-010 y ADR-017 depende de eso: el contenido se sanitiza al renderizar con `packages/markdown`. La investigación en Obsidian ("Editores WYSIWYG para el admin") comparó Milkdown, TipTap, ngx-editor y Quill.

## Alternativas Consideradas
* Opción A (Seleccionada): Milkdown con el preset Crepe. Licencia MIT en todos sus paquetes oficiales, sin nivel de pago. Basado en ProseMirror y remark, trabaja nativamente en Markdown. Mantenimiento muy activo.
* Opción B: TipTap. Descartada: su salida a Markdown depende de una extensión que su documentación llama "early release", y parte de su ecosistema es de pago.
* Opción C: ngx-editor o Quill. Descartadas: producen HTML o su propio formato (Delta), lo que obligaría a convertir a Markdown o a cambiar el modelo de seguridad.
* Opción D: Mantener el textarea con vista previa. Descartada: funciona, pero no es la experiencia de edición buscada.

## Decisión
1. El componente de editor del admin usa Milkdown Crepe por dentro y conserva su interfaz `value` / `valueChange`; el formulario no cambia.
2. Entrada y salida son siempre Markdown. El editor nunca guarda HTML.
3. La vista previa con `packages/markdown` se mantiene como la verdad de cómo se publicará el post: el editor puede mostrar formato, pero la seguridad la da la sanitización al renderizar (ADR-010 y ADR-017).
4. Se carga de forma diferida, solo en las rutas del editor, para no aumentar el bundle inicial.
5. Debe convivir con la CSP de ADR-012: sin `eval`, sin scripts inline nuevos. Sus estilos se importan como CSS del build. Se verifica con `make admin-csp-test`.
6. Se desactivan las funciones de Crepe que inserten contenido fuera de la allowlist de `packages/markdown` (por ejemplo HTML embebido o iframes).
7. Versiones exactas con más de 7 días (ADR-013).

## Consecuencias
* **Positivas**: Edición visual sin cambiar el formato guardado ni el modelo de seguridad. El cambio queda aislado en un componente.
* **Negativas**: Milkdown con Crepe es pesado, aunque se carga solo en el editor. No tiene binding oficial para Angular, así que se integra con su API de JavaScript dentro de un componente propio. Puede producir Markdown con formato distinto al que se escribía a mano (por ejemplo, otro estilo de listas o escapes).
