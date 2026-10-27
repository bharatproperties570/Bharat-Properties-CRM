import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, IconButton } from '../Button';

describe('Button Primitive', () => {
  it('renders with children, default type button, and handles click', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Save Deal</Button>);

    const button = screen.getByRole('button', { name: /save deal/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('enforces disabled state and suppresses click events', () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Disabled Action</Button>);

    const button = screen.getByRole('button', { name: /disabled action/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('enforces loading state with spinner and suppresses click events', () => {
    const handleClick = vi.fn();
    render(<Button loading onClick={handleClick}>Submitting</Button>);

    const button = screen.getByRole('button', { name: /submitting/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders custom variants and sizes correctly', () => {
    const { rerender } = render(<Button variant="danger" size="sm">Delete</Button>);
    let button = screen.getByRole('button', { name: /delete/i });
    expect(button.style.background).toBe('rgb(239, 68, 68)');

    rerender(<Button variant="ghost" size="lg">Cancel</Button>);
    button = screen.getByRole('button', { name: /cancel/i });
    expect(button.style.background).toBe('transparent');
  });

  it('supports string icon class and React element icon without crashing', () => {
    const { rerender } = render(<Button icon="fas fa-plus">Add Lead</Button>);
    expect(screen.getByRole('button', { name: /add lead/i }).querySelector('i.fa-plus')).toBeInTheDocument();

    const CustomIcon = <span data-testid="custom-react-icon">Icon</span>;
    rerender(<Button icon={CustomIcon}>Add Contact</Button>);
    expect(screen.getByTestId('custom-react-icon')).toBeInTheDocument();
  });
});

describe('IconButton Primitive', () => {
  it('guarantees an accessible name when icon-only', () => {
    render(<IconButton icon="fas fa-times" aria-label="Close dialog" />);

    const button = screen.getByRole('button', { name: /close dialog/i });
    expect(button).toBeInTheDocument();
  });

  it('derives accessible name from title or icon class if aria-label is omitted', () => {
    const { rerender } = render(<IconButton icon="fas fa-filter" title="Filter Records" />);
    expect(screen.getByRole('button', { name: /filter records/i })).toBeInTheDocument();

    rerender(<IconButton icon="fas fa-trash-alt" />);
    expect(screen.getByRole('button', { name: /trash alt/i })).toBeInTheDocument();
  });
});
