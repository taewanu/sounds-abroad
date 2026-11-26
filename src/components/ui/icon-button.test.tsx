import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { IconButton, IconLink, IconToggle } from './icon-button';

describe('IconButton', () => {
  test('is a native button that takes keyboard focus and fires its action', () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="Next track" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Next track' });

    button.focus();
    fireEvent.click(button);

    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(document.activeElement).toBe(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('when disabled, leaves the tab order and ignores presses', () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="Next track" disabled onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Next track' });

    button.focus();
    fireEvent.click(button);

    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.hasAttribute('data-disabled')).toBe(true);
    expect(document.activeElement).not.toBe(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('keeps the caller’s color classes alongside its own', () => {
    render(<IconButton aria-label="Next track" className="text-fg-2" size="md" />);

    const classes = screen.getByRole('button').classList;

    expect(classes).toContain('text-fg-2');
    expect(classes).toContain('focus-ring');
    expect(classes).toContain('h-9');
  });
});

describe('IconToggle', () => {
  function ControlledMute() {
    const [muted, setMuted] = useState(false);
    return <IconToggle aria-label="Mute" pressed={muted} onPressedChange={setMuted} />;
  }

  test('reports its pressed state and flips it on each press', () => {
    render(<ControlledMute />);
    const toggle = screen.getByRole('button', { name: 'Mute' });

    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.hasAttribute('data-pressed')).toBe(true);

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  test('takes keyboard focus, and when disabled neither focuses nor flips', () => {
    const onPressedChange = vi.fn();
    const { rerender } = render(
      <IconToggle aria-label="Mute" pressed={false} onPressedChange={onPressedChange} />,
    );
    const toggle = screen.getByRole('button', { name: 'Mute' });
    toggle.focus();

    expect(document.activeElement).toBe(toggle);

    toggle.blur();
    rerender(
      <IconToggle aria-label="Mute" pressed={false} disabled onPressedChange={onPressedChange} />,
    );
    toggle.focus();
    fireEvent.click(toggle);

    expect(document.activeElement).not.toBe(toggle);
    expect(onPressedChange).not.toHaveBeenCalled();
  });
});

describe('IconLink', () => {
  test('stays a link, so assistive tech announces where it goes', () => {
    render(<IconLink href="https://example.test/track" aria-label="Open in the music app" />);

    const link = screen.getByRole('link', { name: 'Open in the music app' });

    expect(link.getAttribute('href')).toBe('https://example.test/track');
    expect(screen.queryByRole('button')).toBeNull();
    expect(link.classList).toContain('focus-ring');
  });
});
