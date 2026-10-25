// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import GenerationProgress from '@/components/GenerationProgress';
import { START_PROGRESS, type ProgressState } from '@/lib/generation-progress';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const at = (step: ProgressState['step'], extra: Partial<ProgressState> = {}): ProgressState => ({
  ...START_PROGRESS,
  step,
  ...extra,
});
// Each step's words only (the last part of the item), not its ✓ or ○ icon.
const label = (li: Element | null) => li?.lastElementChild?.textContent ?? null;
const current = () => label(document.querySelector('[aria-current="step"]'));
const steps = () => Array.from(screen.getByRole('list', { name: 'Progress' }).querySelectorAll('li'), label);

describe('GenerationProgress', () => {
  it('lists every step, with the first one under way at the start', () => {
    render(<GenerationProgress progress={START_PROGRESS} source="file" photo={false} />);
    expect(steps()).toEqual(['Uploading your file', 'Reading your file', 'Writing your study guide with AI']);
    expect(current()).toBe('Uploading your file');
  });

  it('marks finished steps done and moves on as the server reports each one', () => {
    const { rerender } = render(<GenerationProgress progress={at('reading')} source="file" photo={false} />);
    expect(current()).toBe('Reading your file');
    expect(steps()[0]).toBe('Uploading your file (done)');
    expect(steps()[2]).toBe('Writing your study guide with AI');

    rerender(<GenerationProgress progress={at('writing')} source="file" photo={false} />);
    expect(current()).toBe('Writing your study guide with AI');
    expect(steps().slice(0, 2)).toEqual(['Uploading your file (done)', 'Reading your file (done)']);
  });

  it('words the steps for notes, links and photos', () => {
    const { rerender } = render(<GenerationProgress progress={START_PROGRESS} source="text" photo={false} />);
    expect(steps().slice(0, 2)).toEqual(['Sending your notes', 'Checking your notes']);
    rerender(<GenerationProgress progress={START_PROGRESS} source="link" photo={false} />);
    expect(steps().slice(0, 2)).toEqual(['Sending your link', 'Fetching the web page']);
    rerender(<GenerationProgress progress={START_PROGRESS} source="file" photo />);
    expect(steps().slice(0, 2)).toEqual(['Uploading your photo', 'Preparing your photo']);
  });

  it('says so when the AI is trying again or a backup has taken over', () => {
    const { rerender } = render(<GenerationProgress progress={at('writing')} source="file" photo={false} />);
    expect(screen.queryByText(/trying again/)).toBeNull();

    rerender(<GenerationProgress progress={at('writing', { attempt: 2 })} source="file" photo={false} />);
    expect(screen.getByText("That try didn't work out, so we're trying again (try 2).")).toBeTruthy();

    rerender(<GenerationProgress progress={at('writing', { attempt: 3, backup: true })} source="file" photo={false} />);
    expect(screen.getByText(/a slower backup is helping \(try 3\)/)).toBeTruthy();
  });

  it('counts the seconds so the wait visibly moves', () => {
    vi.useFakeTimers();
    render(<GenerationProgress progress={at('writing')} source="file" photo={false} />);
    expect(screen.getByText('Working for 0s')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByText('Working for 7s')).toBeTruthy();
  });

  it('keeps the ticking clock out of the screen reader announcements', () => {
    render(<GenerationProgress progress={at('reading')} source="file" photo={false} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Reading your file');
    expect(status.textContent).not.toContain('Working for');
  });

  it('stops counting when it goes away', () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<GenerationProgress progress={START_PROGRESS} source="file" photo={false} />);
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
