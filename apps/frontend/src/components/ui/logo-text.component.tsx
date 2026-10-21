import React from 'react';
import { KaidoMark } from '@gitroom/frontend/components/kaido/kaido.mark';

// Kaido (I5): mark + name instead of the Postiz wordmark.
export const LogoTextComponent = () => {
  return (
    <span className="flex items-center gap-[12px]" translate="no">
      <KaidoMark size={32} />
      <span className="text-[22px] font-[600] leading-none tracking-[-0.01em]">
        Kaido Publish
      </span>
    </span>
  );
};
