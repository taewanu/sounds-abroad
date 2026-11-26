import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { PillButton } from './pill-button';

describe('PillButton', () => {
  test('is a native button that takes keyboard focus and fires its action', () => {
    const onClick = vi.fn();
    render(<PillButton onClick={onClick}>Top songs</PillButton>);
    const button = screen.getByRole('button', { name: 'Top songs' });

    button.focus();
    fireEvent.click(button);

    expect(button.getAttribute('type')).toBe('button');
    expect(document.activeElement).toBe(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('passes a widget role and its state through', () => {
    render(
      <PillButton role="tab" aria-selected tabIndex={-1}>
        Top songs
      </PillButton>,
    );

    const tab = screen.getByRole('tab', { name: 'Top songs' });

    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.getAttribute('tabindex')).toBe('-1');
  });

  test('when disabled, leaves the tab order and ignores presses', () => {
    const onClick = vi.fn();
    render(
      <PillButton disabled onClick={onClick}>
        Top songs
      </PillButton>,
    );
    const button = screen.getByRole('button', { name: 'Top songs' });

    button.focus();
    fireEvent.click(button);

    expect(button.hasAttribute('data-disabled')).toBe(true);
    expect(document.activeElement).not.toBe(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
