import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FabSoftLogo } from './fabsoft-logo';

describe('FabSoftLogo', () => {
  it('expone anillo de foco en el enlace (no solo outline-none)', () => {
    render(<FabSoftLogo href="/dashboard" />);
    const link = screen.getByRole('link', { name: 'FabSoft' });
    expect(link.className).toMatch(/focus-visible:ring-2/);
    expect(link.className).toMatch(/focus-visible:ring-focus/);
  });
});
