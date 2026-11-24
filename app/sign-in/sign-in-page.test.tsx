// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));

const auth = vi.hoisted(() => ({
  user: null as unknown,
  loading: false,
  signInWithGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: auth.user, loading: auth.loading }),
  signInWithGoogle: auth.signInWithGoogle,
  signInWithPassword: auth.signInWithPassword,
  signUpWithPassword: auth.signUpWithPassword,
}));

import SignInPage from './page';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  auth.user = null;
  auth.loading = false;
});

afterEach(() => {
  cleanup();
});

describe('Sign In Page', () => {
  it('renders the welcome back card with badge, title, subtitle and left arrow', () => {
    render(<SignInPage />);
    expect(screen.getByRole('link', { name: 'Return to hero page' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Return to hero page' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(screen.getByText('Sign in to sync your study decks across devices.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sign in with Gmail/i })).toBeTruthy();
    expect(screen.getByLabelText(/EMAIL ADDRESS/i)).toBeTruthy();
    expect(screen.getByLabelText(/PASSWORD/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign up free' }).getAttribute('href')).toBe('/sign-up');
    expect(screen.getByRole('link', { name: 'Continue as guest instead' })).toBeTruthy();
  });

  it('allows switching role tabs without redirecting', () => {
    render(<SignInPage />);
    const studentTab = screen.getByRole('tab', { name: 'Student' });
    const teacherTab = screen.getByRole('tab', { name: 'Teacher' });
    const adminTab = screen.getByRole('tab', { name: 'Admin' });

    expect(studentTab.getAttribute('aria-selected')).toBe('true');
    expect(teacherTab.getAttribute('aria-selected')).toBe('false');

    // Clicking Teacher
    fireEvent.click(teacherTab);
    expect(teacherTab.getAttribute('aria-selected')).toBe('true');
    expect(studentTab.getAttribute('aria-selected')).toBe('false');
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();

    // Clicking Admin
    fireEvent.click(adminTab);
    expect(adminTab.getAttribute('aria-selected')).toBe('true');
    expect(teacherTab.getAttribute('aria-selected')).toBe('false');
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('calls signInWithGoogle on clicking Gmail sign-in', async () => {
    render(<SignInPage />);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with Gmail/i }));
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it('submits email and password to sign in and redirects to desk (/)', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: null });
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText(/EMAIL ADDRESS/i), {
      target: { value: 'student@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/PASSWORD/i), {
      target: { value: 'secretpass' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(auth.signInWithPassword).toHaveBeenCalledWith('student@example.com', 'secretpass');
      expect(nav.push).toHaveBeenCalledWith('/');
    });
  });

  it('displays error message when sign in fails', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText(/EMAIL ADDRESS/i), {
      target: { value: 'student@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/PASSWORD/i), {
      target: { value: 'wrongpass' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Invalid login credentials')).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();
  });
});
