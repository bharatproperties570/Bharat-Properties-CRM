import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AccountPage from '../AccountPage';

const mockUseBookings = vi.fn();
const mockOnNavigate = vi.fn();

vi.mock('../../../utils/crmHooks', () => ({
  useBookings: () => mockUseBookings()
}));

vi.mock('../../../utils/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { success: true } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } })
  }
}));

const syntheticBookings = [
  {
    _id: 'booking-001',
    id: 'booking-001',
    property: {
      name: 'DLF Cyber City',
      unitNumber: 'Tower-A 402'
    },
    lead: {
      firstName: 'Amit',
      lastName: 'Kumar',
      mobile: '9811122334'
    },
    totalDealAmount: 15000000,
    tokenAmount: 1000000,
    partPaymentAmount: 4000000,
    sellerBrokerageAmount: 150000,
    buyerBrokerageAmount: 150000,
    status: 'Booked'
  },
  {
    _id: 'booking-002',
    id: 'booking-002',
    property: {
      name: 'Godrej Woods',
      unitNumber: 'Villa 12'
    },
    lead: {
      firstName: 'Sunita',
      lastName: 'Verma',
      mobile: '9822233445'
    },
    totalDealAmount: 25000000,
    tokenAmount: 2500000,
    partPaymentAmount: 22500000,
    sellerBrokerageAmount: 0,
    buyerBrokerageAmount: 250000,
    status: 'Registry'
  },
  {
    _id: 'booking-003',
    id: 'booking-003',
    property: {
      name: 'M3M Golfestate',
      unitNumber: 'Unit 901'
    },
    lead: {
      firstName: 'Vikram',
      lastName: 'Malhotra',
      mobile: '9833344556'
    },
    totalDealAmount: 30000000,
    tokenAmount: 1000000,
    partPaymentAmount: 0,
    sellerBrokerageAmount: 0,
    buyerBrokerageAmount: 0,
    status: 'Cancelled'
  }
];

describe('AccountPage with DataTable (Phase 10.19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBookings.mockReturnValue({
      data: { data: syntheticBookings },
      isLoading: false,
      error: null
    });
  });

  it('renders Accounts & Ledgers page header, stat cards, and DataTable with 7 column headers', () => {
    const { container } = render(<AccountPage onNavigate={mockOnNavigate} />);

    expect(screen.getByText('Accounts & Ledgers')).toBeInTheDocument();
    expect(screen.getByText('Financial Intelligence')).toBeInTheDocument();

    // 4 Top Stats
    expect(screen.getByText('Total Receivables')).toBeInTheDocument();
    expect(screen.getByText('Collections Done')).toBeInTheDocument();
    expect(screen.getByText('Pending Dues')).toBeInTheDocument();
    expect(screen.getByText('Agency Commission')).toBeInTheDocument();

    // DataTable 7 Column Headers
    expect(screen.getByText('Project & Unit')).toBeInTheDocument();
    expect(screen.getByText('Client Name')).toBeInTheDocument();
    expect(screen.getByText('Deal Value')).toBeInTheDocument();
    expect(screen.getByText('Received')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();

    const columnHeaders = container.querySelectorAll('th');
    expect(columnHeaders).toHaveLength(7);
  });

  it('renders populated booking rows with formatted financial values, contact details, and status badges', () => {
    render(<AccountPage onNavigate={mockOnNavigate} />);

    // Row 1: DLF Cyber City
    expect(screen.getByText('DLF Cyber City')).toBeInTheDocument();
    expect(screen.getByText('Unit: Tower-A 402')).toBeInTheDocument();
    expect(screen.getByText('Amit Kumar')).toBeInTheDocument();
    expect(screen.getByText('9811122334')).toBeInTheDocument();
    expect(screen.getByText(`₹${(15000000).toLocaleString()}`)).toBeInTheDocument();
    expect(screen.getByText(`₹${(5000000).toLocaleString()}`)).toBeInTheDocument(); // received
    expect(screen.getByText(`₹${(10000000).toLocaleString()}`)).toBeInTheDocument(); // balance
    expect(screen.getByText('Booked')).toBeInTheDocument();

    // Row 2: Godrej Woods
    expect(screen.getByText('Godrej Woods')).toBeInTheDocument();
    expect(screen.getByText('Unit: Villa 12')).toBeInTheDocument();
    expect(screen.getByText('Sunita Verma')).toBeInTheDocument();
    expect(screen.getByText('Registry')).toBeInTheDocument();

    // Row 3: M3M Golfestate
    expect(screen.getByText('M3M Golfestate')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('filters bookings dynamically based on search query', () => {
    render(<AccountPage onNavigate={mockOnNavigate} />);

    const searchInput = screen.getByPlaceholderText('Search by Project or Client...');
    fireEvent.change(searchInput, { target: { value: 'DLF' } });

    expect(screen.getByText('DLF Cyber City')).toBeInTheDocument();
    expect(screen.queryByText('Godrej Woods')).not.toBeInTheDocument();
    expect(screen.queryByText('M3M Golfestate')).not.toBeInTheDocument();
  });

  it('filter tabs: clicking Receivables excludes Cancelled status', () => {
    render(<AccountPage onNavigate={mockOnNavigate} />);

    const receivablesBtn = screen.getByRole('button', { name: 'Receivables' });
    fireEvent.click(receivablesBtn);

    expect(screen.getByText('DLF Cyber City')).toBeInTheDocument();
    expect(screen.getByText('Godrej Woods')).toBeInTheDocument();
    expect(screen.queryByText('M3M Golfestate')).not.toBeInTheDocument();
  });

  it('filter tabs: clicking Payables shows bookings with sellerBrokerageAmount > 0', () => {
    render(<AccountPage onNavigate={mockOnNavigate} />);

    const payablesBtn = screen.getByRole('button', { name: 'Payables' });
    fireEvent.click(payablesBtn);

    // Only booking-001 has sellerBrokerageAmount: 150000
    expect(screen.getByText('DLF Cyber City')).toBeInTheDocument();
    expect(screen.queryByText('Godrej Woods')).not.toBeInTheDocument();
    expect(screen.queryByText('M3M Golfestate')).not.toBeInTheDocument();
  });

  it('renders emptyMessage when search returns no matches', () => {
    render(<AccountPage onNavigate={mockOnNavigate} />);

    const searchInput = screen.getByPlaceholderText('Search by Project or Client...');
    fireEvent.change(searchInput, { target: { value: 'NonexistentProjectXYZ' } });

    expect(screen.getByText('No financial records found.')).toBeInTheDocument();
  });

  it('renders loading state when isLoading is true', () => {
    mockUseBookings.mockReturnValue({
      data: null,
      isLoading: true,
      error: null
    });

    render(<AccountPage onNavigate={mockOnNavigate} />);

    expect(screen.getByText('Fetching financial records...')).toBeInTheDocument();
  });

  it('clicking View Ledger button calls onNavigate with booking ID', () => {
    render(<AccountPage onNavigate={mockOnNavigate} />);

    const viewLedgerBtn = screen.getByRole('button', { name: /View Ledger for DLF Cyber City/i });
    fireEvent.click(viewLedgerBtn);

    expect(mockOnNavigate).toHaveBeenCalledWith('booking', 'booking-001');
  });

  it('security audit: table renders zero secrets, tokens, or credentials', () => {
    const { container } = render(<AccountPage onNavigate={mockOnNavigate} />);

    const html = container.innerHTML;
    expect(html).not.toMatch(/password/i);
    expect(html).not.toMatch(/bearer/i);
    expect(html).not.toMatch(/secret/i);
    expect(html).not.toMatch(/\$2[aby]\$/);
  });
});
