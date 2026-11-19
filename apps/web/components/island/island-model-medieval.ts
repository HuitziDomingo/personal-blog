import type { IslandModel } from './island-model';

/**
 * Propuesta de BLOG-129: pueblo medieval con castillo sobre hexágonos flotantes,
 * armado con `scripts/build-island-medieval.mjs` a partir del KayKit Medieval
 * Hexagon Pack (Kay Lousberg, CC0). Solo con `?isla=medieval` (desarrollo,
 * previews de Vercel o un build local con `NEXT_PUBLIC_ISLAND_MODELS=1`).
 */
export const MEDIEVAL: IslandModel = { id: 'medieval', url: '/models/isla-medieval/isla.gltf' };
