import { Button } from '@base-ui/react/button';
import { Toggle } from '@base-ui/react/toggle';
import type { ComponentProps } from 'react';

const SIZE_CLASS = { sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-10 w-10' } as const;

type IconSize = keyof typeof SIZE_CLASS;

/** Callers style only color and state; the shape, focus ring and press belong here. */
type IconProps<P> = Omit<P, 'className'> & { size?: IconSize; className?: string };

function iconClass(size: IconSize, className = '') {
  return `${SIZE_CLASS[size]} flex shrink-0 items-center justify-center rounded-full focus-ring transition-[color,background-color,scale,opacity] ease-spring active:scale-[0.97] data-[disabled]:pointer-events-none data-[disabled]:opacity-30 ${className}`;
}

export function IconButton({
  size = 'lg',
  className,
  ...props
}: IconProps<ComponentProps<typeof Button>>) {
  return <Button {...props} className={iconClass(size, className)} />;
}

/** A two-state icon control; Base UI sets `aria-pressed` and `data-pressed`. */
export function IconToggle({
  size = 'lg',
  className,
  ...props
}: IconProps<ComponentProps<typeof Toggle>>) {
  return <Toggle {...props} className={iconClass(size, className)} />;
}

/** A link that looks like an icon button, kept an `<a>` so it keeps link semantics. */
export function IconLink({
  size = 'lg',
  className,
  children,
  ...props
}: IconProps<ComponentProps<'a'>>) {
  return (
    <a {...props} className={iconClass(size, className)}>
      {children}
    </a>
  );
}
