import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import type { Metadata } from "next";

import { ExternalLink } from "@/components/external-link";
import { SectionHeading } from "@/components/section-heading";
import { glassTeal, palette } from "@/lib/brand";
import { localizedPath } from "@/lib/content/routes";
import type { SiteContent } from "@/lib/content/types";
import { pageMetadata } from "@/lib/seo";
import { cvContact, profile } from "@/lib/site";

export function cvMetadata(content: SiteContent): Metadata {
  return pageMetadata({
    title: content.ui.cv.title,
    description: content.ui.cv.description,
    path: localizedPath(content.locale, "/cv"),
    locale: content.locale,
    ogLocale: content.ogLocale,
    languages: { es: "/cv", en: localizedPath("en", "/cv") },
  });
}

/** Lista con viñetas, para los logros y las listas cortas del CV. */
function Bullets({ items }: { items: readonly string[] }) {
  return (
    <Box as="ul" ps="5" listStyleType="disc" lineHeight="1.7">
      {items.map((item) => (
        <Box as="li" key={item} mt="1">
          {item}
        </Box>
      ))}
    </Box>
  );
}

/**
 * CV en HTML en un idioma (ADR-028): el contenido sale de lib/content y el
 * botón de descarga solo aparece si la API tiene un PDF vigente de ese idioma.
 */
export function CvView({
  content,
  pdfUrl,
}: {
  content: SiteContent;
  pdfUrl: string | null;
}) {
  const { cv } = content;
  const { headings } = content.ui.cv;

  return (
    <Stack gap="10">
      <Stack as="header" gap="3">
        <Heading
          as="h1"
          fontSize={{ base: "3xl", md: "4xl" }}
          fontWeight="800"
          lineHeight="1.15"
        >
          {profile.name}
        </Heading>
        <Text fontSize={{ base: "md", md: "lg" }} fontWeight="600">
          {cv.headline}
        </Text>
        {pdfUrl && (
          <Flex
            className="glass"
            borderWidth="1px"
            borderRadius="xl"
            p="4"
            gap="3"
            direction={{ base: "column", sm: "row" }}
            align={{ base: "stretch", sm: "center" }}
            justify="space-between"
            alignSelf={{ sm: "start" }}
          >
            <Text color="fg.muted" fontSize="sm" aria-hidden="true">
              {content.ui.cv.downloadDetail}
            </Text>
            {/* Otro origen (el del almacenamiento, ADR-028, punto 6): sirve el PDF como descarga. */}
            <Button
              asChild
              bg={glassTeal}
              color={palette.light.fg}
              _hover={{ opacity: 0.9 }}
              size="md"
              minH="11"
            >
              <a
                href={pdfUrl}
                aria-label={`${content.ui.cv.download} (${content.ui.cv.downloadDetail})`}
              >
                {content.ui.cv.download}
              </a>
            </Button>
          </Flex>
        )}
      </Stack>

      <Box as="section" aria-labelledby="cv-resumen">
        <SectionHeading id="cv-resumen">{headings.summary}</SectionHeading>
        <Text lineHeight="1.75">{cv.summary}</Text>
      </Box>

      <Box as="section" aria-labelledby="cv-experiencia">
        <SectionHeading id="cv-experiencia">
          {headings.experience}
        </SectionHeading>
        <Stack gap="6">
          {cv.experience.map((job, index) => (
            <Box
              as="article"
              key={`${job.company}-${job.period}`}
              aria-labelledby={`cv-puesto-${String(index)}`}
            >
              <Heading
                as="h3"
                fontSize="lg"
                fontWeight="700"
                id={`cv-puesto-${String(index)}`}
              >
                {job.role}
              </Heading>
              <Text color="fg.muted" fontSize="sm" mt="1">
                {job.company} · {job.place} · {job.period}
              </Text>
              <Bullets items={job.points} />
            </Box>
          ))}
        </Stack>
      </Box>

      <Box as="section" aria-labelledby="cv-proyecto">
        <SectionHeading id="cv-proyecto">{headings.project}</SectionHeading>
        <Heading as="h3" fontSize="lg" fontWeight="700">
          {cv.project.name}
        </Heading>
        <Text color="fg.muted" fontSize="sm" mt="1">
          {cv.project.meta}
        </Text>
        <Bullets items={cv.project.points} />
      </Box>

      <Box as="section" aria-labelledby="cv-stack">
        <SectionHeading id="cv-stack">{headings.stack}</SectionHeading>
        <Box
          as="dl"
          display="grid"
          gridTemplateColumns={{ base: "1fr", sm: "max-content 1fr" }}
          columnGap="6"
          rowGap="2"
        >
          {cv.stack.map((area) => (
            <Box key={area.area} display="contents">
              <Box as="dt" fontWeight="700">
                {area.area}
              </Box>
              <Box as="dd" mb={{ base: "2", sm: "0" }} lineHeight="1.7">
                {area.items}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Box as="section" aria-labelledby="cv-ia">
        <SectionHeading id="cv-ia">{headings.aiEngineering}</SectionHeading>
        <Bullets items={cv.aiEngineering} />
      </Box>

      <Box
        display="grid"
        gridTemplateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
        gap="8"
      >
        <Box as="section" aria-labelledby="cv-educacion">
          <SectionHeading id="cv-educacion">
            {headings.education}
          </SectionHeading>
          <Bullets items={cv.education} />
        </Box>
        <Box as="section" aria-labelledby="cv-en-curso">
          <SectionHeading id="cv-en-curso">
            {headings.inProgress}
          </SectionHeading>
          <Bullets items={cv.inProgress} />
        </Box>
        <Box as="section" aria-labelledby="cv-idiomas">
          <SectionHeading id="cv-idiomas">{headings.languages}</SectionHeading>
          <Bullets items={cv.languages} />
        </Box>
      </Box>

      <Box as="section" aria-labelledby="cv-contacto">
        <SectionHeading id="cv-contacto">{headings.contact}</SectionHeading>
        <Box
          as="ul"
          listStyleType="none"
          display="flex"
          flexWrap="wrap"
          gap="4"
        >
          {cvContact.map((link) => (
            <li key={link.network}>
              <ExternalLink
                href={link.href}
                display="inline-flex"
                alignItems="center"
                minH="11"
              >
                <Box as="span" fontWeight="700" me="2">
                  {link.network}
                </Box>
                {link.label}
              </ExternalLink>
            </li>
          ))}
        </Box>
      </Box>
    </Stack>
  );
}
