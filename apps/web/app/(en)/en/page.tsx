import { homeMetadata, HomeView } from '@/components/portfolio/home-view';
import { postsApi } from '@/lib/api';
import { en } from '@/lib/content/en';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;

/** Posts recientes en la portada. */
const LATEST_POSTS = 3;

export const metadata = homeMetadata(en);

export default async function EnglishHomePage() {
  // La misma petición que /blog: la caché de Next la comparte (ADR-020).
  const latest = (await postsApi.listPublished()).items.slice(0, LATEST_POSTS);

  return <HomeView content={en} latest={latest} />;
}
