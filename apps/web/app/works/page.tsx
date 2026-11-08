import { Heading, SimpleGrid, Stack } from '@chakra-ui/react';

import { WorkCard } from '@/components/work-card';
import { pageMetadata } from '@/lib/seo';
import { works } from '@/lib/site';

export const metadata = pageMetadata({
  title: 'Trabajos',
  description: 'Proyectos en los que he trabajado: Debred, YouTube, Dalyza y Aum Internacional.',
  path: '/works',
});

export default function WorksPage() {
  return (
    <Stack gap="8">
      <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="800">
        Trabajos
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="6">
        {works.map((work, index) => (
          <WorkCard key={work.id} work={work} priority={index < 2} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
