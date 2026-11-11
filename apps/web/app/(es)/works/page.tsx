import { worksMetadata, WorksView } from '@/components/portfolio/works-view';
import { es } from '@/lib/content/es';

export const metadata = worksMetadata(es);

export default function WorksPage() {
  return <WorksView content={es} />;
}
