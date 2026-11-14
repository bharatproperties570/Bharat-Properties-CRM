import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import InventoryAutocompletePicker from '../InventoryAutocompletePicker';
import { api } from '../../../../utils/api';

vi.mock('../../../../utils/api', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn()
    }
}));

describe('InventoryAutocompletePicker Component', () => {
    const mockOnSelect = vi.fn();
    const mockOnRemove = vi.fn();

    const sampleItems = [
        {
            id: 'inv-101',
            project: 'DLF The Camellias',
            unit: 'Tower 4 - Unit 12B',
            size: '7400 sq.ft',
            label: 'DLF The Camellias · Tower 4 - Unit 12B'
        },
        {
            id: 'inv-102',
            project: 'DLF The Magnolias',
            unit: 'Penthouse 1A',
            size: '9800 sq.ft',
            label: 'DLF The Magnolias · Penthouse 1A'
        }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('renders input with placeholder and search icon', () => {
        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
                placeholder="Search properties..."
            />
        );

        const input = screen.getByRole('combobox');
        expect(input).toBeInTheDocument();
        expect(input).toHaveAttribute('placeholder', 'Search properties...');
        expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('renders selected inventory chips and handles remove action', () => {
        render(
            <InventoryAutocompletePicker
                selectedItems={[sampleItems[0]]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        expect(screen.getByText('DLF The Camellias')).toBeInTheDocument();
        expect(screen.getByText(/Tower 4 - Unit 12B/)).toBeInTheDocument();

        const removeButton = screen.getByRole('button', { name: /Remove DLF The Camellias/i });
        fireEvent.click(removeButton);

        expect(mockOnRemove).toHaveBeenCalledWith('inv-101');
    });

    it('does not trigger search when query has less than 2 characters', async () => {
        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'D' } });

        act(() => {
            vi.advanceTimersByTime(300);
        });

        expect(api.get).not.toHaveBeenCalled();
        expect(screen.getByText(/Type at least 2 characters to search properties/i)).toBeInTheDocument();
    });

    it('executes debounced search after 250ms for queries >= 2 characters', async () => {
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                data: {
                    items: sampleItems,
                    limit: 25
                }
            }
        });

        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'DLF' } });

        // Before debounce timer expires
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(api.get).not.toHaveBeenCalled();

        // After debounce timer expires (250ms)
        await act(async () => {
            vi.advanceTimersByTime(200);
        });

        expect(api.get).toHaveBeenCalledWith('/owner-outreach/inventory-search', {
            params: { q: 'DLF', limit: 25 },
            signal: expect.any(AbortSignal)
        });

        expect(screen.getByText(/DLF The Camellias · Tower 4 - Unit 12B/i)).toBeInTheDocument();
        expect(screen.getByText(/DLF The Magnolias · Penthouse 1A/i)).toBeInTheDocument();
    });

    it('selects an item upon click, calls onSelect, and clears search input', async () => {
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                data: {
                    items: sampleItems,
                    limit: 25
                }
            }
        });

        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'DLF' } });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        const option = screen.getByText(/DLF The Camellias · Tower 4 - Unit 12B/i);
        fireEvent.click(option);

        expect(mockOnSelect).toHaveBeenCalledWith(sampleItems[0]);
        expect(input.value).toBe('');
    });

    it('prevents duplicate addition for already selected items', async () => {
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                data: {
                    items: sampleItems,
                    limit: 25
                }
            }
        });

        render(
            <InventoryAutocompletePicker
                selectedItems={[sampleItems[0]]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'DLF' } });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        // The first item should show "Selected" badge
        expect(screen.getByText('Selected')).toBeInTheDocument();

        // Clicking it should NOT trigger onSelect
        const selectedOption = screen.getByText(/DLF The Camellias · Tower 4 - Unit 12B/i);
        fireEvent.click(selectedOption);

        expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('supports full keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)', async () => {
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                data: {
                    items: sampleItems,
                    limit: 25
                }
            }
        });

        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'DLF' } });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        // Arrow down to highlight first item
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(input).toHaveAttribute('aria-activedescendant', 'inventory-option-0');

        // Arrow down to highlight second item
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(input).toHaveAttribute('aria-activedescendant', 'inventory-option-1');

        // Arrow up to return to first item
        fireEvent.keyDown(input, { key: 'ArrowUp' });
        expect(input).toHaveAttribute('aria-activedescendant', 'inventory-option-0');

        // Enter to select highlighted item
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockOnSelect).toHaveBeenCalledWith(sampleItems[0]);

        // Dropdown should now be closed
        expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes dropdown when Escape key is pressed', async () => {
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                data: {
                    items: sampleItems,
                    limit: 25
                }
            }
        });

        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'DLF' } });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        expect(screen.getByRole('listbox')).toBeInTheDocument();

        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('renders empty results message when no properties match query', async () => {
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                data: {
                    items: [],
                    limit: 25
                }
            }
        });

        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'NonExistentProject' } });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        expect(screen.getByText(/No properties found matching “NonExistentProject”/i)).toBeInTheDocument();
    });

    it('renders error message when search API fails', async () => {
        api.get.mockRejectedValueOnce({
            response: {
                data: {
                    error: 'Inventory query rate limit exceeded'
                }
            }
        });

        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'DLF' } });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        expect(screen.getByText(/Inventory query rate limit exceeded/i)).toBeInTheDocument();
    });

    it('verifies zero PII exposure: does NOT render phone numbers, emails, or owner names in DOM', async () => {
        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                data: {
                    items: sampleItems,
                    limit: 25
                }
            }
        });

        const { container } = render(
            <InventoryAutocompletePicker
                selectedItems={[sampleItems[0]]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'DLF' } });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        const html = container.innerHTML;

        // No Indian phone numbers (+91 or 10-digit mobile)
        expect(html).not.toMatch(/(\+?91[\s-]?)?[6789]\d{9}/);
        // No email addresses
        expect(html).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        // No owner keywords/labels
        expect(html).not.toMatch(/ownerName|phone|mobile|email|contactNumber/i);
    });
});
