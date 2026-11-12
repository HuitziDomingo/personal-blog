import type { ReactNode, SVGProps } from 'react';

/**
 * Íconos de trazo de los comentarios, como los de components/icons.tsx: SVG
 * inline, decorativos (aria-hidden), del color del texto y de 1em.
 */
function Svg({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
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
      {children}
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement>;

export const SendIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M22 2 11 13" />
    <path d="m22 2-7 20-4-9-9-4z" />
  </Svg>
);

export const ShieldIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
  </Svg>
);

export const ReplyIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m9 17-5-5 5-5" />
    <path d="M4 12h11a5 5 0 0 1 5 5v2" />
  </Svg>
);

export const ClockIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const XCircleIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15 9-6 6M9 9l6 6" />
  </Svg>
);

export const WarningIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);

export const BubbleIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </Svg>
);
