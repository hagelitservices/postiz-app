'use client';

import { KaidoMark } from '@gitroom/frontend/components/kaido/kaido.mark';

// Kaido (I5): Kaido Publish mark instead of the Postiz logo; same 60 px box,
// so the sidebar keeps its layout.
export const Logo = () => {
  return (
    <span
      role="img"
      aria-label="Kaido Publish"
      className="mt-[8px] min-w-[60px] min-h-[60px] flex items-center justify-center"
    >
      <KaidoMark size={44} />
    </span>
  );
};
