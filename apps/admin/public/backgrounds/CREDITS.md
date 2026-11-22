# Créditos de los fondos del admin

Fondos de pantalla del admin (BLOG-121, BLOG-124, BLOG-146). Cada fuente se descargó de su URL oficial y se comprobó su suma de verificación (sha256 de download.gnome.org; sha512 del archivo `sources` del paquete en src.fedoraproject.org).

## GNOME: gnome-backgrounds 51.0.1

- Proyecto: <https://gitlab.gnome.org/GNOME/gnome-backgrounds>. El último tag es `52.0.1`, que apunta al mismo commit que `51.0.1` (`e2e7f055`); el tarball publicado es el de 51.0.1.
- Tarball: <https://download.gnome.org/sources/gnome-backgrounds/51/gnome-backgrounds-51.0.1.tar.xz> (sha256 `ec50534d7749be0e1503c5504f826c61d1460d2b41cb84518fa6b2f5547d1e1e`).
- Licencia: el `COPYING` del tarball es CC BY-SA 3.0, y `AUTHORS` dice que el autor de cada imagen va en sus metadatos. El autor y la licencia de cada par se verificaron uno por uno en los metadatos XMP de sus dos archivos de origen (`dc:creator`, `dc:rights` y `cc:license`). Se descartaron los fondos del tarball sin esos metadatos (`adwaita`, `amber` y `curvaturingster`).

| Fondo | Archivos de origen | Autor (`dc:rights`) | Licencia |
|---|---|---|---|
| Pliegue (`fold`) | `backgrounds/fold-l.jxl`, `backgrounds/fold-d.jxl` | Jakub Steiner (© 2024) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Mapa (`map`) | `backgrounds/map-l.svg`, `backgrounds/map-d.svg` | Dominik Baran (© 2024) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Lámina (`sheet`) | `backgrounds/sheet-l.jxl`, `backgrounds/sheet-d.jxl` | Jakub Steiner (© 2024) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Burbujas (`blobs`) | `backgrounds/blobs-l.svg`, `backgrounds/blobs-d.svg` | Jakub Steiner (© 2022) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Chip de vidrio (`glass-chip`) | `backgrounds/glass-chip-l.jxl`, `backgrounds/glass-chip-d.jxl` | Jakub Steiner (© 2024) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Tarka (`tarka`) | `backgrounds/tarka-l.jxl`, `backgrounds/tarka-d.jxl` | Jakub Steiner (© 2023) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Curvas (`curvy`) | `backgrounds/curvy-l.jxl`, `backgrounds/curvy-d.jxl` | Jakub Steiner (© 2025) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Símbolos (`symbolic`) | `backgrounds/symbolic-l.jxl`, `backgrounds/symbolic-d.jxl` | Jakub Steiner (© 2026) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Sol tramado (`dithered-sun`) | `backgrounds/dithered-sun-l.jxl`, `backgrounds/dithered-sun-d.jxl` | Tobias Bernard (© 2025) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Esferas (`balls`) | `backgrounds/balls-l.jxl`, `backgrounds/balls-d.jxl` | Jakub Steiner (© 2026) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Píldoras de colores (`blendpills`) | `backgrounds/blendpills-l.jxl`, `backgrounds/blendpills-d.jxl` | Jakub Steiner (© 2026) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Arcoíris LCD (`lcd-rainbow`) | `backgrounds/lcd-rainbow-l.jxl`, `backgrounds/lcd-rainbow-d.jxl` | Jakub Steiner (© 2024) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |

Los nombres en español son traducciones del nombre del archivo; el título original de cada obra es su id.

## Fedora: f42-, f43- y f44-backgrounds

El fondo por defecto de cada versión de Fedora, con su variante de día (clara) y de noche (oscura). Autor: Fedora Design Team. Licencia: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), verificada en tres sitios de cada paquete: `License: CC-BY-SA-4.0` del spec en src.fedoraproject.org (rama de la versión), el archivo `Attribution` y los textos `COPYING` y `default/CC-BY-SA-4.0` del tarball. Las imágenes no traen metadatos XMP.

| Fondo | Paquete y tarball | Archivos de origen | sha512 (inicio) |
|---|---|---|---|
| Bosque (`fedora-42`) | [f42-backgrounds](https://src.fedoraproject.org/rpms/f42-backgrounds) 42.0.0: <https://github.com/fedoradesign/backgrounds/releases/download/v42.0.0/f42-backgrounds-42.0.0.tar.xz> | `default/f42-01-day.jxl`, `default/f42-01-night.jxl` (4032 × 3024) | `358cb36a161b5aa4` |
| Despegue (`fedora-43`) | [f43-backgrounds](https://src.fedoraproject.org/rpms/f43-backgrounds) 43.0.4: <https://github.com/fedoradesign/backgrounds/releases/download/v43.0.4/f43-backgrounds-43.0.4.tar.xz> | `default/f43-01-day.jxl`, `default/f43-01-night.jxl` (4032 × 3024) | `77d60ed7528bb4d2` |
| Ciudad (`fedora-44`) | [f44-backgrounds](https://src.fedoraproject.org/rpms/f44-backgrounds) 44.0.0: <https://forge.fedoraproject.org/design/backgrounds/releases/download/v44.0.0/f44-backgrounds-44.0.0.tar.xz> | `default/f44-01-day.jxl`, `default/f44-01-night.jxl` (4096 × 4096) | `2a989513e523642c` |

El `Attribution` de f42 conserva el encabezado de Fedora 41 y el de f44 el de Fedora 43 (copiados de la versión anterior); la licencia que declaran es la misma del spec. No se usó el de Fedora 45 (f45-backgrounds 45.0.4, también CC BY-SA 4.0): es un render de engranajes, no un paisaje ilustrado. Los nombres en español describen la ilustración; el título original es «Fedora NN Default».

## Cambios

Con `apps/admin/scripts/build-backgrounds.mjs`:

- Recorte centrado en dos proporciones: 16:10 apaisado y 9:16 vertical.
- Escalado (Lanczos) a 1280, 1920, 2560 y 3840 px de ancho, sin ampliar: si el recorte del original es más angosto, la variante mayor es la del original y se omiten las que lo superan (2304 px en el vertical de los originales de 4096 × 4096 y 1701 px en el de los de 4032 × 3024).
- Conversión a AVIF (calidad 65, 10 bits, 4:4:4; calidad 75 en las de 3840) de cada variante y, hasta 2560 px, a WebP (calidad 80, `sharp_yuv`) como respaldo (BLOG-148). Hasta BLOG-146 eran solo dos AVIF por fondo y modo, de 1920 × 1200 y 900 × 1600, con calidad 50.
- Miniatura del selector: el mismo recorte a 160 × 120, en WebP (calidad 80).
- Los SVG (`map` y `blobs`) se rasterizan con Chrome al tamaño del original, 4096 × 4096.
- No hay variantes oscuras derivadas: cada fondo usa la clara y la oscura de su fuente.

Estas imágenes derivadas se distribuyen con la misma licencia que su original (CC BY-SA 3.0 las de GNOME y CC BY-SA 4.0 las de Fedora). La licencia no se extiende al código del admin.

**Atribución en el admin:** CC BY-SA pide citar título, autor, fuente y licencia donde se usa la obra, e indicar los cambios. El admin lo muestra en la página pública **Créditos** (`/creditos`, `features/credits/credits.page.ts`), que se genera desde `BACKGROUND_INFO` y `BACKGROUND_SOURCES`. El login y el menú enlazan a ella con un link «Créditos» (BLOG-130).
