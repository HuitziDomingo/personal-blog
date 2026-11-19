# Créditos de los modelos 3D

## Isla del hero (`isla/`)

Fortaleza flotante con nubes, compuesta en la investigación de BLOG-107 y usada desde BLOG-119. La imagen fija `apps/web/assets/img/isla.webp` es un render de este mismo modelo.

- **Autor:** [Quaternius](https://quaternius.com/).
- **Licencia:** [CC0 1.0 Universal (dominio público)](https://creativecommons.org/publicdomain/zero/1.0/). No exige atribución; se deja aquí por transparencia.
- **Fuente:** [Poly Pizza](https://poly.pizza/u/Quaternius), con estas piezas:
  - [Grass Block](https://poly.pizza/m/13pRDMxgSS)
  - [Mountain Group](https://poly.pizza/m/a52gSEEq8X) y [Mountain](https://poly.pizza/m/7HYR2s9JVi), volteados como base de la isla
  - [Castle Fortress](https://poly.pizza/m/3r6gq3ow6O)
  - [Cloud](https://poly.pizza/m/KdFNOVn1Gf), tres copias
- **Cambios:** composición de las piezas y optimización con `scripts/build-island-model.mjs` (`prune` y `dedup` de glTF Transform), en `.gltf` con el `.bin` y la textura aparte.

## Isla del Rey Hongo (`isla-hongo/`)

Isla 3 de la investigación de BLOG-107 (bosque de fantasía), con la animación Idle del Rey Hongo. Desde BLOG-126 es el modelo de la portada mientras León elige entre ella y la fortaleza (que se ve con `?isla=fortaleza` en desarrollo y previews). Es el mismo modelo que tuvo la portada en BLOG-107 (#122).

- **Autor:** [Quaternius](https://quaternius.com/). Cada pieza aparece en Poly Pizza como «Free 3D Model By Quaternius».
- **Licencia:** [CC0 1.0 Universal (dominio público)](https://creativecommons.org/publicdomain/zero/1.0/). Cada página de Poly Pizza dice «Public Domain (CC0)» y `"Licence":"CC0 1.0"` (comprobado el 2026-11-18). No exige atribución.
- **Fuente:** [Poly Pizza](https://poly.pizza/u/Quaternius), con estas piezas:
  - [Grass Block](https://poly.pizza/m/13pRDMxgSS)
  - [Mountain](https://poly.pizza/m/7HYR2s9JVi), volteado como base de la isla
  - [Fantasy House](https://poly.pizza/m/BH2XHWUNmF)
  - Tree Floating: [1](https://poly.pizza/m/sdtjU7iczl), [2](https://poly.pizza/m/tj2fePl8Eu) y [3](https://poly.pizza/m/FYbeHz28NN)
  - [Mushroom King](https://poly.pizza/m/grnFTziU8u), con su animación Idle
  - [Mushroom](https://poly.pizza/m/db1tjMhmiA), dos copias
  - [Cloud](https://poly.pizza/m/KdFNOVn1Gf), dos copias
- **Cambios:** composición de las piezas, solo la animación Idle, y optimización con `scripts/build-island-model.mjs`, en `.gltf` con el `.bin` y las dos texturas aparte. Los archivos son los de BLOG-107, recuperados del commit 917059f.

## Isla medieval de prueba (`isla-medieval/`)

Propuesta de BLOG-129: pueblo medieval con castillo sobre 37 hexágonos flotantes, con una base de roca colgando. Solo se carga con `?isla=medieval` en desarrollo, en los previews de Vercel o en un build local con `NEXT_PUBLIC_ISLAND_MODELS=1`.

- **Autor:** [Kay Lousberg](https://www.kaylousberg.com/) (KayKit).
- **Licencia:** [CC0 1.0 Universal (dominio público)](https://creativecommons.org/publicdomain/zero/1.0/). El `LICENSE.txt` del pack dice: «License: (Creative Commons Zero, CC0) … This content is free to use in personal, educational and commercial projects. Support me by crediting Kay Lousberg, www.kaylousberg.com (this is not mandatory)». La página de itch.io dice «Asset license: Creative Commons Zero v1.0 Universal» (comprobado el 2026-11-18).
- **Fuente:** [KayKit Medieval Hexagon Pack 1.0](https://kaylousberg.itch.io/kaykit-medieval-hexagon), del [repositorio oficial en GitHub](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) en el commit `84fa4e91af6a88989be7c99e0891cede11f2ca38`.
- **Cambios:** composición de hexágonos, edificios rojos, naturaleza, detalles, rocas volteadas como base y nubes con `scripts/build-island-medieval.mjs`; `dedup` y `prune` de glTF Transform; `.gltf` con el `.bin` y la textura aparte.

## Comportamiento de la cámara

La animación de entrada (10 vueltas con la curva `easeOutCirc` en 100 cuadros a 60 fps y después el giro automático) y los controles amplios reimplementan el comportamiento del perro de la web anterior, basado en [craftzdog-homepage](https://github.com/craftzdog/craftzdog-homepage) (código MIT). Se reimplementó en `apps/web/components/island/island-controls.ts`; de ese código solo se repite la fórmula de la curva, y su modelo no se usa.
