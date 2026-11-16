// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PaperCard from './PaperCard';

afterEach(cleanup);

describe('paper card', () => {
  it('shows one face at a time: the other is hidden and out of reach', () => {
    const { rerender } = render(<PaperCard flipped={false} front={<button>Front</button>} back={<button>Back</button>} />);
    expect(screen.getByRole('button', { name: 'Front' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByText('Back').closest('[inert]')).not.toBeNull();

    rerender(<PaperCard flipped front={<button>Front</button>} back={<button>Back</button>} />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Front' })).toBeNull();
    expect(screen.getByText('Front').closest('[inert]')).not.toBeNull();
  });
});
