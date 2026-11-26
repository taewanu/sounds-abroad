import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { RowButton } from './row-button';

describe('RowButton', () => {
  test('is a native button that takes keyboard focus and shows the focus ring', () => {
    render(<RowButton aria-label="Play preview">Track</RowButton>);
    const button = screen.getByRole('button', { name: 'Play preview' });

    button.focus();

    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(document.activeElement).toBe(button);
    expect(button.classList).toContain('focus-ring');
  });

  test('fires its action on press and sinks while pressed unless told not to', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <RowButton aria-label="Play preview" onClick={onClick}>
        Track
      </RowButton>,
    );
    const button = screen.getByRole('button', { name: 'Play preview' });

    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.classList).toContain('active:scale-[0.97]');

    rerender(
      <RowButton aria-label="Play preview" press="none" onClick={onClick}>
        Track
      </RowButton>,
    );

    expect(button.className).not.toContain('active:scale');
  });

  test('when disabled, leaves the tab order, ignores presses and leaves dimming to its row', () => {
    const onClick = vi.fn();
    render(
      <RowButton aria-label="Play preview" disabled onClick={onClick}>
        Track
      </RowButton>,
    );
    const button = screen.getByRole('button', { name: 'Play preview' });

    button.focus();
    fireEvent.click(button);

    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.hasAttribute('data-disabled')).toBe(true);
    expect(document.activeElement).not.toBe(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.className).not.toContain('opacity');
  });

  test('keeps the caller’s layout classes alongside its own', () => {
    render(<RowButton className="flex min-w-0 flex-1">Track</RowButton>);

    const classes = screen.getByRole('button').classList;

    expect(classes).toContain('flex-1');
    expect(classes).toContain('text-left');
  });
});
