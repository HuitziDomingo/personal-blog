# Créditos de los modelos 3D

## Isla del hero (`isla/`)

Pueblo medieval con castillo sobre 37 hexágonos flotantes, con una base de roca colgando (BLOG-129). La imagen fija `apps/web/assets/img/isla.webp` es el primer cuadro de este mismo modelo.

- **Autor:** [Kay Lousberg](https://www.kaylousberg.com/) (KayKit).
- **Licencia:** [CC0 1.0 Universal (dominio público)](https://creativecommons.org/publicdomain/zero/1.0/). El `LICENSE.txt` del pack dice: «License: (Creative Commons Zero, CC0) … This content is free to use in personal, educational and commercial projects. Support me by crediting Kay Lousberg, www.kaylousberg.com (this is not mandatory)». La página de itch.io dice «Asset license: Creative Commons Zero v1.0 Universal» (comprobado el 2026-11-18).
- **Fuente:** [KayKit Medieval Hexagon Pack 1.0](https://kaylousberg.itch.io/kaykit-medieval-hexagon), del [repositorio oficial en GitHub](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) en el commit `84fa4e91af6a88989be7c99e0891cede11f2ca38`.
- **Cambios:** composición de hexágonos, edificios rojos, naturaleza, detalles, rocas volteadas como base y nubes con `scripts/build-island-model.mjs`; `dedup` y `prune` de glTF Transform; `.gltf` con el `.bin` y la textura aparte.

## Comportamiento de la cámara

La animación de entrada (10 vueltas con la curva `easeOutCirc` en 100 cuadros a 60 fps y después el giro automático) y los controles amplios reimplementan el comportamiento del perro de la web anterior, basado en [craftzdog-homepage](https://github.com/craftzdog/craftzdog-homepage) (código MIT). Se reimplementó en `apps/web/components/island/island-controls.ts`; de ese código solo se repite la fórmula de la curva, y su modelo no se usa.
