import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '@/components/ui/StatCard';

const DummyIcon = () => <svg data-testid="stat-icon" />;

describe('StatCard', () => {
  it('renders the value', () => {
    render(<StatCard icon={<DummyIcon />} value="145 000 FCFA" label="Chiffre d'affaires" />);
    expect(screen.getByText("145 000 FCFA")).toBeInTheDocument();
  });

  it('renders the label', () => {
    render(<StatCard icon={<DummyIcon />} value="42" label="Ventes aujourd'hui" />);
    expect(screen.getByText("Ventes aujourd'hui")).toBeInTheDocument();
  });

  it('renders the icon', () => {
    render(<StatCard icon={<DummyIcon />} value="0" label="Test" />);
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  it('renders positive trend with correct text', () => {
    render(
      <StatCard
        icon={<DummyIcon />}
        value="50"
        label="Test"
        trend={{ value: '+12% vs hier', positive: true }}
      />
    );
    expect(screen.getByText('+12% vs hier')).toBeInTheDocument();
  });

  it('renders negative trend with correct text', () => {
    render(
      <StatCard
        icon={<DummyIcon />}
        value="30"
        label="Test"
        trend={{ value: '-8% vs hier', positive: false }}
      />
    );
    expect(screen.getByText('-8% vs hier')).toBeInTheDocument();
  });

  it('does not render trend section when trend prop is absent', () => {
    render(<StatCard icon={<DummyIcon />} value="0" label="Test" />);
    expect(screen.queryByText(/vs hier/)).toBeNull();
  });

  it('applies iconBg class to icon container', () => {
    const { container } = render(
      <StatCard icon={<DummyIcon />} value="0" label="Test" iconBg="bg-primary/20" />
    );
    const iconWrapper = container.querySelector('.bg-primary\\/20');
    expect(iconWrapper).not.toBeNull();
  });

  it('applies custom className', () => {
    const { container } = render(
      <StatCard icon={<DummyIcon />} value="0" label="Test" className="col-span-2" />
    );
    expect(container.firstChild).toHaveClass('col-span-2');
  });
});
