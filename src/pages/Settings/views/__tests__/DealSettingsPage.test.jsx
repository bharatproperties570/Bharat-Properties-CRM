import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DealSettingsPage from '../DealSettingsPage';
import { api } from '../../../../utils/api';

// Mock API
vi.mock('../../../../utils/api', () => ({
  api: {
    get: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

// Mock crmHooks
const mockLookupsData = [
  { _id: 'st-1', lookup_type: 'State', lookup_value: 'Haryana' },
  { _id: 'dt-1', lookup_type: 'City', lookup_value: 'Gurugram' },
];

vi.mock('../../../../utils/crmHooks', () => ({
  useLookups: () => ({
    data: mockLookupsData,
  }),
}));

// Mock CreateGlobalConfigModal
vi.mock('../../../../components/CreateGlobalConfigModal', () => ({
  default: ({ isOpen, onClose, configData }) =>
    isOpen ? (
      <div data-testid="mock-config-modal">
        <span>Modal Open</span>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

describe('DealSettingsPage with DataTable', () => {
  const mockCollectorRates = [
    {
      _id: 'cr-1',
      location: { lookup_value: 'Golf Course Road' },
      district: { lookup_value: 'Gurugram' },
      tehsil: { lookup_value: 'Wazirabad' },
      state: { lookup_value: 'Haryana' },
      category: 'Residential',
      subCategory: 'Plot',
      rateApplyOn: 'Land Area',
      rateUnit: 'Sq Yard',
      rate: 85000,
      roadMultipliers: [{ roadType: 'Wide Road (>60ft)', multiplier: 10 }],
      floorMultipliers: [],
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: '2026-12-31T00:00:00.000Z',
      versionNo: '2.1',
    },
    {
      _id: 'cr-2',
      location: null,
      district: { lookup_value: 'Faridabad' },
      tehsil: null,
      state: { lookup_value: 'Haryana' },
      category: 'Commercial',
      subCategory: 'SCO',
      rateApplyOn: 'Covered Area',
      rateUnit: 'Sq Ft',
      rate: 120000,
      roadMultipliers: [],
      floorMultipliers: [{ floorType: 'Ground Floor', multiplier: 20 }],
      effectiveFrom: '2026-02-01T00:00:00.000Z',
      effectiveTo: null,
      versionNo: null,
    },
  ];

  const mockRegistrationCharges = [
    {
      _id: 'rc-1',
      key: 'govt_charges_haryana_standard',
      value: {
        state: 'Haryana',
        stampDutyMale: 7,
        stampDutyFemale: 5,
        stampDutyJoint: 6,
        registrationMode: 'percent',
        registrationPercent: 1,
        legalFees: 15000,
      },
    },
    {
      _id: 'rc-2',
      key: 'govt_charges_global_default',
      value: {
        state: null,
        stampDutyMale: 6,
        stampDutyFemale: 6,
        stampDutyJoint: 6,
        registrationMode: 'slab',
        registrationPercent: 0,
        legalFees: 10000,
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    api.get.mockImplementation((url) => {
      if (url.includes('/collector-rates')) {
        return Promise.resolve({
          data: {
            status: 'success',
            data: {
              docs: mockCollectorRates,
              totalPages: 1,
              totalDocs: 2,
            },
          },
        });
      }
      if (url.includes('/system-settings')) {
        return Promise.resolve({
          data: {
            status: 'success',
            data: {
              docs: mockRegistrationCharges,
              totalPages: 1,
              totalDocs: 2,
            },
          },
        });
      }
      return Promise.resolve({ data: { status: 'success', data: {} } });
    });

    api.delete.mockResolvedValue({ data: { status: 'success' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders page header and Collector Rates table with DataTable semantics', async () => {
    render(<DealSettingsPage />);

    expect(screen.getByRole('heading', { level: 1, name: /Govt\. Charges Configuration/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    // Verify 7 column headers
    expect(screen.getByRole('columnheader', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Property Type' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Basis / Unit' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Rate (₹)' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Multipliers' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Period' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();

    // Verify row 1 values
    expect(screen.getByText(/Golf Course Road •/i)).toBeInTheDocument();
    expect(screen.getByText('Residential')).toBeInTheDocument();
    expect(screen.getByText('Plot')).toBeInTheDocument();
    expect(screen.getByText('Land Area')).toBeInTheDocument();
    expect(screen.getByText('per Sq Yard')).toBeInTheDocument();
    expect(screen.getByText('₹85,000')).toBeInTheDocument();
    expect(screen.getByText('Wide Road (>60ft): 10%')).toBeInTheDocument();
    expect(screen.getByText('v2.1')).toBeInTheDocument();

    // Verify row 2 values
    expect(screen.getByText('Faridabad')).toBeInTheDocument();
    expect(screen.getByText('Commercial')).toBeInTheDocument();
    expect(screen.getByText('SCO')).toBeInTheDocument();
    expect(screen.getByText('Covered Area')).toBeInTheDocument();
    expect(screen.getByText('per Sq Ft')).toBeInTheDocument();
    expect(screen.getByText('₹120,000')).toBeInTheDocument();
    expect(screen.getByText('Ground Floor: 20%')).toBeInTheDocument();
  });

  it('deletes a collector rate when delete button is clicked and confirmed', async () => {
    render(<DealSettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByLabelText('Delete rate')).toHaveLength(2);
    });

    const deleteButtons = screen.getAllByLabelText('Delete rate');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    expect(window.confirm).toHaveBeenCalledWith('Delete this rate?');
    expect(api.delete).toHaveBeenCalledWith('/collector-rates/cr-1');
  });

  it('renders empty message when no collector rates exist', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/collector-rates')) {
        return Promise.resolve({
          data: {
            status: 'success',
            data: { docs: [], totalPages: 1, totalDocs: 0 },
          },
        });
      }
      return Promise.resolve({ data: { status: 'success', data: { docs: [] } } });
    });

    render(<DealSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('No collector rates found. Add one to get started.')).toBeInTheDocument();
    });
  });

  it('switches to Government Charges tab and renders DataTable with 6 columns', async () => {
    render(<DealSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registration Charges' })).toBeInTheDocument();
    });

    const regChargesTab = screen.getByRole('button', { name: 'Registration Charges' });
    fireEvent.click(regChargesTab);

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Config Name' })).toBeInTheDocument();
    });

    // 6 column headers
    expect(screen.getByRole('columnheader', { name: 'Config Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Target State' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Stamp Duty (M/F/J)' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Regis. Fee' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Legal Fees' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();

    // Row 1 values
    expect(screen.getByText('haryana_standard')).toBeInTheDocument();
    expect(screen.getByText('Region Specific')).toBeInTheDocument();
    expect(screen.getByText('7% / 5% / 6%')).toBeInTheDocument();
    expect(screen.getByText('1%')).toBeInTheDocument();
    expect(screen.getByText('₹15,000')).toBeInTheDocument();

    // Row 2 values
    expect(screen.getByText('global_default')).toBeInTheDocument();
    expect(screen.getByText('Global (All)')).toBeInTheDocument();
    expect(screen.getByText('6% / 6% / 6%')).toBeInTheDocument();
    expect(screen.getByText('Slab-based')).toBeInTheDocument();
    expect(screen.getByText('₹10,000')).toBeInTheDocument();
  });

  it('opens modal to edit registration charge config on edit button click', async () => {
    render(<DealSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registration Charges' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Registration Charges' }));

    await waitFor(() => {
      expect(screen.getAllByLabelText('Edit charge')).toHaveLength(2);
    });

    const editButtons = screen.getAllByLabelText('Edit charge');
    fireEvent.click(editButtons[0]);

    expect(screen.getByTestId('mock-config-modal')).toBeInTheDocument();
  });

  it('deletes registration charge when delete button is clicked and confirmed', async () => {
    render(<DealSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registration Charges' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Registration Charges' }));

    await waitFor(() => {
      expect(screen.getAllByLabelText('Delete charge')).toHaveLength(2);
    });

    const deleteButtons = screen.getAllByLabelText('Delete charge');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    expect(window.confirm).toHaveBeenCalledWith('Delete this registration charge?');
    expect(api.delete).toHaveBeenCalledWith('/system-settings/govt_charges_haryana_standard');
  });

  it('renders empty message in Government Charges tab when no charges exist', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/system-settings')) {
        return Promise.resolve({
          data: {
            status: 'success',
            data: { docs: [], totalPages: 1, totalDocs: 0 },
          },
        });
      }
      return Promise.resolve({ data: { status: 'success', data: { docs: [] } } });
    });

    render(<DealSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registration Charges' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Registration Charges' }));

    await waitFor(() => {
      expect(screen.getByText('No configuration found. Add one to get started.')).toBeInTheDocument();
    });
  });
});
