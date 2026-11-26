import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { createContext, useContext } from 'react';

type TabsProps<Value extends string> = Omit<
  BaseTabs.List.Props,
  'className' | 'activateOnFocus' | 'loopFocus'
> & {
  value: Value;
  onValueChange: (value: Value) => void;
  className?: string;
};

const SelectedValue = createContext<string | null>(null);

/**
 * A tab list with one tab stop: arrow keys, Home and End move focus and wrap,
 * and only a press selects a tab. Its panel can live anywhere, so each `Tab`
 * names it through `aria-controls`.
 */
export function Tabs<Value extends string>({ value, onValueChange, ...props }: TabsProps<Value>) {
  return (
    <BaseTabs.Root value={value} onValueChange={(next: Value) => onValueChange(next)}>
      <SelectedValue.Provider value={value}>
        <BaseTabs.List {...props} />
      </SelectedValue.Provider>
    </BaseTabs.Root>
  );
}

type TabProps<Value extends string> = Omit<
  BaseTabs.Tab.Props,
  'className' | 'value' | 'tabIndex'
> & {
  value: Value;
  className?: string;
};

/** Callers style only size, color and state; the shape, focus ring, transition and disabled look belong here. */
export function Tab<Value extends string>({ className = '', ...props }: TabProps<Value>) {
  // Base UI leaves the tab stop on the last-focused tab; tabbing back in must land on the selected one.
  const selected = useContext(SelectedValue) === props.value;
  return (
    <BaseTabs.Tab
      {...props}
      tabIndex={selected ? 0 : -1}
      className={`rounded-pill focus-ring transition-colors ease-spring data-[disabled]:opacity-30 motion-reduce:transition-none ${className}`}
    />
  );
}
