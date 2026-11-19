# Créditos de los fondos del admin

Fondos de pantalla del admin (BLOG-121, BLOG-124), tomados de [gnome-backgrounds](https://gitlab.gnome.org/GNOME/gnome-backgrounds) 51.0.1 (tarball oficial de download.gnome.org, sha256 verificado). El autor y la licencia de cada par se verificaron uno por uno en los metadatos XMP incrustados en sus dos archivos de origen (`dc:creator`, `dc:rights` y `cc:license`). Se descartaron los fondos del tarball sin esos metadatos (`adwaita`, `amber` y `curvaturingster`).

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

Los nombres en español son traducciones del nombre del archivo; el título original de cada obra es su id.

**Cambios:** recorte centrado (1920 × 1200 apaisado, 900 × 1600 vertical y 160 × 120 para la miniatura del selector), escalado y conversión a AVIF (fondos) y webp (miniaturas) con `apps/admin/scripts/build-backgrounds.mjs`. Estas imágenes derivadas se distribuyen con la misma licencia, CC BY-SA 3.0. La licencia no se extiende al código del admin.

**Atribución en el admin:** CC BY-SA pide citar título, autor, fuente y licencia donde se usa la obra. El admin lo muestra en la página pública **Créditos** (`/creditos`, `features/credits/credits.page.ts`), que se genera desde `BACKGROUND_INFO`. El login y el menú enlazan a ella con un link «Créditos» (BLOG-130).
