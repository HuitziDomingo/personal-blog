// Tipos de los imports estáticos de imágenes (next/image). next-env.d.ts los
// trae, pero Next lo genera en el build y no está en git: sin esto, el
// typecheck del CI, que corre antes del build, no los conocería.
/// <reference types="next/image-types/global" />
