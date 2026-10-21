// Kaido (I5): the brand mark of Kaido Publish — the same drawing as the
// favicon of publish.kaidostudios.de (kaido-publish/site/src/components/Logo.astro):
// a module with an inscribed K. Ink module, lime drawing; the module stays
// visible on light surfaces, the lime K on dark ones.
export const KaidoMark = ({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    <rect width="32" height="32" fill="#131313" />
    <rect x="8.5" y="8" width="2.75" height="16" fill="#D4FF00" />
    <path
      d="M22 8 L14.2 15.1 L22 24"
      stroke="#D4FF00"
      strokeWidth="2.75"
      strokeLinecap="square"
      fill="none"
    />
    <circle cx="14.2" cy="16" r="1.9" fill="#131313" />
  </svg>
);
