import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('foundation dashboard', () => {
  it('shows the Phase 1 status screen', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Environmental Monitor' })).not.toBeNull();
    expect(screen.getByText('The application foundation is ready.')).not.toBeNull();
    expect(screen.getByText('Secure Supabase database setup')).not.toBeNull();
  });
});
