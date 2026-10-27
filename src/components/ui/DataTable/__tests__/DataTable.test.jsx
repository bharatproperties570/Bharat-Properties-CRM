import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from '../DataTable';

describe('DataTable Primitive', () => {
  const columns = [
    { header: 'Deal Name', accessor: 'name' },
    { header: 'Stage', accessor: 'stage' },
    {
      header: 'Value',
      render: (row) => <span>₹{row.value.toLocaleString('en-IN')}</span>
    }
  ];

  const sampleData = [
    { id: 'deal-001', name: 'DLF Phase 5 Villa', stage: 'Negotiation', value: 45000000 },
    { id: 'deal-002', name: 'M3M Golf Hills Apt', stage: 'Proposal', value: 18500000 }
  ];

  it('renders loading state with role="status" and aria-live="polite"', () => {
    render(<DataTable columns={columns} data={[]} isLoading={true} />);

    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText(/loading data\.\.\./i)).toBeInTheDocument();
  });

  it('renders empty message when data is empty or absent', () => {
    const { rerender } = render(<DataTable columns={columns} data={[]} emptyMessage="No deals found" />);
    expect(screen.getByText('No deals found')).toBeInTheDocument();

    rerender(<DataTable columns={columns} data={null} emptyMessage={<span>Custom Empty State</span>} />);
    expect(screen.getByText('Custom Empty State')).toBeInTheDocument();
  });

  it('renders headers, rows, and custom cell renderers accurately', () => {
    render(<DataTable columns={columns} data={sampleData} />);

    expect(screen.getByText('Deal Name')).toBeInTheDocument();
    expect(screen.getByText('Stage')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();

    expect(screen.getByText('DLF Phase 5 Villa')).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
    expect(screen.getByText('₹4,50,00,000')).toBeInTheDocument();

    expect(screen.getByText('M3M Golf Hills Apt')).toBeInTheDocument();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
    expect(screen.getByText('₹1,85,00,000')).toBeInTheDocument();
  });

  it('supports deterministic row keys with MongoDB _id or row index fallback (Defect 3 regression test)', () => {
    const mongoData = [
      { _id: 'mongo-id-1', name: 'Record One', stage: 'New', value: 100 },
      { _id: 'mongo-id-2', name: 'Record Two', stage: 'Active', value: 200 }
    ];

    const { container } = render(<DataTable columns={columns} data={mongoData} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  it('enforces accessible row interactivity when onRowClick is provided', () => {
    const handleRowClick = vi.fn();
    render(<DataTable columns={columns} data={sampleData} onRowClick={handleRowClick} />);

    const clickableRows = screen.getAllByRole('button');
    expect(clickableRows.length).toBe(2);
    expect(clickableRows[0]).toHaveAttribute('tabIndex', '0');

    // Click trigger
    fireEvent.click(clickableRows[0]);
    expect(handleRowClick).toHaveBeenCalledWith(sampleData[0]);

    // Keyboard Enter trigger
    fireEvent.keyDown(clickableRows[1], { key: 'Enter' });
    expect(handleRowClick).toHaveBeenCalledWith(sampleData[1]);

    // Keyboard Space trigger
    fireEvent.keyDown(clickableRows[0], { key: ' ' });
    expect(handleRowClick).toHaveBeenCalledTimes(3);
  });

  it('renders non-interactive rows without button semantics when onRowClick is omitted', () => {
    const { container } = render(<DataTable columns={columns} data={sampleData} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0]).not.toHaveAttribute('role');
    expect(rows[0]).not.toHaveAttribute('tabIndex');
  });
});
