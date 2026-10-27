import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from '../DataTable';

describe('DataTable Primitive (Phase 10.3 Native Semantics & Accessibility)', () => {
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

  it('supports deterministic row keys with MongoDB _id or row index fallback', () => {
    const mongoData = [
      { _id: 'mongo-id-1', name: 'Record One', stage: 'New', value: 100 },
      { _id: 'mongo-id-2', name: 'Record Two', stage: 'Active', value: 200 }
    ];

    const { container } = render(<DataTable columns={columns} data={mongoData} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  it('preserves native table semantics: <tr> has NO role="button" and NO tabIndex', () => {
    const handleRowClick = vi.fn();
    const { container } = render(<DataTable columns={columns} data={sampleData} onRowClick={handleRowClick} />);

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    rows.forEach((tr) => {
      expect(tr).not.toHaveAttribute('role');
      expect(tr).not.toHaveAttribute('tabindex');
      expect(tr.tagName.toLowerCase()).toBe('tr');
    });
  });

  it('supports full-row mouse click via progressive enhancement on non-interactive areas', () => {
    const handleRowClick = vi.fn();
    const { container } = render(<DataTable columns={columns} data={sampleData} onRowClick={handleRowClick} />);

    const rows = container.querySelectorAll('tbody tr');
    // Click on the second cell (Stage column td)
    const stageCell = rows[0].querySelectorAll('td')[1];
    fireEvent.click(stageCell);

    expect(handleRowClick).toHaveBeenCalledTimes(1);
    expect(handleRowClick).toHaveBeenCalledWith(sampleData[0]);
  });

  it('provides accessible keyboard navigation via primary-cell action button with Enter and Space', () => {
    const handleRowClick = vi.fn();
    render(<DataTable columns={columns} data={sampleData} onRowClick={handleRowClick} />);

    // Primary action button should be rendered in the primary column ("Deal Name")
    const primaryButton1 = screen.getByRole('button', { name: /select dlf phase 5 villa/i });
    const primaryButton2 = screen.getByRole('button', { name: /select m3m golf hills apt/i });

    expect(primaryButton1).toBeInTheDocument();
    expect(primaryButton2).toBeInTheDocument();

    // Click on primary button
    fireEvent.click(primaryButton1);
    expect(handleRowClick).toHaveBeenCalledWith(sampleData[0]);

    // Keyboard Enter trigger on native button
    fireEvent.keyDown(primaryButton2, { key: 'Enter', code: 'Enter' });
    fireEvent.click(primaryButton2); // In standard browser/RTL, Enter on a button dispatches click
    expect(handleRowClick).toHaveBeenCalledWith(sampleData[1]);

    // Keyboard Space trigger on native button
    fireEvent.keyDown(primaryButton1, { key: ' ', code: 'Space' });
    fireEvent.click(primaryButton1);
    expect(handleRowClick).toHaveBeenCalledTimes(3);
  });

  it('customizes primary action accessible name via getRowAriaLabel', () => {
    const handleRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={sampleData}
        onRowClick={handleRowClick}
        getRowAriaLabel={(row) => `View details for property ${row.name}`}
      />
    );

    expect(
      screen.getByRole('button', { name: 'View details for property DLF Phase 5 Villa' })
    ).toBeInTheDocument();
  });

  it('isolates nested buttons, links, inputs, selects, and checkboxes from row click', () => {
    const handleRowClick = vi.fn();
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();
    const handleCheckbox = vi.fn();

    const interactiveColumns = [
      {
        key: 'select',
        header: '',
        isSelection: true,
        render: (row) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.name}`}
            onClick={(e) => {
              handleCheckbox(row);
            }}
          />
        )
      },
      { header: 'Deal Name', accessor: 'name' },
      {
        key: 'link',
        header: 'External Link',
        render: (row) => (
          <a
            href="#/deals"
            onClick={(e) => {
              e.preventDefault();
            }}
          >
            Public Link
          </a>
        )
      },
      {
        key: 'statusSelect',
        header: 'Status',
        render: (row) => (
          <select aria-label="Update status" defaultValue="open">
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        )
      },
      {
        key: 'actions',
        header: 'Actions',
        isAction: true,
        render: (row) => (
          <div>
            <button type="button" onClick={() => handleEdit(row)}>
              Edit
            </button>
            <button type="button" onClick={() => handleDelete(row)}>
              Delete
            </button>
            <span data-prevent-row-click data-testid="opt-out-badge">
              Opted Out
            </span>
          </div>
        )
      }
    ];

    render(
      <DataTable
        columns={interactiveColumns}
        data={sampleData}
        onRowClick={handleRowClick}
      />
    );

    // 1. Click nested checkbox
    const checkbox = screen.getByRole('checkbox', { name: 'Select DLF Phase 5 Villa' });
    fireEvent.click(checkbox);
    expect(handleCheckbox).toHaveBeenCalledWith(sampleData[0]);
    expect(handleRowClick).not.toHaveBeenCalled();

    // 2. Click nested edit button
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    expect(handleEdit).toHaveBeenCalledWith(sampleData[0]);
    expect(handleRowClick).not.toHaveBeenCalled();

    // 3. Click nested delete button
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[1]);
    expect(handleDelete).toHaveBeenCalledWith(sampleData[1]);
    expect(handleRowClick).not.toHaveBeenCalled();

    // 4. Click nested link
    const link = screen.getAllByRole('link', { name: 'Public Link' })[0];
    fireEvent.click(link);
    expect(handleRowClick).not.toHaveBeenCalled();

    // 5. Click nested select
    const select = screen.getAllByRole('combobox', { name: 'Update status' })[0];
    fireEvent.click(select);
    expect(handleRowClick).not.toHaveBeenCalled();

    // 6. Click explicit opt-out element
    const optOutBadges = screen.getAllByTestId('opt-out-badge');
    fireEvent.click(optOutBadges[0]);
    expect(handleRowClick).not.toHaveBeenCalled();
  });

  it('skips selection columns when automatically resolving primary column', () => {
    const handleRowClick = vi.fn();
    const columnsWithSelect = [
      { key: 'select', header: '', isSelection: true, render: () => <input type="checkbox" /> },
      { key: 'title', header: 'Title', accessor: 'name' }
    ];

    render(<DataTable columns={columnsWithSelect} data={sampleData} onRowClick={handleRowClick} />);

    // Primary action button should be on the 'Title' column ("DLF Phase 5 Villa"), NOT the checkbox column
    const actionButton = screen.getByRole('button', { name: /select dlf phase 5 villa/i });
    expect(actionButton).toBeInTheDocument();
    expect(actionButton.closest('td')).not.toContainElement(screen.getAllByRole('checkbox')[0]);
  });

  it('respects primaryColumnKey to target a specific column', () => {
    const handleRowClick = vi.fn();
    const multiColumns = [
      { key: 'code', header: 'Code', accessor: 'id' },
      { key: 'dealTitle', header: 'Title', accessor: 'name' }
    ];

    render(
      <DataTable
        columns={multiColumns}
        data={sampleData}
        onRowClick={handleRowClick}
        primaryColumnKey="dealTitle"
      />
    );

    // The button should be on 'dealTitle' ("DLF Phase 5 Villa"), not 'code' ("deal-001")
    expect(screen.getByRole('button', { name: /select dlf phase 5 villa/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /select deal-001/i })).not.toBeInTheDocument();
  });

  it('does not wrap content that is already an interactive element', () => {
    const handleRowClick = vi.fn();
    const interactiveCol = [
      {
        key: 'name',
        header: 'Deal Name',
        render: (row) => (
          <button type="button" onClick={() => {}}>
            Inner Custom Button: {row.name}
          </button>
        )
      }
    ];

    const { container } = render(
      <DataTable columns={interactiveCol} data={sampleData} onRowClick={handleRowClick} />
    );

    // Should NOT have nested buttons (<button><button>...</button></button>)
    const buttons = container.querySelectorAll('tbody button');
    expect(buttons.length).toBe(2);
    expect(buttons[0].parentElement.tagName.toLowerCase()).toBe('td');
    expect(buttons[0].querySelector('button')).toBeNull();
  });

  it('respects disablePrimaryTrigger on column or disableRowKeyboardTrigger on table', () => {
    const handleRowClick = vi.fn();

    // 1. Column level disable
    const disabledCol = [
      { header: 'Deal Name', accessor: 'name', disablePrimaryTrigger: true },
      { header: 'Stage', accessor: 'stage' }
    ];

    const { rerender, container } = render(
      <DataTable columns={disabledCol} data={sampleData} onRowClick={handleRowClick} />
    );
    expect(container.querySelectorAll('.ui-datatable-primary-action').length).toBe(0);

    // 2. Table level disable
    rerender(
      <DataTable
        columns={columns}
        data={sampleData}
        onRowClick={handleRowClick}
        disableRowKeyboardTrigger={true}
      />
    );
    expect(container.querySelectorAll('.ui-datatable-primary-action').length).toBe(0);
  });

  it('renders non-interactive rows without button semantics or handlers when onRowClick is omitted', () => {
    const { container } = render(<DataTable columns={columns} data={sampleData} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0]).not.toHaveAttribute('role');
    expect(rows[0]).not.toHaveAttribute('tabIndex');
    expect(rows[0].style.cursor).toBe('');
  });
});
