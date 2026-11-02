import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

describe('Button', () => {
  it('expone nombre accesible y estado deshabilitado', () => {
    render(<Button disabled>Guardar</Button>);
    const btn = screen.getByRole('button', { name: 'Guardar' });
    expect(btn).toBeDisabled();
  });
});

describe('Alert', () => {
  it('anuncia errores con role alert', () => {
    render(
      <Alert variant="destructive">
        <AlertDescription>Fallo de validación</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Fallo de validación');
  });
});
