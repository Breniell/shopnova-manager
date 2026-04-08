import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/ui/StatusBadge';

describe('StatusBadge', () => {
  it('renders "EN STOCK" for healthy status', () => {
    render(<StatusBadge status="healthy" />);
    expect(screen.getByText('EN STOCK')).toBeInTheDocument();
  });

  it('renders "STOCK FAIBLE" for low status', () => {
    render(<StatusBadge status="low" />);
    expect(screen.getByText('STOCK FAIBLE')).toBeInTheDocument();
  });

  it('renders "RUPTURE" for stockout status', () => {
    render(<StatusBadge status="stockout" />);
    expect(screen.getByText('RUPTURE')).toBeInTheDocument();
  });

  it('applies healthy badge class for healthy status', () => {
    render(<StatusBadge status="healthy" />);
    expect(screen.getByText('EN STOCK')).toHaveClass('badge-healthy');
  });

  it('applies low-stock badge class for low status', () => {
    render(<StatusBadge status="low" />);
    expect(screen.getByText('STOCK FAIBLE')).toHaveClass('badge-low-stock');
  });

  it('applies stockout badge class for stockout status', () => {
    render(<StatusBadge status="stockout" />);
    expect(screen.getByText('RUPTURE')).toHaveClass('badge-stockout');
  });

  it('merges extra className props', () => {
    render(<StatusBadge status="healthy" className="my-custom-class" />);
    expect(screen.getByText('EN STOCK')).toHaveClass('my-custom-class');
  });

  it('renders as a span element', () => {
    render(<StatusBadge status="low" />);
    expect(screen.getByText('STOCK FAIBLE').tagName).toBe('SPAN');
  });
});
