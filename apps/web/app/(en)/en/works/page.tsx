import { worksMetadata, WorksView } from '@/components/portfolio/works-view';
import { en } from '@/lib/content/en';

export const metadata = worksMetadata(en);

export default function EnglishWorksPage() {
  return <WorksView content={en} />;
}
