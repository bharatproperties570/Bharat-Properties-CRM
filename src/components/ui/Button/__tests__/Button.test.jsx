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

  // --- Phase 10.2.1 Hardening Tests ---

  it('protects calculated aria-disabled and aria-busy against caller prop overrides', () => {
    render(
      <Button
        loading={true}
        disabled={true}
        aria-busy="false"
        aria-disabled="false"
        data-testid="protected-btn"
        id="custom-action-id"
      >
        Processing
      </Button>
    );

    const button = screen.getByTestId('protected-btn');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeDisabled();
    // Unrelated caller props preserved
    expect(button).toHaveAttribute('id', 'custom-action-id');
  });

  it('preserves caller aria-disabled when not disabled or loading', () => {
    render(
      <Button
        disabled={false}
        loading={false}
        aria-disabled="true"
        data-testid="passive-btn"
      >
        Passive Action
      </Button>
    );

    const button = screen.getByTestId('passive-btn');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
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

  // --- Phase 10.2.1 Hardening Tests ---

  it('supports explicitly labelled React element icons', () => {
    const ReactTrashIcon = <span data-testid="react-trash">TrashIcon</span>;
    render(<IconButton icon={ReactTrashIcon} aria-label="Delete Record" />);

    const button = screen.getByRole('button', { name: /delete record/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByTestId('react-trash')).toBeInTheDocument();
  });

  it('emits a development warning and provides fallback name when React icon lacks accessible name', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ReactSearchIcon = <span data-testid="react-search">SearchIcon</span>;

    render(<IconButton icon={ReactSearchIcon} />);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('IconButton rendered with a React element icon but missing an "aria-label" or "title"')
    );

    const button = screen.getByRole('button', { name: /icon button/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByTestId('react-search')).toBeInTheDocument();

    warnSpy.mockRestore();
  });
});
