import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group';
import type { RefAttributes } from 'react';

type ToggleGroupProps<Value extends string> = Omit<
  BaseToggleGroup.Props<Value>,
  'value' | 'defaultValue' | 'onValueChange' | 'multiple'
> &
  RefAttributes<HTMLDivElement> & {
    value: Value;
    onValueChange: (value: Value) => void;
  };

/**
 * Mutually exclusive toggles with exactly one pressed: one tab stop, arrow keys
 * moving between them. Pressing the pressed toggle makes Base UI report an
 * empty value, which is dropped here so the controlled value keeps it pressed.
 */
export function ToggleGroup<Value extends string>({
  value,
  onValueChange,
  ...props
}: ToggleGroupProps<Value>) {
  return (
    <BaseToggleGroup<Value>
      {...props}
      value={[value]}
      onValueChange={([pressed]) => {
        if (pressed !== undefined) onValueChange(pressed);
      }}
    />
  );
}

type ToggleGroupItemProps<Value extends string> = Omit<
  Toggle.Props<Value>,
  'className' | 'value' | 'pressed' | 'defaultPressed'
> & {
  value: Value;
  className?: string;
};

/** Callers style only color and state; the focus ring and color transition belong here. */
export function ToggleGroupItem<Value extends string>({
  className = '',
  ...props
}: ToggleGroupItemProps<Value>) {
  return (
    <Toggle<Value>
      {...props}
      className={`focus-ring transition-colors ease-spring motion-reduce:transition-none ${className}`}
    />
  );
}
