import { Button } from '@base-ui/react/button';
import type { ComponentProps } from 'react';

type PillButtonProps = Omit<ComponentProps<typeof Button>, 'className'> & { className?: string };

/** Callers set size and color; the shape, focus ring and color transition belong here. */
export function PillButton({ className = '', ...props }: PillButtonProps) {
  return (
    <Button
      {...props}
      className={`rounded-pill focus-ring transition-colors data-[disabled]:opacity-30 ${className}`}
    />
  );
}
