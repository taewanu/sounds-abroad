import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { ToggleGroup, ToggleGroupItem } from './toggle-group';

const OPTIONS = ['first', 'second', 'third'] as const;
type Option = (typeof OPTIONS)[number];

function Choices({ onValueChange }: { onValueChange?: (value: Option) => void }) {
  const [value, setValue] = useState<Option>('second');
  return (
    <ToggleGroup
      aria-label="Choices"
      value={value}
      onValueChange={(next) => {
        onValueChange?.(next);
        setValue(next);
      }}
    >
      {OPTIONS.map((option) => (
        <ToggleGroupItem key={option} value={option} className="text-fg-2">
          {option}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function item(option: Option) {
  return screen.getByRole('button', { name: option });
}

function pressed() {
  return OPTIONS.filter((option) => item(option).getAttribute('aria-pressed') === 'true');
}

function tabStops() {
  return OPTIONS.filter((option) => item(option).tabIndex === 0);
}

async function pressKey(target: HTMLElement, key: string) {
  fireEvent.keyDown(target, { key });
  // Base UI moves focus in a microtask after the keydown.
  await act(async () => {});
}

describe('ToggleGroup', () => {
  test('is a labelled group with exactly one item pressed', () => {
    render(<Choices />);

    expect(screen.getByRole('group', { name: 'Choices' })).not.toBeNull();
    expect(pressed()).toEqual(['second']);
  });

  test('presses the item chosen and reports it', () => {
    const onValueChange = vi.fn();
    render(<Choices onValueChange={onValueChange} />);

    fireEvent.click(item('third'));

    expect(onValueChange).toHaveBeenCalledWith('third');
    expect(pressed()).toEqual(['third']);
  });

  test('pressing the pressed item keeps it pressed and reports nothing', () => {
    const onValueChange = vi.fn();
    render(<Choices onValueChange={onValueChange} />);

    fireEvent.click(item('second'));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(pressed()).toEqual(['second']);
  });

  test('is one tab stop, and arrow keys move focus and the tab stop without pressing', async () => {
    render(<Choices />);

    expect(tabStops()).toHaveLength(1);

    item('first').focus();
    await pressKey(item('first'), 'ArrowRight');

    expect(document.activeElement).toBe(item('second'));
    expect(tabStops()).toEqual(['second']);

    await pressKey(item('second'), 'ArrowLeft');
    await pressKey(item('first'), 'ArrowLeft');

    expect(document.activeElement).toBe(item('third'));
    expect(tabStops()).toEqual(['third']);
    expect(pressed()).toEqual(['second']);
  });

  test('keeps the caller’s classes alongside its own', () => {
    render(<Choices />);

    const classes = item('first').classList;

    expect(classes).toContain('text-fg-2');
    expect(classes).toContain('focus-ring');
    expect(classes).toContain('transition-colors');
  });
});
