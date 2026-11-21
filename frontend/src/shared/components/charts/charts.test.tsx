import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart } from './bar-chart';
import { DonutChart } from './donut-chart';
import { Sparkline } from './sparkline';

describe('charts', () => {
  it('expone las barras con su resumen accesible', () => {
    render(
      <BarChart
        label="Distribución"
        data={[
          { label: '≤7 días', value: 3 },
          { label: '8–15 días', value: 4 },
          { label: '16–30 días', value: 5 },
        ]}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Distribución: ≤7 días: 3, 8–15 días: 4, 16–30 días: 5' }),
    ).toBeInTheDocument();
  });

  it('expone la dona con total y segmentos', () => {
    render(
      <DonutChart
        label="Cartera"
        centerValue={17}
        centerLabel="total"
        segments={[
          { label: 'Activa', value: 8, color: 'green' },
          { label: 'Vencida', value: 2, color: 'red' },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Cartera: Activa: 8, Vencida: 2' })).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
  });

  it('renderiza la línea con una etiqueta comprensible', () => {
    render(<Sparkline values={[0, 1, 0, 2, 1]} label="Vencimientos por día" />);
    expect(screen.getByRole('img', { name: 'Vencimientos por día' })).toBeInTheDocument();
  });
});
