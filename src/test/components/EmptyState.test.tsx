import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="Aucun produit" />);
    expect(screen.getByText('Aucun produit')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="Titre" description="Ajoutez des produits pour commencer." />);
    expect(screen.getByText('Ajoutez des produits pour commencer.')).toBeInTheDocument();
  });

  it('does not render description element when absent', () => {
    render(<EmptyState title="Titre" />);
    expect(screen.queryByRole('paragraph')).toBeNull();
  });

  it('renders the icon when provided', () => {
    render(<EmptyState title="Titre" icon={<span data-testid="icon">📦</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders an action element when provided', () => {
    render(
      <EmptyState
        title="Titre"
        action={<button>Ajouter</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<EmptyState title="Titre" className="flex-1" />);
    expect(container.firstChild).toHaveClass('flex-1');
  });

  it('always has the base centering classes', () => {
    const { container } = render(<EmptyState title="Titre" />);
    expect(container.firstChild).toHaveClass('flex');
    expect(container.firstChild).toHaveClass('text-center');
  });
});
