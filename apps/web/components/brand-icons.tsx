import type { JSX, SVGProps } from 'react';

/**
 * Íconos de marca de las redes, en SVG inline (sin paquete, ADR-013).
 *
 * GitHub y YouTube: trazos de Simple Icons 16.36.0
 * (https://simpleicons.org, archivos icons/github.svg e icons/youtube.svg),
 * con licencia CC0 1.0
 * (https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md). Las
 * marcas son de sus dueños; se usan para identificar el link, según sus guías.
 *
 * LinkedIn no está en Simple Icons; en su lugar va un ícono genérico propio
 * (un maletín), sin marca.
 *
 * Son decorativos: aria-hidden, y el nombre de la red queda en el texto del
 * link. Monocromos con currentColor: heredan el color del link.
 */
type IconProps = SVGProps<SVGSVGElement>;

function BrandSvg({ path, ...props }: IconProps & { path: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={path} />
    </svg>
  );
}

const GITHUB = 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';
const YOUTUBE = 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z';

export const GitHubIcon = (props: IconProps) => <BrandSvg {...props} path={GITHUB} />;
export const YouTubeIcon = (props: IconProps) => <BrandSvg {...props} path={YOUTUBE} />;

/** Genérico, propio: un maletín de trazo, como los íconos de icons.tsx. */
export const BriefcaseIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20" />
  </svg>
);

const BY_NETWORK: Record<string, (props: IconProps) => JSX.Element> = {
  GitHub: GitHubIcon,
  YouTube: YouTubeIcon,
  LinkedIn: BriefcaseIcon,
};

/** Ícono de una red de lib/site.ts; null si no tiene. */
export function SocialIcon({ network, ...props }: IconProps & { network: string }) {
  const Icon = BY_NETWORK[network];

  return Icon ? <Icon {...props} /> : null;
}
