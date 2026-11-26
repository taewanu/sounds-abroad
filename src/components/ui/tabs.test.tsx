import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { Tab, Tabs } from './tabs';

const OPTIONS = ['first', 'second', 'third'] as const;
type Option = (typeof OPTIONS)[number];

function Choices({
  disabled,
  onValueChange,
}: {
  disabled?: Option;
  onValueChange?: (value: Option) => void;
}) {
  const [value, setValue] = useState<Option>('second');
  return (
    <Tabs
      aria-label="Choices"
      value={value}
      onValueChange={(next) => {
        onValueChange?.(next);
        setValue(next);
      }}
    >
      {OPTIONS.map((option) => (
        <Tab key={option} value={option} disabled={option === disabled} className="text-fg-2">
          {option}
        </Tab>
      ))}
    </Tabs>
  );
}

function tab(option: Option) {
  return screen.getByRole('tab', { name: option });
}

function selected() {
  return OPTIONS.filter((option) => tab(option).getAttribute('aria-selected') === 'true');
}

function tabStops() {
  return OPTIONS.filter((option) => tab(option).tabIndex === 0);
}

async function pressKey(key: string) {
  fireEvent.keyDown(document.activeElement as HTMLElement, { key });
  // Base UI moves focus in a microtask after the keydown.
  await act(async () => {});
}

describe('Tabs', () => {
  test('is a labelled tab list with one tab stop, on the selected tab', () => {
    render(<Choices />);

    expect(screen.getByRole('tablist', { name: 'Choices' })).not.toBeNull();
    expect(selected()).toEqual(['second']);
    expect(tabStops()).toEqual(['second']);
  });

  test('selects the tab pressed and reports it', () => {
    const onValueChange = vi.fn();
    render(<Choices onValueChange={onValueChange} />);

    fireEvent.click(tab('third'));

    expect(onValueChange).toHaveBeenCalledWith('third');
    expect(selected()).toEqual(['third']);
  });

  test('arrow keys, Home and End move focus and wrap without selecting', async () => {
    const onValueChange = vi.fn();
    render(<Choices onValueChange={onValueChange} />);
    tab('second').focus();

    await pressKey('ArrowRight');
    await pressKey('ArrowRight');
    expect(document.activeElement).toBe(tab('first'));

    await pressKey('End');
    expect(document.activeElement).toBe(tab('third'));

    await pressKey('Home');
    expect(document.activeElement).toBe(tab('first'));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(selected()).toEqual(['second']);
  });

  test('a disabled tab takes focus from the arrow keys but cannot be selected', async () => {
    const onValueChange = vi.fn();
    render(<Choices disabled="third" onValueChange={onValueChange} />);
    tab('second').focus();

    await pressKey('ArrowRight');
    fireEvent.click(tab('third'));

    expect(document.activeElement).toBe(tab('third'));
    expect(tab('third').getAttribute('aria-disabled')).toBe('true');
    expect(tab('third').hasAttribute('data-disabled')).toBe(true);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(selected()).toEqual(['second']);
  });

  test('keeps the tab stop on the selected tab while focus roams', async () => {
    render(<Choices />);
    tab('second').focus();

    await pressKey('ArrowRight');

    expect(document.activeElement).toBe(tab('third'));
    expect(tabStops()).toEqual(['second']);
  });

  test('keeps the caller’s classes alongside its own', () => {
    render(<Choices />);

    const classes = tab('first').classList;

    expect(classes).toContain('text-fg-2');
    expect(classes).toContain('focus-ring');
    expect(classes).toContain('transition-colors');
  });
});
