import type { SiteContent } from './types';

/**
 * Textos en español. Perfil, «Acerca de mí», trayectoria y trabajos salen del
 * documento «Textos del portafolio (ES / EN)», aprobado por León (ADR-024,
 * punto 8). Los textos de la interfaz son los que ya tenía el sitio.
 */
export const es: SiteContent = {
  locale: 'es',
  htmlLang: 'es',
  ogLocale: 'es_MX',
  intlLocale: 'es-MX',

  profile: {
    greeting:
      'Hola, soy León, desarrollador full-stack senior en la Ciudad de México (maestro a veces, discípulo siempre).',
    tagline: 'Disponible para trabajo remoto como Senior Full-Stack Developer o Tech Lead.',
    authorBadge: 'Full-Stack',
    authorRole: 'Senior Full-Stack Developer',
  },
  siteDescription:
    'Portafolio de León Nieves y blog técnico sobre desarrollo de software y orquestación de agentes de IA.',
  about: [
    'Soy desarrollador full-stack con más de 5 años de experiencia en producción con TypeScript: Angular y React en el frontend, Node.js y NestJS en el backend, y MongoDB y PostgreSQL para los datos. Hoy también construyo en Go.',
    'En Tata Consultancy Services desarrollé un dashboard bancario en Angular para Citi Banamex y capacité a más de 50 desarrolladores con cursos internos. Antes cofundé {debred}, un equipo freelance donde llevé proyectos web de principio a fin.',
    'Mi proyecto actual es este sitio: una API en Go con arquitectura hexagonal, un admin en Angular y una web en Next.js, con un asistente de escritura con IA y cada decisión importante documentada en ADRs. Lo que más me interesa es el liderazgo técnico: arquitectura, seguridad y equipos que entregan con calidad.',
  ],
  bio: [
    {
      period: '2026 – hoy',
      title: 'Proyecto propio, huitzi.xyz.',
      description:
        'API en Go, admin en Angular, web en Next.js, MongoDB y un asistente de escritura con IA (Gemini) con costo de $0 por diseño.',
    },
    {
      period: '2023 – feb 2026',
      title: 'Frontend Developer y Tech Lead en Tata Consultancy Services.',
      description:
        'Dashboard bancario en Angular para Citi Banamex, con CI/CD, TypeScript y patrones de arquitectura. Apoyo al equipo en frontend y backend, y capacitación interna a más de 50 desarrolladores.',
    },
    {
      period: '2021 – 2022',
      title: 'Frontend Developer en Black Trust.',
      description: 'Aplicación web con React, Firebase, Material UI y Sass, y microservicios con Express.js.',
    },
    {
      period: '2020',
      title: 'Frontend Developer en Deq.',
      description: 'Sitios web a partir de diseños en Adobe XD, con Bootstrap y jQuery.',
    },
    {
      period: '2018',
      title: 'Frontend Developer en Prossa.',
      description: 'Mejoras a aplicaciones web con HTML, CSS, JavaScript y jQuery, por proyecto.',
    },
    { period: '2014 – hoy', title: 'Cofundador y desarrollador frontend freelance en {debred}.' },
  ],
  works: {
    'huitzi-xyz': {
      summary:
        'Este sitio, construido como un producto real: API en Go con arquitectura hexagonal, admin en Angular, web en Next.js, servidor MCP de solo lectura y un asistente de escritura con IA con límites de costo, seguridad y revisión humana. Cada decisión está documentada en ADRs públicos.',
      sections: [
        [
          'Este sitio, construido como un producto real: API en Go con arquitectura hexagonal, admin en Angular, web en Next.js, servidor MCP de solo lectura y un asistente de escritura con IA con límites de costo, seguridad y revisión humana. Cada decisión está documentada en ADRs públicos.',
        ],
      ],
      imageAlts: [],
    },
    debred: {
      summary:
        'Proyectos web freelance con un pequeño equipo de amigos de la universidad. Colaboro como desarrollador frontend.',
      sections: [
        ['Proyectos web freelance con un pequeño equipo de amigos de la universidad. Colaboro como desarrollador frontend.'],
        ['Colaboradores freelancers.'],
      ],
      imageAlts: [
        'Página de inicio de Debred: «Desarrollemos tu proyecto web».',
        'El equipo de Debred posando en una sala.',
      ],
    },
    youtube: {
      summary:
        'Una introducción a la programación con React Native, desde la instalación de las herramientas en Windows 10.',
      sections: [
        ['Una introducción a la programación con React Native, desde la instalación de las herramientas en Windows 10.'],
      ],
      imageAlts: [
        'Canal de YouTube MexicanDevelopers con el video «Instalando React Native, Chocolatey, Yarn y Expo».',
      ],
    },
    dalyza: {
      summary:
        'Sitio web con landing page para vender lavado de alfombras, persianas, pisos y otros servicios del hogar. Colaboración freelance como desarrollador frontend.',
      sections: [
        [
          'Sitio web con landing page para vender lavado de alfombras, persianas, pisos y otros servicios del hogar. Colaboración freelance como desarrollador frontend.',
        ],
      ],
      imageAlts: ['Página de inicio de Dalyza: «Dale vida a tu hogar», persianas, alfombras y laminados.'],
    },
    aum: {
      summary:
        'Sitio informativo de una asociación espiritual y filosófica basada en el vegetarianismo y la cultura. Colaboración freelance como desarrollador frontend.',
      sections: [
        [
          'Sitio informativo de una asociación espiritual y filosófica basada en el vegetarianismo y la cultura. Colaboración freelance como desarrollador frontend.',
        ],
      ],
      imageAlts: ['Página de inicio de A.U.M., Acción por la Unidad Mundial.'],
    },
  },

  ui: {
    skipLink: 'Saltar al contenido',
    homeLinkLabel: 'Huitzitzili León, inicio',
    primaryNav: 'Principal',
    nav: { home: 'Inicio', works: 'Trabajos', blog: 'Blog' },
    blogLanguageNote: '',
    menuLabel: 'Menú de navegación',
    colorMode: { group: 'Tema', change: 'Cambiar tema', current: 'Tema', light: 'Claro', dark: 'Oscuro', system: 'Sistema' },
    languageSwitch: { label: 'English', hrefLang: 'en', lang: 'en' },
    footer: { social: 'Redes', rss: 'RSS del blog' },
    home: {
      photoAlt: 'Foto de Huitzitzili Domingo León Nieves',
      about: 'Acerca de mí',
      bio: 'Biografía',
      latestPosts: 'Últimos posts',
      noPosts: 'Todavía no hay posts publicados.',
      allPosts: 'Ver todos los posts',
      worksButton: 'Mis trabajos y proyectos',
      onTheWeb: 'Yo en la web',
    },
    works: { title: 'Trabajos', description: 'Mis trabajos y proyectos.', breadcrumb: 'Migas de pan', website: 'Website' },
    error: {
      title: 'No pudimos cargar esta página',
      body: 'Inténtalo de nuevo en unos segundos.',
      retry: 'Reintentar',
    },
  },
};
