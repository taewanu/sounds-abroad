import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible';

/** Callers lay the trigger out; its focus ring belongs here. */
function Trigger({
  className = '',
  ...props
}: Omit<BaseCollapsible.Trigger.Props, 'className'> & { className?: string }) {
  return <BaseCollapsible.Trigger {...props} className={`focus-ring ${className}`} />;
}

export const Collapsible = { ...BaseCollapsible, Trigger };
