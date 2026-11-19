import { HONGO } from './island-model-hongo';
import { MEDIEVAL } from './island-model-medieval';

/** Un modelo de la isla del hero. */
export interface IslandModel {
  id: string;
  /** `.gltf` con el `.bin` y las texturas aparte (sin URLs `blob:`, por la CSP). */
  url: string;
  /** Animación que se repite en bucle, si el modelo trae una. */
  idleClip?: string;
}

/** Fortaleza flotante con nubes (BLOG-119). */
export const FORTRESS: IslandModel = { id: 'fortaleza', url: '/models/isla/isla.gltf' };

/**
 * La isla de la portada. En evaluación (BLOG-126): el Rey Hongo; la fortaleza
 * se ve con `?isla=fortaleza` en desarrollo y previews.
 */
export const DEFAULT_MODEL: IslandModel = HONGO;

/**
 * Modelos para comparar con `?isla=<id>` (BLOG-123). Se quitan borrando su
 * entrada aquí, su archivo y su carpeta en `public/models/`.
 */
const PREVIEW_MODELS: Readonly<Record<string, IslandModel>> = {
  [FORTRESS.id]: FORTRESS,
  [HONGO.id]: HONGO,
  [MEDIEVAL.id]: MEDIEVAL,
};

/** Lo que se mira del entorno: Next.js sustituye las variables al compilar. */
export interface ModelEnv {
  NODE_ENV?: string | undefined;
  NEXT_PUBLIC_VERCEL_ENV?: string | undefined;
  NEXT_PUBLIC_ISLAND_MODELS?: string | undefined;
}

/**
 * `?isla=` funciona en desarrollo (`make web-dev`), en los previews de Vercel
 * y en un build local hecho con `NEXT_PUBLIC_ISLAND_MODELS=1`. En la
 * producción de Vercel, nunca, aunque esa variable estuviera puesta.
 */
export function previewModelsEnabled(env: ModelEnv): boolean {
  if (env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
    return false;
  }
  return env.NODE_ENV === 'development' || env.NEXT_PUBLIC_VERCEL_ENV === 'preview' || env.NEXT_PUBLIC_ISLAND_MODELS === '1';
}

/** El modelo que pide la URL (`search`, con su `?`), o el de la portada. */
export function islandModelFor(search: string, enabled: boolean): IslandModel {
  if (!enabled) {
    return DEFAULT_MODEL;
  }
  const id = new URLSearchParams(search).get('isla');
  return (id !== null && Object.hasOwn(PREVIEW_MODELS, id) ? PREVIEW_MODELS[id] : undefined) ?? DEFAULT_MODEL;
}

/**
 * El modelo de esta página. Se llama en el cliente, dentro de un efecto: lee
 * `window.location` en lugar de `useSearchParams`, que haría dinámica la portada.
 */
export function currentIslandModel(): IslandModel {
  return islandModelFor(
    window.location.search,
    // Escritas así, literales, para que Next.js las sustituya en el bundle.
    previewModelsEnabled({
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
      NEXT_PUBLIC_ISLAND_MODELS: process.env.NEXT_PUBLIC_ISLAND_MODELS,
    }),
  );
}
