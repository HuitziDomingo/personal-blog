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

## Comportamiento de la cámara

La animación de entrada (giro rápido con la curva `easeOutCirc` y después `autoRotate`) y los controles amplios reimplementan el comportamiento del perro de la web anterior, basado en [craftzdog-homepage](https://github.com/craftzdog/craftzdog-homepage) (código MIT). Se reimplementó en `apps/web/components/island/island-controls.ts`; de ese código solo se repite la fórmula de la curva, y su modelo no se usa.
