import { homeMetadata, HomeView } from '@/components/portfolio/home-view';
import { postsApi } from '@/lib/api';
import { es } from '@/lib/content/es';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;

/** Posts recientes en la portada. */
const LATEST_POSTS = 3;

export const metadata = homeMetadata(es);

export default async function HomePage() {
  // La misma petición que /blog: la caché de Next la comparte (ADR-020).
  const latest = (await postsApi.listPublished()).items.slice(0, LATEST_POSTS);

  return <HomeView content={es} latest={latest} />;
}
