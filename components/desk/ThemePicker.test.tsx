// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import StudyViewer from '@/components/StudyViewer';
import ThemePicker from '@/components/desk/ThemePicker';
import {
  COLOR_THEMES,
  contrastRatio,
  meetsWcagAA,
  resetThemeMemoryForTests,
  THEME_STORAGE_KEY,
  validatePaletteContrast,
} from '@/lib/theme';

const SAMPLE_CARDS = [
  { id: 'c1', question: 'Fluid inside the chloroplast', answer: 'Stroma' },
  { id: 'c2', question: 'Enzyme that fixes CO2', answer: 'RuBisCO' },
  { id: 'c3', question: 'Pigment that absorbs light', answer: 'Chlorophyll' },
];

const QUIZ_CARDS = [
  {
    id: 'q1',
    question: 'Which layer handles routing?',
    answer: 'Network',
    options: ['Physical', 'Data Link', 'Network', 'Transport'],
  },
  {
    id: 'q2',
    question: 'Which protocol is connection-oriented?',
    answer: 'TCP',
    options: ['UDP', 'TCP', 'ICMP', 'ARP'],
  },
];

beforeEach(() => {
  localStorage.clear();
  resetThemeMemoryForTests();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetThemeMemoryForTests();
  vi.restoreAllMocks();
});

async function runAxeAudit(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      // jsdom does not compute layout/canvas pixel colors for CSS background images
      'color-contrast': { enabled: false },
    },
  });
  return results.violations;
}

describe('Google Chrome-style color theme picker & WCAG 2.2 AA contrast (#90)', () => {
  it('enforces WCAG 2.2 AA (>= 4.5:1) contrast ratios across the default theme and all 8 study desk themes', () => {
    expect(COLOR_THEMES.map((t) => t.id)).toEqual([
      'forest',
      'burgundy',
      'navy',
      'espresso',
      'slate',
      'amethyst',
      'umber',
      'obsidian',
      'linen',
    ]);

    for (const palette of COLOR_THEMES) {
      const check = validatePaletteContrast(palette);
      expect(check.valid, `${palette.label} failed WCAG AA: ${JSON.stringify(check.ratios)}`).toBe(true);
      expect(meetsWcagAA(palette.textPrimary, palette.cardSurface)).toBe(true);
      expect(meetsWcagAA(palette.textPrimary, palette.sheetSurface)).toBe(true);
      expect(meetsWcagAA(palette.textMuted, palette.cardSurface)).toBe(true);
      expect(meetsWcagAA(palette.accentInk, palette.cardSurface)).toBe(true);
      expect(meetsWcagAA(palette.onDeskText, palette.bgSurface)).toBe(true);
      expect(meetsWcagAA(palette.buttonText, palette.accentColor)).toBe(true);
      expect(contrastRatio(palette.textPrimary, palette.cardSurface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('renders circular color swatches, updates CSS custom properties, announces theme changes, and persists in localStorage', () => {
    const first = render(<ThemePicker />);
    const trigger = screen.getByRole('button', { name: 'Customize theme color (Forest green)' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const group = screen.getByRole('group', { name: 'Choose a color theme' });
    const swatches = within(group).getAllByRole('button');
    expect(swatches).toHaveLength(9);

    const forestBtn = screen.getByRole('button', { name: 'Forest green theme' });
    expect(forestBtn.getAttribute('aria-pressed')).toBe('true');

    // Select Oxford Burgundy & Mahogany swatch
    const burgundyBtn = screen.getByRole('button', { name: 'Oxford Burgundy & Mahogany theme' });
    fireEvent.click(burgundyBtn);

    expect(burgundyBtn.getAttribute('aria-pressed')).toBe('true');
    expect(forestBtn.getAttribute('aria-pressed')).toBe('false');
    expect(document.documentElement.dataset.theme).toBe('burgundy');
    expect(document.documentElement.style.getPropertyValue('--bg-surface')).toBe('#42181a');
    expect(document.documentElement.style.getPropertyValue('--box-surface')).toBe('#82532d');
    expect(document.documentElement.style.getPropertyValue('--card-surface')).toBe('#f5ecdc');
    expect(document.documentElement.style.getPropertyValue('--sticky-bg')).toBe('#e3c37b');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('burgundy');

    // Screen reader live region announces the new theme
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('Theme color set to Oxford Burgundy & Mahogany');

    // Keyboard arrow navigation cycles to Midnight Navy & Teak
    fireEvent.keyDown(burgundyBtn, { key: 'ArrowRight' });
    expect(document.documentElement.dataset.theme).toBe('navy');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('navy');

    // Persists across unmount and remount
    first.unmount();
    render(<ThemePicker defaultOpen />);
    expect(screen.getByRole('button', { name: 'Midnight Navy & Teak theme' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('navy');
  });

  it('closes the swatch popover on Escape and outside pointerdown', () => {
    render(<ThemePicker />);
    const trigger = screen.getByRole('button', { name: /Customize theme color/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('region', { name: 'Theme color swatches' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Theme color swatches' })).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole('region', { name: 'Theme color swatches' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('region', { name: 'Theme color swatches' })).toBeNull();
  });
});

describe('screen reader announcements & axe-core WCAG accessibility audits (#90)', () => {
  it('announces flashcard flips, progress updates, and mode state changes to screen readers', () => {
    render(<StudyViewer title="Photosynthesis" studyType="flashcard" cards={SAMPLE_CARDS} />);

    // Semantic main landmark
    expect(screen.getByRole('main')).toBeTruthy();

    // Initial live announcement for card clue
    const live = screen.getByTestId('flashcard-live-announcement');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('Showing clue: Fluid inside the chloroplast');

    // Flip button has descriptive aria-label and aria-pressed state
    const flipBtn = screen.getByRole('button', { name: 'Flip the card' });
    expect(flipBtn.getAttribute('aria-pressed')).toBe('false');

    // Flip via click or keyboard Space
    fireEvent.keyDown(flipBtn, { key: ' ' });
    const flippedBtn = screen.getByRole('button', { name: 'Flip back' });
    expect(flippedBtn.getAttribute('aria-pressed')).toBe('true');
    expect(live.textContent).toBe('Card flipped to term: Stroma');

    // Sorting to Got it updates progress and live clue announcement
    fireEvent.keyDown(flippedBtn, { key: 'ArrowRight' });
    expect(screen.getByText('Card 2 of 3')).toBeTruthy();
    expect(live.textContent).toBe('Showing clue: Enzyme that fixes CO2');
  });

  it('announces quiz validation results to screen readers when an answer is picked', () => {
    render(<StudyViewer title="Networking" studyType="multiple_choice" cards={QUIZ_CARDS} />);

    const live = screen.getByTestId('quiz-live-announcement');
    expect(live.textContent).toBe('');

    // Pick wrong option first
    fireEvent.click(screen.getByRole('button', { name: /Physical/ }));
    expect(live.textContent).toBe('Answer validated: Incorrect. The correct answer is Network');

    // Advance to question 2 and pick the right option
    fireEvent.click(screen.getByRole('button', { name: 'Next question →' }));
    fireEvent.click(screen.getByRole('button', { name: /TCP/ }));
    expect(live.textContent).toBe('Answer validated: Correct. TCP');
  });

  it('passes automated axe-core WCAG accessibility audits across Flashcard, Type, Match, Quiz, and ThemePicker views', async () => {
    const { container, unmount } = render(
      <div>
        <ThemePicker defaultOpen />
        <StudyViewer title="Photosynthesis" studyType="flashcard" cards={SAMPLE_CARDS} />
      </div>
    );

    // 1. Flashcard Flip mode + open ThemePicker
    expect(await runAxeAudit(container)).toEqual([]);

    // 2. Flashcard Type mode
    fireEvent.click(screen.getByRole('button', { name: 'Type' }));
    expect(await runAxeAudit(container)).toEqual([]);

    // 3. Flashcard Match mode
    fireEvent.click(screen.getByRole('button', { name: 'Match' }));
    expect(await runAxeAudit(container)).toEqual([]);

    unmount();

    // 4. Multiple-choice Quiz mode
    const quizView = render(<StudyViewer title="Networking" studyType="multiple_choice" cards={QUIZ_CARDS} />);
    expect(await runAxeAudit(quizView.container)).toEqual([]);
  });
});
