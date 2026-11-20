import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CopyButton } from './copy-button';

describe('CopyButton', () => {
  it('copia el identificador y muestra confirmación', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<CopyButton value="8b1d2c3e-4f5a-6b7c-8d9e-0f1a2b3c4d5e" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }));

    expect(writeText).toHaveBeenCalledWith('8b1d2c3e-4f5a-6b7c-8d9e-0f1a2b3c4d5e');
    expect(screen.getByRole('button', { name: 'Copiar' })).toHaveTextContent('Copiado');
  });
});
