import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReceiptModal } from '@/components/ui/ReceiptModal';
import type { Sale } from '@/stores/useSaleStore';

const mockSale: Sale = {
  id: 's-test',
  saleNumber: 'LGW-2025-00042',
  date: new Date('2025-04-05T10:30:00'),
  items: [
    { productId: 'p1', nom: 'Bière Castel 33cl', prixVente: 600, quantity: 3 },
    { productId: 'p2', nom: 'Eau Supermont 1.5L', prixVente: 300, quantity: 2 },
  ],
  subtotal: 2400,
  discount: 0,
  total: 2400,
  paymentMode: 'especes',
  amountReceived: 3000,
  changeGiven: 600,
  userId: '2',
  userName: 'Paul Mbarga',
  status: 'completed',
};

describe('ReceiptModal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <ReceiptModal sale={mockSale} open={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when sale is null', () => {
    const { container } = render(
      <ReceiptModal sale={null} open={true} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays the sale number', () => {
    render(<ReceiptModal sale={mockSale} open={true} onClose={() => {}} />);
    expect(screen.getByText(/LGW-2025-00042/)).toBeInTheDocument();
  });

  it('displays all cart item names', () => {
    render(<ReceiptModal sale={mockSale} open={true} onClose={() => {}} />);
    expect(screen.getByText('Bière Castel 33cl')).toBeInTheDocument();
    expect(screen.getByText('Eau Supermont 1.5L')).toBeInTheDocument();
  });

  it('displays the cashier name', () => {
    render(<ReceiptModal sale={mockSale} open={true} onClose={() => {}} />);
    expect(screen.getByText(/Paul Mbarga/)).toBeInTheDocument();
  });

  it('displays TOTAL label', () => {
    render(<ReceiptModal sale={mockSale} open={true} onClose={() => {}} />);
    expect(screen.getByText('TOTAL')).toBeInTheDocument();
  });

  it('displays Espèces as payment label', () => {
    render(<ReceiptModal sale={mockSale} open={true} onClose={() => {}} />);
    expect(screen.getByText('Espèces')).toBeInTheDocument();
  });

  it('displays Mobile Money label for mobile_money payment', () => {
    const mobileSale = { ...mockSale, paymentMode: 'mobile_money' as const, amountReceived: undefined, changeGiven: undefined };
    render(<ReceiptModal sale={mobileSale} open={true} onClose={() => {}} />);
    expect(screen.getByText('Mobile Money')).toBeInTheDocument();
  });

  it('shows discount row when discount > 0', () => {
    const discountedSale = { ...mockSale, discount: 5, total: 2280 };
    render(<ReceiptModal sale={discountedSale} open={true} onClose={() => {}} />);
    expect(screen.getByText(/Remise/)).toBeInTheDocument();
  });

  it('does not show discount row when discount is 0', () => {
    render(<ReceiptModal sale={mockSale} open={true} onClose={() => {}} />);
    expect(screen.queryByText(/Remise/)).toBeNull();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ReceiptModal sale={mockSale} open={true} onClose={onClose} />
    );
    const backdrop = container.querySelector('.fixed.inset-0');
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the Fermer button is clicked', () => {
    const onClose = vi.fn();
    render(<ReceiptModal sale={mockSale} open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Fermer'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls window.print when Imprimer button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ReceiptModal sale={mockSale} open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Imprimer'));
    expect(printSpy).toHaveBeenCalledOnce();
    printSpy.mockRestore();
  });
});
