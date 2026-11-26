import { Tabs as BaseTabs } from '@base-ui/react/tabs';

type TabsProps<Value extends string> = Omit<
  BaseTabs.List.Props,
  'className' | 'activateOnFocus' | 'loopFocus'
> & {
  value: Value;
  onValueChange: (value: Value) => void;
  className?: string;
};

/**
 * A tab list with one tab stop: arrow keys, Home and End move focus and wrap,
 * and only a press selects a tab. Its panel can live anywhere, so each `Tab`
 * names it through `aria-controls`.
 */
export function Tabs<Value extends string>({ value, onValueChange, ...props }: TabsProps<Value>) {
  return (
    <BaseTabs.Root value={value} onValueChange={(next: Value) => onValueChange(next)}>
      <BaseTabs.List {...props} />
    </BaseTabs.Root>
  );
}

type TabProps<Value extends string> = Omit<BaseTabs.Tab.Props, 'className' | 'value'> & {
  value: Value;
  className?: string;
};

/** Callers style only shape, color and state; the focus ring, color transition and disabled look belong here. */
export function Tab<Value extends string>({ className = '', ...props }: TabProps<Value>) {
  return (
    <BaseTabs.Tab
      {...props}
      className={`focus-ring transition-colors data-[disabled]:opacity-30 ${className}`}
    />
  );
}
