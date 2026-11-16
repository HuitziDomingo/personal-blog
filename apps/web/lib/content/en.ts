import type { SiteContent } from './types';

/**
 * Textos en inglés. Perfil, «Acerca de mí», trayectoria y trabajos salen del
 * documento «Textos del portafolio (ES / EN)», aprobado por León (ADR-024,
 * punto 8). El resto es un borrador de BLOG-105 (ADR-024, punto 8: puede salir
 * de un LLM), que León revisa en el PR antes del merge.
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
      period: '2026 – present',
      title: 'Personal project, huitzi.xyz.',
      description: 'Go API, Angular admin, Next.js frontend, MongoDB and an AI writing assistant (Gemini) that costs $0 by design.',
    },
    {
      period: '2023 – Feb 2026',
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
    { period: '2014 – present', title: 'Co-founder and freelance frontend developer at {debred}.' },
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
      imageAlts: ['huitzi.xyz home page: León’s greeting and photo, and the “About me” section.'],
    },
    debred: {
      summary: 'Freelance web projects with a small team of university friends. I contribute as a frontend developer.',
      sections: [
        ['Freelance web projects with a small team of university friends. I contribute as a frontend developer.'],
        ['Freelance collaborators.'],
      ],
      imageAlts: [
        'Debred home page: “Let’s build your web project”.',
        'The Debred team posing in a room.',
      ],
    },
    youtube: {
      summary:
        'An introduction to programming with React Native, starting from installing the tools on Windows 10 (in Spanish).',
      sections: [
        ['An introduction to programming with React Native, starting from installing the tools on Windows 10 (in Spanish).'],
      ],
      imageAlts: [
        'MexicanDevelopers YouTube channel with the video “Installing React Native, Chocolatey, Yarn and Expo”.',
      ],
    },
    dalyza: {
      summary:
        'Website and landing page selling carpet cleaning, blinds, flooring and other home services. Freelance frontend development.',
      sections: [
        [
          'Website and landing page selling carpet cleaning, blinds, flooring and other home services. Freelance frontend development.',
        ],
      ],
      imageAlts: ['Dalyza home page: “Bring your home to life”, with blinds, carpets and laminate flooring.'],
    },
    aum: {
      summary:
        'Informational website for a spiritual and philosophical association centered on vegetarianism and culture. Freelance frontend development.',
      sections: [
        [
          'Informational website for a spiritual and philosophical association centered on vegetarianism and culture. Freelance frontend development.',
        ],
      ],
      imageAlts: ['Home page of A.U.M., Acción por la Unidad Mundial (Action for World Unity).'],
    },
  },

  ui: {
    skipLink: 'Skip to content',
    homeLinkLabel: 'Huitzitzili León, home',
    primaryNav: 'Main',
    nav: { home: 'Home', works: 'Work', blog: 'Blog' },
    blogLanguageNote: 'in Spanish',
    menuLabel: 'Navigation menu',
    colorMode: {
      group: 'Theme',
      change: 'Change theme',
      current: 'Theme',
      light: 'Light',
      dark: 'Dark',
      system: 'System',
    },
    languageSwitch: { label: 'Español', hrefLang: 'es', lang: 'es' },
    footer: { social: 'Social', rss: 'Blog RSS feed' },
    home: {
      photoAlt: 'Photo of Huitzitzili Domingo León Nieves',
      about: 'About me',
      bio: 'Experience',
      latestPosts: 'Latest posts',
      noPosts: 'No posts published yet.',
      allPosts: 'See all posts',
      worksButton: 'My work and projects',
      onTheWeb: 'Find me online',
    },
    works: {
      title: 'Work',
      description: 'My work and projects.',
      breadcrumb: 'Breadcrumb',
      website: 'Website',
    },
    error: {
      title: "We couldn't load this page",
      body: 'Please try again in a few seconds.',
      retry: 'Try again',
    },
  },
};
