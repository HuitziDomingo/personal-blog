import type { SiteContent } from "./types";

/**
 * Textos en español. Perfil, «Acerca de mí», trayectoria y trabajos salen del
 * documento «Textos del portafolio (ES / EN)», aprobado por León (ADR-024,
 * punto 8). Los textos de la interfaz son los que ya tenía el sitio.
 */
export const es: SiteContent = {
  locale: "es",
  htmlLang: "es",
  ogLocale: "es_MX",
  intlLocale: "es-MX",

  profile: {
    greeting:
      "Hola, soy León, desarrollador full-stack senior en la Ciudad de México (maestro a veces, discípulo siempre).",
    tagline:
      "Disponible para trabajo remoto como Senior Full-Stack Developer o Tech Lead.",
    authorBadge: "Full-Stack",
    authorRole: "Senior Full-Stack Developer",
  },
  siteDescription:
    "Portafolio de León Nieves y blog técnico sobre desarrollo de software y orquestación de agentes de IA.",
  about: [
    "Soy desarrollador full-stack con más de 5 años de experiencia en producción con TypeScript: Angular y React en el frontend, Node.js y NestJS en el backend, y MongoDB y PostgreSQL para los datos. Hoy también construyo en Go.",
    "En Tata Consultancy Services desarrollé un dashboard bancario en Angular para Citi Banamex y capacité a más de 50 desarrolladores con cursos internos. Antes cofundé {debred}, un equipo freelance donde llevé proyectos web de principio a fin.",
    "Mi proyecto actual es este sitio: una API en Go con arquitectura hexagonal, un admin en Angular y una web en Next.js, con un asistente de escritura con IA y cada decisión importante documentada en ADRs. Lo que más me interesa es el liderazgo técnico: arquitectura, seguridad y equipos que entregan con calidad.",
  ],
  bio: [
    {
      period: "2026",
      title: "Proyecto freelance, Santo Sazón.",
      description:
        "Plataforma de catering en producción: API en NestJS, panel en Angular, app en React Native y landing en Astro, desplegada en Google Cloud.",
    },
    {
      period: "2026 – hoy",
      title: "Proyecto propio, huitzi.xyz.",
      description:
        "API en Go, admin en Angular, web en Next.js, MongoDB y un asistente de escritura con IA (Gemini) con costo de $0 por diseño.",
    },
    {
      period: "2023 – feb 2026",
      title:
        "Interim Tech Lead & Senior Developer en Tata Consultancy Services.",
      description:
        "Dashboard bancario en Angular para Citi Banamex, con CI/CD, TypeScript y patrones de arquitectura. Apoyo al equipo en frontend y backend, y capacitación interna a más de 50 desarrolladores.",
    },
    {
      period: "2021 – 2022",
      title: "Frontend Developer en Black Trust.",
      description:
        "Aplicación web con React, Node.js, MongoDB, Firebase, Material UI, Sass y Express.js.",
    },
    {
      period: "2020",
      title: "Frontend Developer en Deq.",
      description:
        "Sitios en WordPress con CSS y JavaScript propios, a partir de diseños en Adobe XD, y algo de Symfony/Twig.",
    },
    {
      period: "2018",
      title: "Frontend Developer en Prossa.",
      description:
        "Mejoras a aplicaciones web con HTML, CSS, JavaScript y jQuery, por proyecto.",
    },
    {
      period: "2014 – hoy",
      title: "Cofundador y desarrollador frontend freelance en {debred}.",
    },
  ],
  works: {
    "santo-sazon": {
      summary:
        "Plataforma full-stack para un negocio familiar de catering en CDMX: app móvil, panel de administración, API y landing. Pedidos, pagos con Mercado Pago, avisos por WhatsApp y un asistente con IA que usa MCP.",
      sections: [
        [
          "Un negocio familiar tomaba pedidos solo por WhatsApp y teléfono. Diseñé, construí y desplegué de punta a punta un ecosistema de cuatro aplicaciones en un monorepo Nx que comparten tipos de TypeScript: API en NestJS con PostgreSQL, panel en Angular con Taiga UI, app móvil en React Native con Expo y landing en Astro.",
        ],
        [
          "Pagos con Mercado Pago calculados siempre en el servidor y webhooks con firma verificada. Sesiones con refresh tokens rotativos y detección de reúso. Un chat con IA que consulta el menú y crea pedidos mediante MCP, siempre con los permisos del usuario. Eliminación de cuenta con anonimización de datos personales.",
        ],
        [
          "CI/CD con GitHub Actions hacia Google Cloud Run, más de 1,100 pruebas automatizadas, decisiones documentadas en ADRs y una auditoría de seguridad basada en OWASP antes del lanzamiento. Trabajé con agentes de IA como apoyo en la implementación; yo definí la arquitectura, revisé cada cambio y operé producción.",
        ],
      ],
      imageAlts: [
        "Página de inicio de Santo Sazón en escritorio: «El sazón de casa, servido para tu evento» sobre una mesa con platillos mexicanos, con los botones «Ver menú» y «Pedir por WhatsApp».",
        "La misma página de inicio de Santo Sazón en un teléfono, con el menú compacto y los botones uno debajo del otro.",
      ],
    },
    "huitzi-xyz": {
      summary:
        "Este sitio, construido como un producto real: API en Go con arquitectura hexagonal, admin en Angular, web en Next.js, servidor MCP de solo lectura y un asistente de escritura con IA con límites de costo, seguridad y revisión humana. Cada decisión está documentada en ADRs públicos.",
      sections: [
        [
          "Este sitio, construido como un producto real: API en Go con arquitectura hexagonal, admin en Angular, web en Next.js, servidor MCP de solo lectura y un asistente de escritura con IA con límites de costo, seguridad y revisión humana. Cada decisión está documentada en ADRs públicos.",
        ],
      ],
      imageAlts: [
        "Página de inicio de huitzi.xyz: el saludo de León, su foto y la sección «Acerca de mí».",
      ],
    },
    debred: {
      summary:
        "Proyectos web freelance con un pequeño equipo de amigos de la universidad. Colaboro como desarrollador frontend.",
      sections: [
        [
          "Proyectos web freelance con un pequeño equipo de amigos de la universidad. Colaboro como desarrollador frontend.",
        ],
        ["Colaboradores freelancers."],
      ],
      imageAlts: [
        "Página de inicio de Debred: «Desarrollemos tu proyecto web».",
        "El equipo de Debred posando en una sala.",
      ],
    },
    youtube: {
      summary:
        "Una introducción a la programación con React Native, desde la instalación de las herramientas en Windows 10.",
      sections: [
        [
          "Una introducción a la programación con React Native, desde la instalación de las herramientas en Windows 10.",
        ],
      ],
      imageAlts: [
        "Canal de YouTube MexicanDevelopers con el video «Instalando React Native, Chocolatey, Yarn y Expo».",
      ],
    },
    dalyza: {
      summary:
        "Sitio web con landing page para vender lavado de alfombras, persianas, pisos y otros servicios del hogar. Colaboración freelance como desarrollador frontend.",
      sections: [
        [
          "Sitio web con landing page para vender lavado de alfombras, persianas, pisos y otros servicios del hogar. Colaboración freelance como desarrollador frontend.",
        ],
      ],
      imageAlts: [
        "Página de inicio de Dalyza: «Dale vida a tu hogar», persianas, alfombras y laminados.",
      ],
    },
    aum: {
      summary:
        "Sitio informativo de una asociación espiritual y filosófica basada en el vegetarianismo y la cultura. Colaboración freelance como desarrollador frontend.",
      sections: [
        [
          "Sitio informativo de una asociación espiritual y filosófica basada en el vegetarianismo y la cultura. Colaboración freelance como desarrollador frontend.",
        ],
      ],
      imageAlts: ["Página de inicio de A.U.M., Acción por la Unidad Mundial."],
    },
  },

  cv: {
    headline:
      "Tech Lead · Desarrollador Full-Stack Senior — Angular · React · Node.js · NestJS · Google Cloud",
    summary:
      "Desarrollador full-stack con más de 5 años de experiencia profesional en Angular, React, Node.js y NestJS, y liderazgo técnico como Tech Lead interino en un dashboard bancario crítico de Citi Banamex en TCS. Diseñé, construí, desplegué y opero yo solo, de punta a punta, Santo Sazón: una plataforma de 4 aplicaciones en producción para un negocio real de catering, con más de 30 ADRs, CI/CD y prácticas de seguridad. He sido mentor de más de 50 desarrolladores. Uso Claude Code como agente de implementación y reviso a mano cada cambio.",
    experience: [
      {
        role: "Interim Tech Lead & Senior Developer — Angular / Node.js",
        company: "Tata Consultancy Services",
        place: "Ciudad de México",
        period: "2023 – feb 2026",
        points: [
          "Lideré las decisiones de arquitectura, las revisiones de código y las entregas de un dashboard bancario de Citi Banamex, y guié a 2 desarrolladores senior en hitos críticos.",
          "Definí los contratos de la API y coordiné con los equipos de backend, QA y producto; el proyecto concluyó con éxito en febrero de 2026.",
          "Fui mentor de más de 50 desarrolladores con cursos internos (React + TypeScript, Next.js) y repositorios compartidos.",
        ],
      },
      {
        role: "Frontend Developer",
        company: "Black Trust",
        place: "Ciudad de México",
        period: "2021 – 2022",
        points: [
          "Construí Self Trust, una plataforma de documentación legal (React, Node.js, MongoDB), con integración al sistema de identidad CURP y procesamiento de pagos seguro.",
        ],
      },
      {
        role: "Frontend Developer",
        company: "Deq",
        place: "Ciudad de México",
        period: "2020",
        points: [
          "Desarrollé sitios en WordPress con CSS y JavaScript propios, a partir de diseños en Adobe XD, y algo de Symfony/Twig.",
        ],
      },
    ],
    project: {
      name: "Santo Sazón — Plataforma de pedidos de catering",
      meta: "diseño, construcción, despliegue y operación en solitario; en producción desde octubre de 2026; repositorio privado",
      points: [
        "Monorepo con Nx y pnpm con 4 aplicaciones (API en NestJS, TypeORM y PostgreSQL con REST, WebSockets y un servidor MCP; panel de administración en Angular; app móvil en React Native con Expo; landing en Astro).",
        "Integraciones: Mercado Pago Checkout Pro con webhooks, Meta WhatsApp Cloud API y comprobantes en PDF generados en el backend.",
        "CI/CD con GitHub Actions y Workload Identity Federation; despliega solo la aplicación que cambió.",
        "Cloud Run, Secret Manager, Artifact Registry, Supabase, Firebase Hosting y Cloudflare.",
        "Un Docker multi-stage redujo la imagen de 1.39 GB a 412 MB.",
        "Seguridad: gitleaks en CI, pnpm audit y RLS en la base de datos.",
        "Más de 30 ADRs y un runbook de despliegue y reversión.",
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
      {
        area: "Bases de datos",
        items: "PostgreSQL, MongoDB, TypeORM, Supabase",
      },
      {
        area: "Nube y DevOps",
        items:
          "Google Cloud: Cloud Run, Secret Manager, Artifact Registry, Firebase Hosting; Docker, GitHub Actions, Cloudflare, monorepos con Nx y pnpm",
      },
      { area: "Pruebas", items: "unitarias, de integración y E2E" },
    ],
    aiEngineering: [
      "Claude Code como agente de implementación, con revisión manual de cada cambio",
      "Servidores MCP en mis propias aplicaciones para funciones guiadas por LLM",
      "ADRs y Obsidian para las notas de arquitectura",
      "NotebookLM para investigar",
    ],
    education: [
      "Ingeniería en Computación — Instituto Politécnico Nacional (estudios sin concluir)",
      "Ingeniería de Software — UACM (estudios sin concluir)",
    ],
    inProgress: [
      "GCP Associate Cloud Engineer",
      "Scrum Master (Scrum.org)",
      "Claude Certified Architect – Foundations",
    ],
    languages: ["Español — nativo", "Inglés — B2"],
  },

  ui: {
    skipLink: "Saltar al contenido",
    homeLinkLabel: "Huitzitzili León, inicio",
    primaryNav: "Principal",
    nav: { home: "Inicio", works: "Trabajos", cv: "CV", blog: "Blog" },
    blogLanguageNote: "",
    menuLabel: "Menú de navegación",
    colorMode: {
      group: "Tema",
      change: "Cambiar tema",
      current: "Tema",
      light: "Claro",
      dark: "Oscuro",
      system: "Sistema",
    },
    languageSwitch: { label: "English", hrefLang: "en", lang: "en" },
    footer: { social: "Redes", rss: "RSS del blog" },
    home: {
      photoAlt: "Foto de Huitzitzili Domingo León Nieves",
      island: {
        alt: "Isla flotante de hexágonos con un pueblo medieval: castillo de piedra con tejados rojos, iglesia, casas, molino y bosque, sobre rocas que cuelgan entre nubes",
        label: "Isla 3D interactiva",
        loading: "Cargando isla 3D",
        instructions:
          "Al cargar, la isla da diez vueltas rápidas que frenan y luego sigue girando despacio; mientras la arrastras se detiene y al soltarla retoma el giro. Con el ratón, arrastra en horizontal para girarla y en vertical para inclinarla, hasta darle la vuelta, arrastra con el botón derecho para moverla y, tras hacer clic, usa la rueda para acercarte al punto bajo el puntero o alejarte. Con el teclado, flechas para girar y Mayúsculas más flechas para mover. En pantalla táctil, arrastra con dos dedos para girar y pellízcala para acercar. Doble clic o la tecla R restablecen la vista.",
      },
      about: "Acerca de mí",
      bio: "Trayectoria",
      latestPosts: "Últimos posts",
      noPosts: "Todavía no hay posts publicados.",
      allPosts: "Ver todos los posts",
      worksButton: "Mis trabajos y proyectos",
      onTheWeb: "Yo en la web",
    },
    works: {
      title: "Trabajos",
      description: "Mis trabajos y proyectos.",
      breadcrumb: "Migas de pan",
      website: "Website",
    },
    cv: {
      title: "CV",
      description:
        "CV de Huitzitzili León: Tech Lead y desarrollador full-stack senior.",
      download: "Descargar PDF",
      downloadDetail: "CV en español, archivo PDF",
      headings: {
        summary: "Resumen",
        experience: "Experiencia",
        project: "Proyecto destacado",
        stack: "Stack",
        aiEngineering: "Ingeniería asistida por IA",
        education: "Educación",
        inProgress: "En curso",
        languages: "Idiomas",
        contact: "Contacto",
      },
    },
    error: {
      title: "No pudimos cargar esta página",
      body: "Inténtalo de nuevo en unos segundos.",
      retry: "Reintentar",
    },
  },
};
