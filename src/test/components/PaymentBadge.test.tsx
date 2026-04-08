import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaymentBadge } from '@/components/ui/PaymentBadge';

describe('PaymentBadge', () => {
  it('renders CASH for especes mode', () => {
    render(<PaymentBadge mode="especes" />);
    expect(screen.getByText('CASH')).toBeInTheDocument();
  });

  it('applies badge-cash class for especes', () => {
    render(<PaymentBadge mode="especes" />);
    expect(screen.getByText('CASH')).toHaveClass('badge-cash');
  });

  it('renders MOMO when mobile_money has no operator', () => {
    render(<PaymentBadge mode="mobile_money" />);
    expect(screen.getByText('MOMO')).toBeInTheDocument();
  });

  it('renders MTN when operator is mtn', () => {
    render(<PaymentBadge mode="mobile_money" operator="mtn" />);
    expect(screen.getByText('MTN')).toBeInTheDocument();
  });

  it('renders ORANGE when operator is orange', () => {
    render(<PaymentBadge mode="mobile_money" operator="orange" />);
    expect(screen.getByText('ORANGE')).toBeInTheDocument();
  });

  it('applies badge-momo class for mobile_money', () => {
    render(<PaymentBadge mode="mobile_money" />);
    expect(screen.getByText('MOMO')).toHaveClass('badge-momo');
  });

  it('merges extra className', () => {
    render(<PaymentBadge mode="especes" className="extra-class" />);
    expect(screen.getByText('CASH')).toHaveClass('extra-class');
  });

  it('renders as a span element', () => {
    render(<PaymentBadge mode="especes" />);
    expect(screen.getByText('CASH').tagName).toBe('SPAN');
  });
});
