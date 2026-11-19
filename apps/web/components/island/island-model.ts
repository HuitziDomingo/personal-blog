/**
 * La isla del hero (BLOG-129): pueblo medieval con castillo sobre hexágonos
 * flotantes, armado con `scripts/build-island-model.mjs` a partir del KayKit
 * Medieval Hexagon Pack (Kay Lousberg, CC0). Es un `.gltf` con el `.bin` y la
 * textura aparte: un GLB con texturas dentro haría que GLTFLoader las cargara
 * desde URLs `blob:`, que la CSP no permite.
 */
export const ISLAND_MODEL_URL = '/models/isla/isla.gltf';
