'use client';

import { Popover as BasePopover } from '@base-ui/react/popover';

import { ESCAPE_LAYER, isEscapeLayerAbove } from '@/components/use-escape-layer';

/**
 * Base UI handles Escape before the `useEscapeLayer` window listener and stops
 * it there, so an Escape meant for a higher layer is passed on untouched.
 */
function Root({ onOpenChange, ...props }: BasePopover.Root.Props) {
  return (
    <BasePopover.Root
      {...props}
      onOpenChange={(open, details) => {
        if (details.reason === 'escape-key' && isEscapeLayerAbove(ESCAPE_LAYER.popover)) {
          details.cancel();
          details.allowPropagation();
          return;
        }
        onOpenChange?.(open, details);
      }}
    />
  );
}

export const Popover = { ...BasePopover, Root };
