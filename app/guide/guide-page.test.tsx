// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import GuidePage from '@/app/guide/page';
import { normalizeJoinCode } from '@/lib/classes-shared';

afterEach(cleanup);

describe('user guide page (#25)', () => {
  it('renders the title and back link to upload page', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: 'How to Use FlashForge', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Back to Desk' }).getAttribute('href')).toBe('/');
  });

  it('provides quick jump navigation links for all key sections', () => {
    render(<GuidePage />);
    const nav = screen.getByRole('navigation', { name: 'Table of contents' });
    expect(nav.textContent).toContain('Quick Start');
    expect(nav.textContent).toContain('Supported Materials');
    expect(nav.textContent).toContain('Study Formats');
    expect(nav.textContent).toContain('Practice Modes');
    expect(nav.textContent).toContain('The Library & History');
    expect(nav.textContent).toContain('Teachers & Classes');
    expect(nav.textContent).toContain('FAQ');
  });

  it('explains the 4 quick start steps on the desk', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: '1. Quick Start in 4 Steps' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Put notes on the sheet' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Customize with the Make Card' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Watch your deck being made' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Review the spread and study' })).toBeTruthy();
  });

  it('covers all supported study materials including PDFs, Office files, and Wikipedia topics', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: /PDF Documents/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Word & PowerPoint/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Pasted Notes/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Web Page Links/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Topics \(Wikipedia\)/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Photos of Paper Notes/ })).toBeTruthy();
  });

  it('describes all study formats and desk practice modes', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: /Identification Flashcards/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Multiple Choice/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /True or False/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Mixed Quiz/ })).toBeTruthy();

    expect(screen.getByRole('heading', { name: /Flip Cards/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Type the Answer/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Matching Mode/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Read Aloud/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Pencil \(Edit Cards\)/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Missed-it Practice/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Source Quotes/ })).toBeTruthy();
  });

  it('explains the library, card box tabs, and history', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: /5\. The Library: Card Box, My Sets & History/ })).toBeTruthy();
    expect(screen.getByText(/Card Box Tabs:/)).toBeTruthy();
    expect(screen.getByText(/My Sets:/)).toBeTruthy();
    expect(screen.getByText(/History:/)).toBeTruthy();
    expect(screen.getByText(/Library Card:/)).toBeTruthy();
  });

  it('includes guides for teachers and classes', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: 'For Teachers' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'For Students' })).toBeTruthy();
    expect(screen.getByText(/Most-missed questions/)).toBeTruthy();
    expect(screen.getByText(/Grade Book/)).toBeTruthy();
  });

  // These were wrong in earlier versions of the guide (PR #83 and #93 reviews).
  it('gives a join code example the join form accepts', () => {
    render(<GuidePage />);
    const example = document.body.textContent!.match(/join code \(e\.g\. “([^”]+)”\)/)![1];
    expect(normalizeJoinCode(example)).not.toBeNull();
  });

  it('says when the daily limit resets and what Auto read-aloud does, without promising what the app lacks', () => {
    render(<GuidePage />);
    const text = document.body.textContent!;
    expect(text).toContain('resets at midnight Pacific time (3 PM in the Philippines)');
    expect(text).toContain('Turn on Auto to have each card read aloud as it comes up');
    expect(text).not.toMatch(/spaced repetition|every 24 hours|hands-free|cookie banners/i);
  });

  it('has a bottom call-to-action button to make a study deck', () => {
    render(<GuidePage />);
    const cta = screen.getByRole('link', { name: 'Make a study deck →' });
    expect(cta.getAttribute('href')).toBe('/');
  });
});
