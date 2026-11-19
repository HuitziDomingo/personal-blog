import { HONGO } from './island-model-hongo';

/** Un modelo de la isla del hero. */
export interface IslandModel {
  id: string;
  /** `.gltf` con el `.bin` y las texturas aparte (sin URLs `blob:`, por la CSP). */
  url: string;
  /** Animación que se repite en bucle, si el modelo trae una. */
  idleClip?: string;
}

/** La isla de la portada: fortaleza flotante con nubes (BLOG-119). */
export const FORTRESS: IslandModel = { id: 'fortaleza', url: '/models/isla/isla.gltf' };

/**
 * Modelos para comparar con `?isla=<id>` (BLOG-123). Se quitan borrando su
 * entrada aquí, su archivo `island-model-<id>.ts` y su carpeta en `public/models/`.
 */
const PREVIEW_MODELS: Readonly<Record<string, IslandModel>> = { [HONGO.id]: HONGO };

/** Lo que se mira del entorno: Next.js sustituye las dos variables al compilar. */
export interface ModelEnv {
  NODE_ENV?: string | undefined;
  NEXT_PUBLIC_VERCEL_ENV?: string | undefined;
}

/** `?isla=` solo funciona en desarrollo y en los previews de Vercel; en producción, nunca. */
export function previewModelsEnabled(env: ModelEnv): boolean {
  return env.NODE_ENV === 'development' || env.NEXT_PUBLIC_VERCEL_ENV === 'preview';
}

/** El modelo que pide la URL (`search`, con su `?`), o la fortaleza. */
export function islandModelFor(search: string, enabled: boolean): IslandModel {
  if (!enabled) {
    return FORTRESS;
  }
  const id = new URLSearchParams(search).get('isla');
  return (id !== null && Object.hasOwn(PREVIEW_MODELS, id) ? PREVIEW_MODELS[id] : undefined) ?? FORTRESS;
}

/**
 * El modelo de esta página. Se llama en el cliente, dentro de un efecto: lee
 * `window.location` en lugar de `useSearchParams`, que haría dinámica la portada.
 */
export function currentIslandModel(): IslandModel {
  return islandModelFor(
    window.location.search,
    // Escritas así, literales, para que Next.js las sustituya en el bundle.
    previewModelsEnabled({ NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV }),
  );
}
