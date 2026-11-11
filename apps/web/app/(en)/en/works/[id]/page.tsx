import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { workMetadata, WorkView } from '@/components/portfolio/work-view';
import { en } from '@/lib/content/en';
import { findWork, works } from '@/lib/site';

// Solo existen los trabajos de lib/site.ts: cualquier otro id es 404.
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams(): { id: string }[] {
  return works.map((work) => ({ id: work.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const work = findWork((await params).id);

  return work ? workMetadata(en, work) : {};
}

export default async function EnglishWorkPage({ params }: PageProps) {
  const work = findWork((await params).id);
  if (!work) {
    notFound();
  }

  return <WorkView content={en} work={work} />;
}
