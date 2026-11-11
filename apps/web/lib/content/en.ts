import { es } from './es';
import { pending } from './pending';
import type { SiteContent } from './types';

/**
 * Textos en inglés. Perfil, «Acerca de mí», trayectoria y trabajos salen del
 * documento «Textos del portafolio (ES / EN)», aprobado por León (ADR-024,
 * punto 8). Lo que el documento no trae va con `pending()`: se muestra en
 * español hasta que León apruebe la traducción.
 */
export const en: SiteContent = {
  locale: 'en',
  htmlLang: 'en',
  ogLocale: 'en_US',
  intlLocale: 'en-US',

  profile: {
    greeting: "Hi, I'm León, a senior full-stack developer based in Mexico City (sometimes a teacher, always a student).",
    tagline: 'Open to remote roles as a Senior Full-Stack Developer or Tech Lead.',
    authorBadge: 'Full-Stack',
    authorRole: 'Senior Full-Stack Developer',
  },
  siteDescription:
    "León Nieves' portfolio, plus a technical blog (in Spanish) on software development and AI agent orchestration.",
  about: [
    "I'm a full-stack developer with 5+ years of production experience in TypeScript: Angular and React on the frontend, Node.js and NestJS on the backend, and MongoDB and PostgreSQL for data. These days I also build in Go.",
    'At Tata Consultancy Services I built an Angular banking dashboard for Citi Banamex and trained 50+ developers through internal courses. Before that I co-founded {debred}, a freelance team where I delivered web projects end to end.',
    'My current project is this site: a Go API with hexagonal architecture, an Angular admin and a Next.js frontend, with an AI writing assistant and every key decision recorded in ADRs. What I care about most is technical leadership: architecture, security and teams that ship with quality.',
  ],
  bio: [
    {
      // El documento trae un solo periodo para los dos idiomas.
      period: pending('2026 – hoy'),
      title: 'Personal project, huitzi.xyz.',
      description: 'Go API, Angular admin, Next.js frontend, MongoDB and an AI writing assistant (Gemini) that costs $0 by design.',
    },
    {
      period: pending('2023 – feb 2026'),
      title: 'Frontend Developer and Tech Lead at Tata Consultancy Services.',
      description:
        'Angular banking dashboard for Citi Banamex, with CI/CD, TypeScript and architecture patterns. Supported the team across frontend and backend, and trained 50+ developers internally.',
    },
    {
      period: '2021 – 2022',
      title: 'Frontend Developer at Black Trust.',
      description: 'Web app with React, Firebase, Material UI and Sass, plus Express.js microservices.',
    },
    {
      period: '2020',
      title: 'Frontend Developer at Deq.',
      description: 'Websites built from Adobe XD designs, using Bootstrap and jQuery.',
    },
    {
      period: '2018',
      title: 'Frontend Developer at Prossa.',
      description: 'Improvements to web apps with HTML, CSS, JavaScript and jQuery, on a per-project basis.',
    },
    { period: pending('2014 – hoy'), title: 'Co-founder and freelance frontend developer at {debred}.' },
  ],
  works: {
    'huitzi-xyz': {
      summary:
        'This site, built as a real product: a Go API with hexagonal architecture, an Angular admin, a Next.js frontend, a read-only MCP server and an AI writing assistant with cost limits, security controls and human review. Every decision is documented in public ADRs.',
      sections: [
        [
          'This site, built as a real product: a Go API with hexagonal architecture, an Angular admin, a Next.js frontend, a read-only MCP server and an AI writing assistant with cost limits, security controls and human review. Every decision is documented in public ADRs.',
        ],
      ],
      imageAlts: [],
    },
    debred: {
      summary: 'Freelance web projects with a small team of university friends. I contribute as a frontend developer.',
      sections: [
        ['Freelance web projects with a small team of university friends. I contribute as a frontend developer.'],
        [pending(es.works.debred.sections[1]?.[0] ?? '')],
      ],
      imageAlts: es.works.debred.imageAlts.map(pending),
    },
    youtube: {
      summary:
        'An introduction to programming with React Native, starting from installing the tools on Windows 10 (in Spanish).',
      sections: [
        ['An introduction to programming with React Native, starting from installing the tools on Windows 10 (in Spanish).'],
      ],
      imageAlts: es.works.youtube.imageAlts.map(pending),
    },
    dalyza: {
      summary:
        'Website and landing page selling carpet cleaning, blinds, flooring and other home services. Freelance frontend development.',
      sections: [
        [
          'Website and landing page selling carpet cleaning, blinds, flooring and other home services. Freelance frontend development.',
        ],
      ],
      imageAlts: es.works.dalyza.imageAlts.map(pending),
    },
    aum: {
      summary:
        'Informational website for a spiritual and philosophical association centered on vegetarianism and culture. Freelance frontend development.',
      sections: [
        [
          'Informational website for a spiritual and philosophical association centered on vegetarianism and culture. Freelance frontend development.',
        ],
      ],
      imageAlts: es.works.aum.imageAlts.map(pending),
    },
  },

  ui: {
    skipLink: pending(es.ui.skipLink),
    homeLinkLabel: pending(es.ui.homeLinkLabel),
    primaryNav: pending(es.ui.primaryNav),
    nav: { home: pending(es.ui.nav.home), works: pending(es.ui.nav.works), blog: 'Blog' },
    blogLanguageNote: pending('en español'),
    menuLabel: pending(es.ui.menuLabel),
    colorMode: {
      group: pending(es.ui.colorMode.group),
      change: pending(es.ui.colorMode.change),
      current: pending(es.ui.colorMode.current),
      light: pending(es.ui.colorMode.light),
      dark: pending(es.ui.colorMode.dark),
      system: pending(es.ui.colorMode.system),
    },
    languageSwitch: { label: 'Español', hrefLang: 'es', lang: 'es' },
    footer: { social: pending(es.ui.footer.social), rss: pending(es.ui.footer.rss) },
    home: {
      photoAlt: pending(es.ui.home.photoAlt),
      about: pending(es.ui.home.about),
      bio: pending(es.ui.home.bio),
      latestPosts: pending(es.ui.home.latestPosts),
      noPosts: pending(es.ui.home.noPosts),
      allPosts: pending(es.ui.home.allPosts),
      worksButton: pending(es.ui.home.worksButton),
      onTheWeb: pending(es.ui.home.onTheWeb),
    },
    works: {
      title: pending(es.ui.works.title),
      description: pending(es.ui.works.description),
      breadcrumb: pending(es.ui.works.breadcrumb),
      website: 'Website',
    },
    error: {
      title: pending(es.ui.error.title),
      body: pending(es.ui.error.body),
      retry: pending(es.ui.error.retry),
    },
  },
};
