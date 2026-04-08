import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NovaCard } from '@/components/ui/NovaCard';

describe('NovaCard', () => {
  it('renders children', () => {
    render(<NovaCard>Contenu de la carte</NovaCard>);
    expect(screen.getByText('Contenu de la carte')).toBeInTheDocument();
  });

  it('renders the title when provided', () => {
    render(<NovaCard title="Mon Titre">Contenu</NovaCard>);
    expect(screen.getByText('Mon Titre')).toBeInTheDocument();
  });

  it('renders the subtitle when provided', () => {
    render(<NovaCard title="Titre" subtitle="Sous-titre">Contenu</NovaCard>);
    expect(screen.getByText('Sous-titre')).toBeInTheDocument();
  });

  it('does not render title element when title is absent', () => {
    render(<NovaCard>Contenu</NovaCard>);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('applies nova-card class when accent is false (default)', () => {
    const { container } = render(<NovaCard>Test</NovaCard>);
    expect(container.firstChild).toHaveClass('nova-card');
  });

  it('applies nova-card-accent class when accent is true', () => {
    const { container } = render(<NovaCard accent>Test</NovaCard>);
    expect(container.firstChild).toHaveClass('nova-card-accent');
  });

  it('merges custom className', () => {
    const { container } = render(<NovaCard className="custom-width">Test</NovaCard>);
    expect(container.firstChild).toHaveClass('custom-width');
  });
});
