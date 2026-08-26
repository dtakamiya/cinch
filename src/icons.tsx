/** 一覧・詳細で使う stroke ベースのアイコン群（20px グリッド）。 */

type IconProps = { size?: number };

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function IconLogo({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function IconClock({ size = 13 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconArrowRight({ size = 13 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function IconActivity({ size = 13 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </svg>
  );
}

export function IconChevronRight({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconChevronLeft({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function IconMinus({ size = 26 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 12h8" />
    </svg>
  );
}

export function IconRefresh({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function IconCheck({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.5}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconX({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.5}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
