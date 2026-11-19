import type { SiteContent } from "./types";

/**
 * Textos en inglés. Perfil, «Acerca de mí», trayectoria y trabajos salen del
 * documento «Textos del portafolio (ES / EN)», aprobado por León (ADR-024,
 * punto 8). El resto es un borrador de BLOG-105 (ADR-024, punto 8: puede salir
 * de un LLM), que León revisa en el PR antes del merge.
 */
export const en: SiteContent = {
  locale: "en",
  htmlLang: "en",
  ogLocale: "en_US",
  intlLocale: "en-US",

  profile: {
    greeting:
      "Hi, I'm León, a senior full-stack developer based in Mexico City (sometimes a teacher, always a student).",
    tagline:
      "Open to remote roles as a Senior Full-Stack Developer or Tech Lead.",
    authorBadge: "Full-Stack",
    authorRole: "Senior Full-Stack Developer",
  },
  siteDescription:
    "León Nieves' portfolio, plus a technical blog (in Spanish) on software development and AI agent orchestration.",
  about: [
    "I'm a full-stack developer with 5+ years of production experience in TypeScript: Angular and React on the frontend, Node.js and NestJS on the backend, and MongoDB and PostgreSQL for data. These days I also build in Go.",
    "At Tata Consultancy Services I built an Angular banking dashboard for Citi Banamex and trained 50+ developers through internal courses. Before that I co-founded {debred}, a freelance team where I delivered web projects end to end.",
    "My current project is this site: a Go API with hexagonal architecture, an Angular admin and a Next.js frontend, with an AI writing assistant and every key decision recorded in ADRs. What I care about most is technical leadership: architecture, security and teams that ship with quality.",
  ],
  bio: [
    {
      period: "2026",
      title: "Freelance project, Santo Sazón.",
      description:
        "Catering platform in production: NestJS API, Angular dashboard, React Native app and Astro landing page, deployed on Google Cloud.",
    },
    {
      period: "2026 – present",
      title: "Personal project, huitzi.xyz.",
      description:
        "Go API, Angular admin, Next.js frontend, MongoDB and an AI writing assistant (Gemini) that costs $0 by design.",
    },
    {
      period: "2023 – Feb 2026",
      title:
        "Interim Tech Lead & Senior Developer at Tata Consultancy Services.",
      description:
        "Angular banking dashboard for Citi Banamex, with CI/CD, TypeScript and architecture patterns. Supported the team across frontend and backend, and trained 50+ developers internally.",
    },
    {
      period: "2021 – 2022",
      title: "Frontend Developer at Black Trust.",
      description:
        "Web app with React, Firebase, Material UI and Sass, plus Express.js microservices.",
    },
    {
      period: "2020",
      title: "Frontend Developer at Deq.",
      description:
        "Websites built from Adobe XD designs, using Bootstrap and jQuery.",
    },
    {
      period: "2018",
      title: "Frontend Developer at Prossa.",
      description:
        "Improvements to web apps with HTML, CSS, JavaScript and jQuery, on a per-project basis.",
    },
    {
      period: "2014 – present",
      title: "Co-founder and freelance frontend developer at {debred}.",
    },
  ],
  works: {
    "santo-sazon": {
      summary:
        "Full-stack platform for a family catering business in Mexico City: mobile app, admin dashboard, API and landing page. Orders, Mercado Pago payments, WhatsApp notifications and an AI assistant powered by MCP.",
      sections: [
        [
          "A family business took orders only by WhatsApp and phone. I designed, built and deployed end to end an ecosystem of four applications in an Nx monorepo sharing TypeScript types: a NestJS API with PostgreSQL, an Angular dashboard with Taiga UI, a React Native mobile app with Expo, and an Astro landing page.",
        ],
        [
          "Mercado Pago payments always computed on the server, with signature-verified webhooks. Sessions with rotating refresh tokens and reuse detection. An AI chat that browses the menu and places orders through MCP, always with the user's permissions. Account deletion with anonymization of personal data.",
        ],
        [
          "CI/CD with GitHub Actions to Google Cloud Run, more than 1,100 automated tests, decisions documented in ADRs, and an OWASP-based security audit before launch. I used AI agents to support the implementation; I defined the architecture, reviewed every change and ran production.",
        ],
      ],
      imageAlts: [
        "Santo Sazón home page on desktop: “El sazón de casa, servido para tu evento” over a table of Mexican dishes, with the “Ver menú” and “Pedir por WhatsApp” buttons.",
        "The same Santo Sazón home page on a phone, with the compact menu and the buttons stacked.",
      ],
    },
    "huitzi-xyz": {
      summary:
        "This site, built as a real product: a Go API with hexagonal architecture, an Angular admin, a Next.js frontend, a read-only MCP server and an AI writing assistant with cost limits, security controls and human review. Every decision is documented in public ADRs.",
      sections: [
        [
          "This site, built as a real product: a Go API with hexagonal architecture, an Angular admin, a Next.js frontend, a read-only MCP server and an AI writing assistant with cost limits, security controls and human review. Every decision is documented in public ADRs.",
        ],
      ],
      imageAlts: [
        "huitzi.xyz home page: León’s greeting and photo, and the “About me” section.",
      ],
    },
    debred: {
      summary:
        "Freelance web projects with a small team of university friends. I contribute as a frontend developer.",
      sections: [
        [
          "Freelance web projects with a small team of university friends. I contribute as a frontend developer.",
        ],
        ["Freelance collaborators."],
      ],
      imageAlts: [
        "Debred home page: “Let’s build your web project”.",
        "The Debred team posing in a room.",
      ],
    },
    youtube: {
      summary:
        "An introduction to programming with React Native, starting from installing the tools on Windows 10 (in Spanish).",
      sections: [
        [
          "An introduction to programming with React Native, starting from installing the tools on Windows 10 (in Spanish).",
        ],
      ],
      imageAlts: [
        "MexicanDevelopers YouTube channel with the video “Installing React Native, Chocolatey, Yarn and Expo”.",
      ],
    },
    dalyza: {
      summary:
        "Website and landing page selling carpet cleaning, blinds, flooring and other home services. Freelance frontend development.",
      sections: [
        [
          "Website and landing page selling carpet cleaning, blinds, flooring and other home services. Freelance frontend development.",
        ],
      ],
      imageAlts: [
        "Dalyza home page: “Bring your home to life”, with blinds, carpets and laminate flooring.",
      ],
    },
    aum: {
      summary:
        "Informational website for a spiritual and philosophical association centered on vegetarianism and culture. Freelance frontend development.",
      sections: [
        [
          "Informational website for a spiritual and philosophical association centered on vegetarianism and culture. Freelance frontend development.",
        ],
      ],
      imageAlts: [
        "Home page of A.U.M., Acción por la Unidad Mundial (Action for World Unity).",
      ],
    },
  },

  cv: {
    headline:
      "Tech Lead · Senior Full-Stack Developer — Angular · React · Node.js · NestJS · Google Cloud",
    summary:
      "Full-Stack Developer with 5+ years of commercial experience in Angular, React, Node.js and NestJS, and technical leadership as Interim Tech Lead on a critical Citi Banamex banking dashboard at TCS. Designed, built, deployed and run Santo Sazón solo, end to end: a 4-app production platform for a real catering business, with 30+ ADRs, CI/CD and security practices. Mentored 50+ developers. Use Claude Code as an implementation agent, with every change reviewed manually.",
    experience: [
      {
        role: "Interim Tech Lead & Senior Developer — Angular / Node.js",
        company: "Tata Consultancy Services",
        place: "Mexico City",
        period: "2023 – Feb 2026",
        points: [
          "Led architecture decisions, code reviews and delivery on a Citi Banamex banking dashboard, guiding 2 senior developers through critical milestones.",
          "Defined API contracts and coordinated with backend, QA and product teams; project concluded successfully in Feb 2026.",
          "Mentored 50+ developers through internal courses (React + TypeScript, Next.js) with shared repositories.",
        ],
      },
      {
        role: "Frontend Developer",
        company: "Black Trust",
        place: "Mexico City",
        period: "2021 – 2022",
        points: [
          "Built the Self Trust legal-documentation platform (React, Node.js, MongoDB), integrating Mexico's CURP identity system and secure payment processing.",
        ],
      },
      {
        role: "Frontend Developer",
        company: "Deq",
        place: "Mexico City",
        period: "2020",
        points: [
          "Developed and maintained responsive websites with custom designs using Bootstrap, Twig and jQuery.",
        ],
      },
    ],
    project: {
      name: "Santo Sazón — Catering Order Platform",
      meta: "solo design, build, deployment and operation; in production since Oct 2026; private repository",
      points: [
        "Nx + pnpm monorepo with 4 apps (NestJS / TypeORM / PostgreSQL API with REST, WebSockets and an MCP server; Angular admin dashboard; React Native (Expo) mobile app; Astro landing page).",
        "Integrations: Mercado Pago Checkout Pro with webhooks, Meta WhatsApp Cloud API, backend-generated PDF receipts.",
        "CI/CD with GitHub Actions and Workload Identity Federation; deploys only the app that changed.",
        "Cloud Run, Secret Manager, Artifact Registry, Supabase, Firebase Hosting, Cloudflare.",
        "Multi-stage Docker cut the image from 1.39 GB to 412 MB.",
        "Security: gitleaks in CI, pnpm audit, database RLS.",
        "30+ ADRs and a deploy/rollback runbook.",
      ],
    },
    stack: [
      {
        area: "Frontend",
        items: "Angular, React, TypeScript, RxJS, React Native (Expo), Astro",
      },
      {
        area: "Backend",
        items: "Node.js, NestJS, Express.js, Go, REST, GraphQL, WebSockets",
      },
      { area: "Databases", items: "PostgreSQL, MongoDB, TypeORM, Supabase" },
      {
        area: "Cloud & DevOps",
        items:
          "Google Cloud: Cloud Run, Secret Manager, Artifact Registry, Firebase Hosting; Docker, GitHub Actions, Cloudflare, Nx / pnpm monorepos",
      },
      { area: "Testing", items: "unit, integration and E2E" },
    ],
    aiEngineering: [
      "Claude Code as implementation agent with manual review of every change",
      "MCP servers in own applications for LLM-driven features",
      "ADRs and Obsidian for architecture notes",
      "NotebookLM for research",
    ],
    education: [
      "Computer Engineering — Instituto Politécnico Nacional (coursework, not completed)",
      "Software Engineering — UACM (coursework, not completed)",
    ],
    inProgress: [
      "GCP Associate Cloud Engineer",
      "Scrum Master (Scrum.org)",
      "Claude Certified Architect – Foundations",
    ],
    languages: ["Spanish — Native", "English — B2"],
  },

  ui: {
    skipLink: "Skip to content",
    homeLinkLabel: "Huitzitzili León, home",
    primaryNav: "Main",
    nav: { home: "Home", works: "Work", cv: "Resume", blog: "Blog" },
    blogLanguageNote: "in Spanish",
    menuLabel: "Navigation menu",
    colorMode: {
      group: "Theme",
      change: "Change theme",
      current: "Theme",
      light: "Light",
      dark: "Dark",
      system: "System",
    },
    languageSwitch: { label: "Español", hrefLang: "es", lang: "es" },
    footer: { social: "Social", rss: "Blog RSS feed" },
    home: {
      photoAlt: "Photo of Huitzitzili Domingo León Nieves",
      island: {
        alt: "Floating island of hexagons with a medieval village: a stone castle with red roofs, a church, houses, a windmill and a forest, on hanging rocks among clouds",
        label: "Interactive 3D island",
        loading: "Loading 3D island",
        instructions:
          "When it loads, the island spins ten times quickly, slows down and then keeps turning slowly; it pauses while you drag it and picks up again when you let go. With a mouse, drag sideways to turn it and up or down to tilt it, all the way over, right-drag to pan and, after clicking, use the wheel to zoom in towards the pointer or zoom out. With a keyboard, arrow keys to rotate and Shift plus arrow keys to pan. On a touch screen, drag with two fingers to rotate and pinch to zoom. Double-click or press R to reset the view.",
      },
      about: "About me",
      bio: "Experience",
      latestPosts: "Latest posts",
      noPosts: "No posts published yet.",
      allPosts: "See all posts",
      worksButton: "My work and projects",
      onTheWeb: "Find me online",
    },
    works: {
      title: "Work",
      description: "My work and projects.",
      breadcrumb: "Breadcrumb",
      website: "Website",
    },
    cv: {
      title: "Resume",
      description:
        "Huitzitzili León's resume: Tech Lead and senior full-stack developer.",
      download: "Download PDF",
      downloadDetail: "English resume, PDF file",
      headings: {
        summary: "Summary",
        experience: "Experience",
        project: "Featured project",
        stack: "Stack",
        aiEngineering: "AI-assisted engineering",
        education: "Education",
        inProgress: "In progress",
        languages: "Languages",
        contact: "Contact",
      },
    },
    error: {
      title: "We couldn't load this page",
      body: "Please try again in a few seconds.",
      retry: "Try again",
    },
  },
};
