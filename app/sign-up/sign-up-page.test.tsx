// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SignUpPage from './page';

afterEach(() => {
  cleanup();
});

describe('Sign Up Page', () => {
  it('renders the sign up card with all fields and navigation links', () => {
    render(<SignUpPage />);
    expect(screen.getByRole('link', { name: 'Return to hero page' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy();
    expect(screen.getByText('Sign up to sync your study decks across devices.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sign up with Gmail/i })).toBeTruthy();
    expect(screen.getByLabelText(/FULL NAME/i)).toBeTruthy();
    expect(screen.getByLabelText(/EMAIL ADDRESS/i)).toBeTruthy();
    expect(screen.getByLabelText(/^PASSWORD$/i)).toBeTruthy();
    expect(screen.getByLabelText(/CONFIRM PASSWORD/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in');
    expect(screen.getByRole('link', { name: 'Continue as guest instead' }).getAttribute('href')).toBe('/');
  });

  it('allows switching role tabs without any side effects', () => {
    render(<SignUpPage />);
    const studentTab = screen.getByRole('tab', { name: 'Student' });
    const teacherTab = screen.getByRole('tab', { name: 'Teacher' });
    const adminTab = screen.getByRole('tab', { name: 'Admin' });

    expect(studentTab.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(teacherTab);
    expect(teacherTab.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(adminTab);
    expect(adminTab.getAttribute('aria-selected')).toBe('true');
  });
});
