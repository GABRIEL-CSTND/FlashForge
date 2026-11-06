// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({ pathname: '/my-sets' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

import PageTurn from './PageTurn';

// The view transition itself needs the App Router's canary React and a browser
// (checked in Edge); the react package here has no <ViewTransition>, so this
// covers the sheet and the Back / Forward rise.
const page = (text: string) => (
  <PageTurn className="desk-sheet sheet">
    <main>{text}</main>
  </PageTurn>
);

const animate = vi.fn();

beforeEach(() => {
  nav.pathname = '/my-sets';
  animate.mockClear();
  Element.prototype.animate = animate as unknown as Element['animate'];
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as Partial<Element>).animate;
  delete (window as Partial<Window>).matchMedia;
});

// Back or Forward: the browser fires popstate, then the router renders the page.
function goBackTo(path: string, rerender: (ui: React.ReactElement) => void, event = new PopStateEvent('popstate')) {
  window.dispatchEvent(event);
  nav.pathname = path;
  rerender(page(path));
}

describe('PageTurn', () => {
  it('lays the page on its sheet', () => {
    render(page('My Sets'));
    expect(screen.getByRole('main').parentElement?.className).toBe('desk-sheet sheet');
  });

  it('eases the page in after Back or Forward', () => {
    const { rerender } = render(page('My Sets'));
    goBackTo('/history', rerender);
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0];
    expect(keyframes[0]).toEqual({ opacity: 0, transform: 'translateY(16px)' });
    expect(options.duration).toBe(420);
    expect(screen.getByRole('main').parentElement).toBe(animate.mock.contexts[0]);
  });

  it('only fades it in when motion is reduced', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as Window['matchMedia'];
    const { rerender } = render(page('My Sets'));
    goBackTo('/history', rerender);
    expect(animate.mock.calls[0][0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animate.mock.calls[0][1].duration).toBe(200);
  });

  it("leaves a link's turn to the view transition", () => {
    const { rerender } = render(page('My Sets'));
    nav.pathname = '/history';
    rerender(page('History'));
    expect(animate).not.toHaveBeenCalled();
  });

  it('lets the browser have a swipe back it already animated', () => {
    const { rerender } = render(page('My Sets'));
    const swipe = new PopStateEvent('popstate');
    Object.defineProperty(swipe, 'hasUAVisualTransition', { value: true });
    goBackTo('/history', rerender, swipe);
    expect(animate).not.toHaveBeenCalled();
  });

  it("doesn't rise on the next click when Back only changed the search params", async () => {
    const { rerender } = render(page('My Sets'));
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    nav.pathname = '/history';
    rerender(page('History'));
    expect(animate).not.toHaveBeenCalled();
  });
});
