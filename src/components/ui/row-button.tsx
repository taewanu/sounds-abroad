import { Button } from '@base-ui/react/button';
import type { ComponentProps } from 'react';

const PRESS_CLASS = {
  tap: 'transition-transform ease-spring active:scale-[0.97]',
  none: '',
} as const;

type RowButtonProps = Omit<ComponentProps<typeof Button>, 'className'> & {
  press?: keyof typeof PRESS_CLASS;
  className?: string;
};

/** A full-width press target: callers set its layout, and the row around it owns any disabled dimming. */
export function RowButton({ press = 'tap', className = '', ...props }: RowButtonProps) {
  return (
    <Button
      {...props}
      className={`text-left focus-ring data-[disabled]:pointer-events-none ${PRESS_CLASS[press]} ${className}`}
    />
  );
}
