import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge, ToneBadge, UrgencyBadge } from './status-badge';

describe('StatusBadge', () => {
  it('muestra el label en español y conserva el punto de color', () => {
    const { container } = render(<StatusBadge kind="subscription" value="en_renovacion" />);
    expect(screen.getByText('En renovación')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('traduce prioridad y estado de tarea', () => {
    render(
      <>
        <StatusBadge kind="taskPriority" value="urgent" />
        <StatusBadge kind="taskStatus" value="en_progreso" />
      </>,
    );
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('En progreso')).toBeInTheDocument();
  });

  it('usa tono danger para vencimientos de 7 días o menos', () => {
    const { container } = render(<UrgencyBadge days={3} />);
    expect(screen.getByText('Faltan 3 días')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-status-expired-bg');
  });

  it('permite un badge de tono libre', () => {
    render(<ToneBadge tone="violet">Nueva</ToneBadge>);
    expect(screen.getByText('Nueva')).toBeInTheDocument();
  });
});
