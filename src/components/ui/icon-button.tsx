import { Button } from '@base-ui/react/button';
import { Toggle } from '@base-ui/react/toggle';
import type { ComponentProps } from 'react';

const SIZE_CLASS = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-10 w-10',
  xl: 'h-[42px] w-[42px]',
  '2xl': 'h-11 w-11',
} as const;

/** `lift` grows on hover and sinks on press, for a control floating over the globe. */
const PRESS_CLASS = {
  tap: 'ease-spring active:scale-[0.97]',
  lift: 'hover:scale-[1.03] active:scale-95',
  none: '',
} as const;

type IconSize = keyof typeof SIZE_CLASS;
type IconPress = keyof typeof PRESS_CLASS;

/** Callers style only color and state; the shape, focus ring and press belong here. */
type IconProps<P> = Omit<P, 'className'> & {
  size?: IconSize;
  press?: IconPress;
  className?: string;
};

function iconClass(size: IconSize, press: IconPress, className = '') {
  return `${SIZE_CLASS[size]} flex shrink-0 items-center justify-center rounded-full focus-ring transition-[color,background-color,scale,opacity] ${PRESS_CLASS[press]} data-[disabled]:pointer-events-none data-[disabled]:opacity-30 ${className}`;
}

export function IconButton({
  size = 'lg',
  press = 'tap',
  className,
  ...props
}: IconProps<ComponentProps<typeof Button>>) {
  return <Button {...props} className={iconClass(size, press, className)} />;
}

/** A two-state icon control; Base UI sets `aria-pressed` and `data-pressed`. */
export function IconToggle({
  size = 'lg',
  press = 'tap',
  className,
  ...props
}: IconProps<ComponentProps<typeof Toggle>>) {
  return <Toggle {...props} className={iconClass(size, press, className)} />;
}

/** A link that looks like an icon button, kept an `<a>` so it keeps link semantics. */
export function IconLink({
  size = 'lg',
  press = 'tap',
  className,
  children,
  ...props
}: IconProps<ComponentProps<'a'>>) {
  return (
    <a {...props} className={iconClass(size, press, className)}>
      {children}
    </a>
  );
}
