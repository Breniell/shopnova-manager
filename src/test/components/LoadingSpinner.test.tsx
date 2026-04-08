import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders an svg element (lucide icon)', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('applies animate-spin class', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('applies text-primary class by default', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('svg')).toHaveClass('text-primary');
  });

  it('accepts a custom className', () => {
    const { container } = render(<LoadingSpinner className="text-white" />);
    expect(container.querySelector('svg')).toHaveClass('text-white');
  });

  it('renders with default size of 24', () => {
    const { container } = render(<LoadingSpinner />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
  });

  it('renders with custom size', () => {
    const { container } = render(<LoadingSpinner size={48} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('48');
    expect(svg.getAttribute('height')).toBe('48');
  });
});
