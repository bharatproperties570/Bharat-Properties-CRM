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

    // ─── CODEX REMEDIATION 1: STALE AUTOCOMPLETE REQUEST CANCELLATION ───────────

    it('clears query before debounce fires: cancels pending debounce timer and prevents API call', async () => {
        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'Camellias' } });

        // Advance 100ms (less than 250ms debounce threshold)
        act(() => {
            vi.advanceTimersByTime(100);
        });

        // Click Clear button before debounce timer fires
        const clearBtn = screen.getByRole('button', { name: /Clear search input/i });
        fireEvent.click(clearBtn);

        // Advance beyond debounce time
        await act(async () => {
            vi.advanceTimersByTime(400);
        });

        expect(api.get).not.toHaveBeenCalled();
        expect(input.value).toBe('');
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('clears query while request is in flight: aborts active request and does not repopulate results', async () => {
        let resolvePromise;
        const pendingPromise = new Promise((resolve) => {
            resolvePromise = resolve;
        });
        api.get.mockReturnValueOnce(pendingPromise);

        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'Camellias' } });

        // Advance 250ms so debounce fires and api.get is called
        act(() => {
            vi.advanceTimersByTime(250);
        });
        expect(api.get).toHaveBeenCalledTimes(1);

        // Clear query while request is in flight
        const clearBtn = screen.getByRole('button', { name: /Clear search input/i });
        fireEvent.click(clearBtn);

        expect(input.value).toBe('');

        // Resolve the stale promise with data
        await act(async () => {
            resolvePromise({
                data: {
                    success: true,
                    data: { items: sampleItems, limit: 25 }
                }
            });
        });

        // Stale results must NOT be rendered, and dropdown must stay closed
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(screen.queryByText(/DLF The Camellias · Tower 4 - Unit 12B/i)).not.toBeInTheDocument();
        expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('resolves an old request after a newer query has been entered: stale results are discarded', async () => {
        let resolveFirst;
        const firstPromise = new Promise((resolve) => {
            resolveFirst = resolve;
        });

        const secondItems = [
            {
                id: 'inv-201',
                project: 'Central Park Resorts',
                unit: 'Tower 2 - 501',
                size: '2200 sq.ft',
                label: 'Central Park Resorts · Tower 2 - 501'
            }
        ];

        api.get
            .mockReturnValueOnce(firstPromise)
            .mockResolvedValueOnce({
                data: {
                    success: true,
                    data: { items: secondItems, limit: 25 }
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

        // Type first query
        fireEvent.change(input, { target: { value: 'Camellias' } });
        act(() => {
            vi.advanceTimersByTime(250);
        });
        expect(api.get).toHaveBeenCalledTimes(1);

        // Type second query before first resolves
        fireEvent.change(input, { target: { value: 'Central Park' } });
        await act(async () => {
            vi.advanceTimersByTime(250);
        });
        expect(api.get).toHaveBeenCalledTimes(2);

        // Now resolve the old first request
        await act(async () => {
            resolveFirst({
                data: {
                    success: true,
                    data: { items: sampleItems, limit: 25 }
                }
            });
        });

        // Old results must NOT overwrite new query results
        expect(screen.getByText(/Central Park Resorts · Tower 2 - 501/i)).toBeInTheDocument();
        expect(screen.queryByText(/DLF The Camellias · Tower 4 - Unit 12B/i)).not.toBeInTheDocument();
    });

    it('confirms loading state is reset when search is cancelled or cleared', async () => {
        let resolvePending;
        api.get.mockReturnValueOnce(new Promise((resolve) => {
            resolvePending = resolve;
        }));

        render(
            <InventoryAutocompletePicker
                selectedItems={[]}
                onSelect={mockOnSelect}
                onRemove={mockOnRemove}
            />
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'Camellias' } });

        act(() => {
            vi.advanceTimersByTime(250);
        });

        // Clear input
        const clearBtn = screen.getByRole('button', { name: /Clear search input/i });
        fireEvent.click(clearBtn);

        // Dropdown must be closed and no searching spinner in DOM
        expect(screen.queryByText(/Searching CRM inventory/i)).not.toBeInTheDocument();
        expect(input).toHaveAttribute('aria-expanded', 'false');

        // Cleanup pending
        resolvePending({ data: { success: true, data: { items: [] } } });
    });

    // ─── CODEX REMEDIATION 3: PREVENT UNINTENDED FORM SUBMISSION ────────────────

    it('pressing Enter when dropdown is closed does not submit parent form', () => {
        const mockFormSubmit = vi.fn((e) => e.preventDefault());

        render(
            <form onSubmit={mockFormSubmit}>
                <InventoryAutocompletePicker
                    selectedItems={[]}
                    onSelect={mockOnSelect}
                    onRemove={mockOnRemove}
                />
            </form>
        );

        const input = screen.getByRole('combobox');
        expect(input).toHaveAttribute('aria-expanded', 'false');

        fireEvent.keyDown(input, { key: 'Enter' });

        expect(mockFormSubmit).not.toHaveBeenCalled();
    });

    it('pressing Enter during pending debounce does not submit parent form', () => {
        const mockFormSubmit = vi.fn((e) => e.preventDefault());

        render(
            <form onSubmit={mockFormSubmit}>
                <InventoryAutocompletePicker
                    selectedItems={[]}
                    onSelect={mockOnSelect}
                    onRemove={mockOnRemove}
                />
            </form>
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'Camellias' } });

        // Advance 100ms (debounce still pending, dropdown closed)
        act(() => {
            vi.advanceTimersByTime(100);
        });

        fireEvent.keyDown(input, { key: 'Enter' });

        expect(mockFormSubmit).not.toHaveBeenCalled();
        expect(api.get).not.toHaveBeenCalled();
    });

    it('pressing Enter with no highlighted option does not submit parent form', async () => {
        const mockFormSubmit = vi.fn((e) => e.preventDefault());

        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                data: { items: sampleItems, limit: 25 }
            }
        });

        render(
            <form onSubmit={mockFormSubmit}>
                <InventoryAutocompletePicker
                    selectedItems={[]}
                    onSelect={mockOnSelect}
                    onRemove={mockOnRemove}
                />
            </form>
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'DLF' } });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        // Dropdown is open but no option is highlighted (highlightedIndex is -1)
        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(input).not.toHaveAttribute('aria-activedescendant');

        fireEvent.keyDown(input, { key: 'Enter' });

        expect(mockFormSubmit).not.toHaveBeenCalled();
        expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('pressing Enter with a valid highlighted option selects it and does not submit form', async () => {
        const mockFormSubmit = vi.fn((e) => e.preventDefault());

        api.get.mockResolvedValueOnce({
            data: {
                success: true,
                data: { items: sampleItems, limit: 25 }
            }
        });

        render(
            <form onSubmit={mockFormSubmit}>
                <InventoryAutocompletePicker
                    selectedItems={[]}
                    onSelect={mockOnSelect}
                    onRemove={mockOnRemove}
                />
            </form>
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'DLF' } });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        // Highlight first option
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(input).toHaveAttribute('aria-activedescendant', 'inventory-option-0');

        // Press Enter
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(mockOnSelect).toHaveBeenCalledWith(sampleItems[0]);
        expect(mockFormSubmit).not.toHaveBeenCalled();
    });

    it('explicit Save Draft button outside combobox still submits form normally', () => {
        const mockFormSubmit = vi.fn((e) => e.preventDefault());

        render(
            <form onSubmit={mockFormSubmit}>
                <InventoryAutocompletePicker
                    selectedItems={[]}
                    onSelect={mockOnSelect}
                    onRemove={mockOnRemove}
                />
                <button type="submit">Save draft only</button>
            </form>
        );

        const submitBtn = screen.getByRole('button', { name: /Save draft only/i });
        fireEvent.click(submitBtn);

        expect(mockFormSubmit).toHaveBeenCalledTimes(1);
    });
});
