// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import GuidePage from '@/app/guide/page';

afterEach(cleanup);

describe('user guide page (#25)', () => {
  it('renders the title and back link to upload page', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: 'How to Use FlashForge', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Back to FlashForge' }).getAttribute('href')).toBe('/');
  });

  it('provides quick jump navigation links for all key sections', () => {
    render(<GuidePage />);
    const nav = screen.getByRole('navigation', { name: 'Table of contents' });
    expect(nav.textContent).toContain('Quick Start');
    expect(nav.textContent).toContain('Supported Files & Notes');
    expect(nav.textContent).toContain('Study Guide Formats');
    expect(nav.textContent).toContain('Practice Modes');
    expect(nav.textContent).toContain('Saving & History');
    expect(nav.textContent).toContain('Teachers & Classes');
    expect(nav.textContent).toContain('FAQ');
  });

  it('explains the 4 quick start steps', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: '1. Quick Start in 4 Steps' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Provide your notes' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pick your format' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Set questions & difficulty' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Study and save' })).toBeTruthy();
  });

  it('covers all supported input types including PDFs, Office files, and Wikipedia topics', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: /PDF Files/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Word & PowerPoint/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Pasted Notes/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Web Page Links/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Topics \(Wikipedia\)/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Photos of Paper Notes/ })).toBeTruthy();
  });

  it('describes all study formats and study modes', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: /Identification Flashcards/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Multiple Choice/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /True or False/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Mixed Quiz/ })).toBeTruthy();

    expect(screen.getByRole('heading', { name: /Flip Cards/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Type the Answer/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Matching Mode/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Read Aloud/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Source Quotes/ })).toBeTruthy();
  });

  it('includes guides for teachers and classes', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { name: 'For Teachers' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'For Students' })).toBeTruthy();
    expect(screen.getByText(/Most-missed questions/)).toBeTruthy();
  });

  it('has a bottom call-to-action button to generate a study guide', () => {
    render(<GuidePage />);
    const cta = screen.getByRole('link', { name: 'Generate a study guide →' });
    expect(cta.getAttribute('href')).toBe('/');
  });
});
