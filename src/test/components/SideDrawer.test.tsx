import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SideDrawer } from '@/components/ui/SideDrawer';

describe('SideDrawer', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <SideDrawer open={false} onClose={() => {}} title="Test">Contenu</SideDrawer>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders children when open is true', () => {
    render(<SideDrawer open={true} onClose={() => {}} title="Test">Contenu visible</SideDrawer>);
    expect(screen.getByText('Contenu visible')).toBeInTheDocument();
  });

  it('renders the title when provided', () => {
    render(<SideDrawer open={true} onClose={() => {}} title="Mon Tiroir">Contenu</SideDrawer>);
    expect(screen.getByText('Mon Tiroir')).toBeInTheDocument();
  });

  it('does not render a title element when title is omitted', () => {
    render(<SideDrawer open={true} onClose={() => {}}>Contenu</SideDrawer>);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<SideDrawer open={true} onClose={onClose} title="Test">Contenu</SideDrawer>);
    const closeBtn = screen.getByRole('button');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <SideDrawer open={true} onClose={onClose} title="Test">Contenu</SideDrawer>
    );
    // The backdrop is the first child of the fragment (fixed inset-0 div)
    const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/50');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders with animate-slide-in-right class on the panel', () => {
    const { container } = render(
      <SideDrawer open={true} onClose={() => {}} title="Test">Contenu</SideDrawer>
    );
    const panel = container.querySelector('.animate-slide-in-right');
    expect(panel).not.toBeNull();
  });

  it('applies custom className to the panel', () => {
    const { container } = render(
      <SideDrawer open={true} onClose={() => {}} className="w-96">Contenu</SideDrawer>
    );
    expect(container.querySelector('.w-96')).not.toBeNull();
  });
});
