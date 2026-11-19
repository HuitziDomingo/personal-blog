# ADR-028: Página de CV con PDF Subido desde el Admin
* Estado: Aprobado
* Fecha: 2026-11-19
* Autor: León Nieves Huitzitzili Domingo
* Complementa: ADR-017 (web pública), ADR-024 (portafolio bilingüe) y ADR-026 (almacenamiento de archivos)

## Contexto
El autor quiere una página de CV en la web pública y poder subir desde el admin la versión más reciente en PDF, sin desplegar código cada vez que actualiza su CV. Es la primera subida de archivos de usuario al sistema y la primera vez que la web expone un documento descargable.

## Alternativas Consideradas
* Opción A (Seleccionada): Página HTML con el contenido del CV, más un botón para descargar el PDF más reciente, que se sube desde el admin.
* Opción B: Solo el PDF. Descartada: no lo indexan bien los buscadores, se lee mal en el celular y es menos accesible.
* Opción C: El PDF dentro del repo. Descartada: cada actualización exige un PR y un despliegue, y el historial de git conservaría para siempre las versiones viejas con datos personales.

## Decisión
1. **Rutas.** `/cv` en español y `/en/resume` en inglés, con un link en la navegación de los dos idiomas.
2. **Contenido HTML.** Resumen, experiencia, proyectos destacados, stack, educación, certificaciones en curso e idiomas, en los archivos de contenido del portafolio (ADR-024), con el mismo tipo en los dos idiomas. Los datos coinciden con el portafolio: un cargo o una fecha no puede decir algo distinto en dos páginas.
3. **PDF.** Un PDF vigente por idioma, subido desde una pantalla del admin. Se conservan las versiones anteriores y se puede marcar cualquiera como vigente. Si no hay PDF de un idioma, el botón de descarga no se muestra.
4. **Validación de la subida.** Solo usuarios admin autenticados, con la protección de origen de ADR-010. Solo PDF, verificado por su firma (`%PDF-`) y no por la extensión, con un tamaño máximo de 2 MB y un límite de peticiones propio.
5. **Almacenamiento.** El mismo almacenamiento de archivos de ADR-026 (GCS en producción y disco en desarrollo), bajo un prefijo propio, con un nombre generado por la API y no por el nombre del archivo subido. Los metadatos (idioma, URL, tamaño, fecha y si es la vigente) van en una colección de MongoDB.
6. **Servicio del archivo.** El PDF se sirve desde el dominio del almacenamiento, no desde `huitzi.xyz` ni `admin.huitzi.xyz`, para que un PDF malicioso no pueda actuar en el origen del sitio. Con `Content-Type: application/pdf` y `X-Content-Type-Options: nosniff`.
7. **Privacidad.** El PDF es público. El admin muestra en la pantalla de subida un aviso: no incluir el teléfono ni datos que no deban ser públicos. La versión completa del CV se manda solo a reclutadores, fuera del sistema.
8. **Lectura pública.** Una operación pública de la API devuelve la URL del PDF vigente por idioma. La web la consulta con el mismo ISR del resto del sitio.
9. **CSP.** No cambia: el botón es un link de descarga.

## Consecuencias
* **Positivas**: Actualizar el CV no requiere desplegar código. La versión HTML se indexa y se lee bien en cualquier dispositivo. Un PDF malicioso queda aislado del origen del sitio.
* **Negativas**: El contenido HTML y el PDF se mantienen por separado y pueden desalinearse. La primera subida de archivos amplía la superficie de ataque de la API.
