import { Heading, SimpleGrid, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';

import { WorkCard } from '@/components/work-card';
import { localizedPath } from '@/lib/content/routes';
import type { SiteContent } from '@/lib/content/types';
import { pageMetadata } from '@/lib/seo';
import { works } from '@/lib/site';

export function worksMetadata(content: SiteContent): Metadata {
  return pageMetadata({
    title: content.ui.works.title,
    description: content.ui.works.description,
    path: localizedPath(content.locale, '/works'),
    locale: content.locale,
    ogLocale: content.ogLocale,
    languages: { es: '/works', en: localizedPath('en', '/works') },
  });
}

/** Rejilla de trabajos en un idioma. */
export function WorksView({ content }: { content: SiteContent }) {
  return (
    <Stack gap="8">
      <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="800">
        {content.ui.works.title}
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="6">
        {works.map((work, index) => (
          <WorkCard
            key={work.id}
            work={work}
            text={content.works[work.id]}
            href={localizedPath(content.locale, `/works/${work.id}`)}
            priority={index < 2}
            index={index}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
