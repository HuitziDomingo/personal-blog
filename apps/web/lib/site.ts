import type { StaticImageData } from 'next/image';

import aum from '@/assets/img/works/aum.webp';
import dalyza from '@/assets/img/works/dalyza.webp';
import debred from '@/assets/img/works/debred.webp';
import familiaDebred from '@/assets/img/works/familia-debred.webp';
import youtube from '@/assets/img/works/youtube.webp';

import { es } from './content/es';
import type { WorkId } from './content/types';

/**
 * Datos del sitio que no cambian con el idioma: nombres, redes, links e
 * imágenes. Los textos de cada idioma están en lib/content (ADR-024).
 */
export const profile = {
  name: 'Huitzitzili Domingo León Nieves',
  shortName: 'Huitzitzili León',
} as const;

/** Descripción del blog, que solo existe en español (ADR-024, punto 1). */
export const siteDescription = es.siteDescription;

export interface ExternalLink {
  label: string;
  network: string;
  href: string;
}

export const socialLinks: readonly ExternalLink[] = [
  { network: 'GitHub', label: '@HuitziDomingo', href: 'https://github.com/HuitziDomingo' },
  { network: 'YouTube', label: 'MexicanDevelopers', href: 'https://www.youtube.com/channel/UCujmxDXST1nMxdzIojyMD0g' },
  {
    network: 'LinkedIn',
    label: '@HuitziDomingo',
    href: 'https://www.linkedin.com/in/huitzitzili-domingo-le%C3%B3n-nieves-0b32a953/',
  },
  {
    // Pendiente de León: hoy apunta a un canal, no a su usuario.
    network: 'Discord',
    label: 'Huitzitzili#5253',
    href: 'https://discord.com/channels/618867779541401600/619600143204745246',
  },
];

export const debredUrl = 'https://www.debred.com';

export interface Work {
  id: WorkId;
  /** Título en la rejilla de /works. */
  title: string;
  /** Título en la página del trabajo. */
  heading: string;
  year: string;
  link: { label: string; href: string };
  /** Una imagen por sección, en el orden de los textos de lib/content. */
  images: readonly StaticImageData[];
}

/** Trabajos, en el orden del documento de textos: el más reciente primero, luego los anteriores. */
export const works: readonly Work[] = [
  {
    id: 'huitzi-xyz',
    title: 'huitzi.xyz',
    heading: 'huitzi.xyz',
    year: '2026',
    link: { label: 'https://huitzi.xyz', href: 'https://huitzi.xyz' },
    images: [],
  },
  {
    id: 'debred',
    title: 'Debred',
    heading: 'Debred',
    year: '2014',
    link: { label: 'https://www.debred.com', href: 'https://www.debred.com' },
    images: [debred, familiaDebred],
  },
  {
    id: 'youtube',
    title: 'YouTube',
    heading: 'YouTube',
    year: '2021',
    link: { label: 'MexicanDevelopers', href: 'https://www.youtube.com/channel/UCujmxDXST1nMxdzIojyMD0g' },
    images: [youtube],
  },
  {
    id: 'dalyza',
    title: 'Dalyza',
    heading: 'Dalyza',
    year: '2016',
    link: { label: 'https://www.dalyza.com', href: 'https://www.dalyza.com' },
    images: [dalyza],
  },
  {
    id: 'aum',
    title: 'Aum Internacional',
    heading: 'AUM',
    year: '2019',
    link: { label: 'https://www.auminternacional.com', href: 'https://www.auminternacional.com' },
    images: [aum],
  },
];

export function findWork(id: string): Work | undefined {
  return works.find((work) => work.id === id);
}

/** Video destacado de la sección de posts de la web anterior. */
export const featuredVideo = {
  heading: 'Curso de React Native',
  title: 'Mi canal de YouTube',
  href: 'https://www.youtube.com/watch?v=ftxucvCPvys',
} as const;
