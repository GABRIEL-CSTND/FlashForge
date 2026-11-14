// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import NotFound from '@/app/not-found';
import ErrorPage from '@/app/error';

describe('error and not-found pages (#91)', () => {
  it('renders a friendly not-found page with links back to the desk and library', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Page not found', level: 1 })).toBeTruthy();
    expect(screen.getByText(/This desk has no page by that name/)).toBeTruthy();

    const homeLink = screen.getByRole('link', { name: 'Make a study deck' });
    expect(homeLink.getAttribute('href')).toBe('/');

    const libraryLink = screen.getByRole('link', { name: 'Back to library' });
    expect(libraryLink.getAttribute('href')).toBe('/my-sets');
    cleanup();
  });

  it('renders a friendly error page and calls retry when Try again is clicked', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const retry = vi.fn();
    const error = new Error('Database connection failed');

    render(<ErrorPage error={error} retry={retry} />);

    // The visible title is the page's heading, not a hidden one.
    expect(screen.getByRole('heading', { name: 'Something went wrong', level: 1 })).toBeTruthy();
    expect(screen.getByText(/An unexpected error occurred while loading this page/)).toBeTruthy();
    expect(errorLog).toHaveBeenCalledWith('[FlashForge error]', error);

    const deskLink = screen.getByRole('link', { name: 'Back to desk' });
    expect(deskLink.getAttribute('href')).toBe('/');

    const tryAgainBtn = screen.getByRole('button', { name: 'Try again' });
    fireEvent.click(tryAgainBtn);
    expect(retry).toHaveBeenCalledTimes(1);

    errorLog.mockRestore();
    cleanup();
  });
});
