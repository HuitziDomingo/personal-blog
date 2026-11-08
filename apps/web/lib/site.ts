import type { StaticImageData } from 'next/image';

import aum from '@/assets/img/works/aum.webp';
import dalyza from '@/assets/img/works/dalyza.webp';
import debred from '@/assets/img/works/debred.webp';
import familiaDebred from '@/assets/img/works/familia-debred.webp';
import youtube from '@/assets/img/works/youtube.webp';

/**
 * Contenido del sitio, migrado de next-chakraUI (commit d627669; inventario en
 * Obsidian, «Web actual - inventario para migrar»). Solo se corrigieron
 * ortografía y puntuación; no hay texto nuevo.
 */
export const profile = {
  name: 'Huitzitzili Domingo León Nieves',
  shortName: 'Huitzitzili León',
  greeting: 'Hola, soy León, desarrollador Node.js con residencia en CDMX (maestro a veces, discípulo siempre).',
  tagline: 'Actualmente buscando oportunidades como Tech Lead para construir equipos y productos de alto impacto.',
  /** Tarjeta de autor al final de los posts (footer-blog-bio.js). */
  authorBadge: 'Programador',
  authorRole: 'MERN STACK Developer',
} as const;

export const siteDescription = 'Blog técnico sobre orquestación de agentes de IA.';

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
    network: 'Discord',
    label: 'Huitzitzili#5253',
    href: 'https://discord.com/channels/618867779541401600/619600143204745246',
  },
];

/** Párrafos de «Acerca de mí»; `{debred}` marca dónde va el link a Debred. */
export const about: readonly string[] = [
  'Soy desarrollador full-stack con más de 5 años de experiencia, especializado en Node.js. Mi trayectoria incluye liderazgo técnico y un enfoque apasionado tanto en frontend como en backend.',
  'Mi experiencia más significativa fue cofundar y desarrollar {debred}, una agencia freelance donde coordiné proyectos de extremo a extremo.',
  'Aunque disfruto el desarrollo móvil, mi verdadera pasión es el liderazgo técnico: guiar equipos, tomar decisiones de arquitectura y crear soluciones escalables.',
];

export const debredUrl = 'https://www.debred.com';

export interface BioEntry {
  period: string;
  title: string;
  description?: string;
}

export const bio: readonly BioEntry[] = [
  { period: '1993', title: 'Nacimiento en CDMX, México.' },
  { period: '2014 - Actualidad', title: 'Trabajo freelance en Debred como frontend developer.' },
  {
    period: '2018-Ago',
    title: 'Frontend Developer en Prossa',
    description:
      'Ajustes de aplicaciones web usando tecnologías como HTML, CSS, JavaScript y la librería jQuery. Contratado por proyecto.',
  },
  {
    period: '2019-Feb',
    title: 'Frontend Developer en Deq',
    description:
      'Diseño de sitios web a partir de un mock-up en el software Adobe XD. Uso de algunas herramientas de CSS, como Bootstrap, y de JavaScript, como jQuery, para la construcción y el diseño de aplicaciones web.',
  },
  {
    period: '2021-Feb',
    title: 'Backend Developer en Anemona',
    description:
      'Colaboración en una aplicación de mapas usando como lenguajes principales PHP y JavaScript, así como algunos frameworks, tales como jQuery y Bootstrap.',
  },
  {
    period: '2021-Nov',
    title: 'Frontend Developer en Black Trust',
    description:
      'Desarrollo de aplicación web con tecnologías como React, Firebase, Material UI y Sass, y microservicios con Express.js.',
  },
  {
    period: '2023-Jun',
    title: 'Frontend Developer and Tech Lead en Tata Consultancy Services',
    description:
      'Desarrollo de aplicación web de software bancario, uso de Angular, CI/CD, dominio de TypeScript, así como patrones de arquitectura. Apoyo al equipo de desarrollo tanto en frontend como en backend. Capacitación a colaboradores en la empresa en el desarrollo de software avanzado.',
  },
];

export interface WorkSection {
  paragraphs: readonly string[];
  image: { src: StaticImageData; alt: string };
}

export interface Work {
  id: string;
  /** Título en la rejilla de /works. */
  title: string;
  /** Título en la página del trabajo. */
  heading: string;
  year: string;
  summary: string;
  link: { label: string; href: string };
  sections: readonly WorkSection[];
}

export const works: readonly Work[] = [
  {
    id: 'debred',
    title: 'Debred',
    heading: 'Debred',
    year: '2014',
    summary:
      'Algunos trabajos que he realizado de manera freelance con un pequeño equipo de amigos de la universidad.',
    link: { label: 'https://www.debred.com', href: 'https://www.debred.com' },
    sections: [
      {
        paragraphs: [
          'Un sitio web para hacer posible tu proyecto en la web.',
          'Colaboro como programador frontend de forma freelance.',
        ],
        image: { src: debred, alt: 'Página de inicio de Debred: «Desarrollemos tu proyecto web».' },
      },
      {
        paragraphs: ['Colaboradores freelancers.'],
        image: { src: familiaDebred, alt: 'El equipo de Debred posando en una sala.' },
      },
    ],
  },
  {
    id: 'youtube',
    title: 'YouTube',
    heading: 'YouTube',
    year: '2021',
    summary: 'Este es un pequeño proyecto donde doy una introducción a la programación con React Native.',
    link: { label: 'MexicanDevelopers', href: 'https://www.youtube.com/channel/UCujmxDXST1nMxdzIojyMD0g' },
    sections: [
      {
        paragraphs: [
          'Aquí enseño cómo usar el framework de React Native.',
          'Desde la instalación de herramientas CLI en Windows 10.',
        ],
        image: { src: youtube, alt: 'Canal de YouTube MexicanDevelopers con el video «Instalando React Native, Chocolatey, Yarn y Expo».' },
      },
    ],
  },
  {
    id: 'dalyza',
    title: 'Dalyza',
    heading: 'Dalyza',
    year: '2016',
    summary:
      'Un sitio web con su landing page, para vender servicios de lavado de alfombras, venta de persianas y pisos, entre otras cosas del nicho.',
    link: { label: 'https://www.dalyza.com', href: 'https://www.dalyza.com' },
    sections: [
      {
        paragraphs: [
          'Un sitio web con su landing page, para vender servicios de lavado de alfombras, venta de persianas y pisos, entre otras cosas del nicho.',
          'Colaboración como programador frontend de forma freelance.',
        ],
        image: { src: dalyza, alt: 'Página de inicio de Dalyza: «Dale vida a tu hogar», persianas, alfombras y laminados.' },
      },
    ],
  },
  {
    id: 'aum',
    title: 'Aum Internacional',
    heading: 'AUM',
    year: '2019',
    summary:
      'Un sitio web informativo de una asociación espiritual y filosófica, basada en vegetarianismo y cultura.',
    link: { label: 'https://www.auminternacional.com', href: 'https://www.auminternacional.com' },
    sections: [
      {
        paragraphs: [
          'Un sitio web informativo de una asociación espiritual y filosófica, basada en vegetarianismo y cultura.',
          'Colaboro como programador frontend de forma freelance.',
        ],
        image: { src: aum, alt: 'Página de inicio de A.U.M., Acción por la Unidad Mundial.' },
      },
    ],
  },
];

export function findWork(id: string): Work | undefined {
  return works.find((work) => work.id === id);
}

/** Video destacado de la sección de posts de la web anterior. */
export const featuredVideo = {
  title: 'Mi canal de YouTube',
  href: 'https://www.youtube.com/watch?v=ftxucvCPvys',
} as const;
