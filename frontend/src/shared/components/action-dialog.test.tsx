import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog, PromptDialog, minChars } from './action-dialog';

function PromptHarness({ onSubmit }: { onSubmit: (values: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Abrir
      </Button>
      <PromptDialog
        open={open}
        onOpenChange={setOpen}
        title="Registrar motivo"
        submitLabel="Registrar"
        fields={[
          {
            name: 'reason',
            label: 'Motivo',
            type: 'textarea',
            validate: minChars(3),
          },
        ]}
        onSubmit={onSubmit}
      />
    </>
  );
}

describe('action dialogs', () => {
  it('valida y devuelve los valores del formulario', () => {
    const onSubmit = vi.fn();
    render(<PromptHarness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(within(dialog).getByText(/al menos 3 caracteres/)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Motivo'), {
      target: { value: 'Cliente solicitó la baja' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(onSubmit).toHaveBeenCalledWith({ reason: 'Cliente solicitó la baja' });
  });

  it('confirma una acción destructiva', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Desactivar producto"
        description="No se ofrecerá para nuevas suscripciones."
        confirmLabel="Desactivar"
        destructive
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
