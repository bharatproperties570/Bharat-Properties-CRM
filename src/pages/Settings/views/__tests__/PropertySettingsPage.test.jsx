import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PropertySettingsPage from '../PropertySettingsPage';
import { usePropertyConfig } from '../../../../context/PropertyConfigContext';

// Mock CustomizeFeedbackPage to isolate PropertySettingsPage tests
vi.mock('../CustomizeFeedbackPage', () => ({
  default: () => <div data-testid="mock-feedback-page">Feedback Outcomes View</div>,
}));

// Mock PropertyConfigContext
vi.mock('../../../../context/PropertyConfigContext', () => ({
  usePropertyConfig: vi.fn(),
}));

describe('PropertySettingsPage with DataTable', () => {
  const mockDeleteSize = vi.fn();
  const mockAddSize = vi.fn();
  const mockUpdateSize = vi.fn();
  const mockAddSizeProjectMapping = vi.fn();
  const mockRemoveSizeProjectMapping = vi.fn();

  const mockSizes = [
    {
      id: 'sz-1',
      name: '3BHK Luxury',
      unitType: '3BHK',
      category: 'Residential',
      subCategories: ['Apartment', 'Penthouse'],
      totalArea: 2400,
      resultMetric: 'Sq Ft',
      saleableArea: 2400,
      projectMappings: [
        { project: 'M3M Golfestate', block: 'Tower A' },
        { project: 'DLF The Camellias', block: 'Tower B' },
      ],
    },
    {
      id: 'sz-2',
      name: 'Plot 500 Yd',
      unitType: 'Plot',
      category: 'Plots',
      subCategories: [],
      subCategory: 'Residential Plot',
      totalArea: 500,
      resultMetric: 'Sq Yd',
      saleableArea: '',
      projectMappings: [],
    },
    {
      id: 'sz-3',
      name: 'SCO Commercial',
      unitType: 'SCO',
      category: 'Commercial',
      subCategories: [],
      subCategory: '',
      totalArea: '',
      resultMetric: '',
      saleableArea: '',
      projectMappings: [
        { project: 'Cyber Hub' },
        { project: 'AIPL Joy Central' },
        { project: 'Omaxe City Centre' },
      ],
    },
  ];

  const mockProjects = [
    { id: 'p-1', name: 'M3M Golfestate', blocks: ['Tower A', 'Tower B'] },
    { id: 'p-2', name: 'DLF The Camellias', blocks: ['Tower A', 'Tower B'] },
    { id: 'p-3', name: 'Cyber Hub', blocks: [] },
  ];

  const mockPropertyConfig = {
    Residential: {
      subCategories: [
        { name: 'Apartment', types: [{ name: '3BHK' }], builtupTypes: ['Standard'] },
      ],
    },
    Commercial: {
      subCategories: [
        { name: 'SCO', types: [{ name: 'SCO' }], builtupTypes: ['Bare Shell'] },
      ],
    },
  };

  const mockMasterFields = {
    facings: ['North', 'East', 'South', 'West'],
    unitTypes: ['3BHK', 'Plot', 'SCO'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    usePropertyConfig.mockReturnValue({
      propertyConfig: mockPropertyConfig,
      updateConfig: vi.fn(),
      masterFields: mockMasterFields,
      updateMasterFields: vi.fn(),
      sizes: mockSizes,
      addSize: mockAddSize,
      updateSize: mockUpdateSize,
      deleteSize: mockDeleteSize,
      addSizeProjectMapping: mockAddSizeProjectMapping,
      removeSizeProjectMapping: mockRemoveSizeProjectMapping,
      projects: mockProjects,
      syncCategoryLookup: vi.fn(),
      syncSubCategoryLookup: vi.fn(),
      syncPropertyTypeLookup: vi.fn(),
      syncBuiltupTypeLookup: vi.fn(),
      getLookupId: vi.fn(),
      findLookup: vi.fn(),
    });
  });

  it('renders page header and tabs (Sizes, Configuration, Feedback Outcomes, Orientation)', () => {
    render(<PropertySettingsPage />);

    expect(screen.getByRole('heading', { level: 1, name: /Property Configuration/i })).toBeInTheDocument();
    expect(screen.getByText('Sizes')).toBeInTheDocument();
    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByText('Feedback Outcomes')).toBeInTheDocument();
    expect(screen.getByText('Orientation')).toBeInTheDocument();
  });

  it('renders Property Sizes table inside DataTable with 6 semantic columns and populated rows', () => {
    render(<PropertySettingsPage />);

    expect(screen.getByRole('table')).toBeInTheDocument();

    // Verify 6 column headers
    expect(screen.getByRole('columnheader', { name: /Select all sizes/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Size Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Area' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Available In (Projects)' })).toBeInTheDocument();

    // Verify Row 1
    expect(screen.getByText('3BHK Luxury')).toBeInTheDocument();
    expect(screen.getByText('3BHK')).toBeInTheDocument();
    expect(screen.getByText('Residential')).toBeInTheDocument();
    expect(screen.getByText('Apartment')).toBeInTheDocument();
    expect(screen.getByText('Penthouse')).toBeInTheDocument();
    expect(screen.getByText('2400 Sq Ft')).toBeInTheDocument();
    expect(screen.getByText('M3M Golfestate › Tower A')).toBeInTheDocument();
    expect(screen.getByText('DLF The Camellias › Tower B')).toBeInTheDocument();

    // Verify Row 2
    expect(screen.getByText('Plot 500 Yd')).toBeInTheDocument();
    expect(screen.getByText('Plot')).toBeInTheDocument();
    expect(screen.getByText('Plots')).toBeInTheDocument();
    expect(screen.getByText('Residential Plot')).toBeInTheDocument();
    expect(screen.getByText('500 Sq Yd')).toBeInTheDocument();
    expect(screen.getByText('Not assigned')).toBeInTheDocument();

    // Verify Row 3
    expect(screen.getByText('SCO Commercial')).toBeInTheDocument();
    expect(screen.getByText('Commercial')).toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('toggles individual row selection and select-all checkbox', () => {
    render(<PropertySettingsPage />);

    const selectAllCheckbox = screen.getByRole('checkbox', { name: /Select all sizes/i });
    expect(selectAllCheckbox).not.toBeChecked();

    const row1Checkbox = screen.getByRole('checkbox', { name: 'Select 3BHK Luxury' });
    expect(row1Checkbox).not.toBeChecked();

    // Select row 1
    fireEvent.click(row1Checkbox);
    expect(row1Checkbox).toBeChecked();
    expect(selectAllCheckbox).not.toBeChecked();

    // Click select-all
    fireEvent.click(selectAllCheckbox);
    expect(screen.getByRole('checkbox', { name: 'Select 3BHK Luxury' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Plot 500 Yd' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select SCO Commercial' })).toBeChecked();
  });

  it('filters sizes dynamically based on search input', () => {
    render(<PropertySettingsPage />);

    const searchInput = screen.getByPlaceholderText('Search sizes...');
    fireEvent.change(searchInput, { target: { value: '3BHK' } });

    expect(screen.getByText('3BHK Luxury')).toBeInTheDocument();
    expect(screen.queryByText('Plot 500 Yd')).not.toBeInTheDocument();
    expect(screen.queryByText('SCO Commercial')).not.toBeInTheDocument();
  });

  it('renders empty message in DataTable when no sizes match search criteria', () => {
    render(<PropertySettingsPage />);

    const searchInput = screen.getByPlaceholderText('Search sizes...');
    fireEvent.change(searchInput, { target: { value: 'NonExistentSizeXYZ' } });

    expect(screen.getByText('No sizes found matching your search.')).toBeInTheDocument();
  });

  it('renders empty message when sizes array is empty', () => {
    usePropertyConfig.mockReturnValue({
      propertyConfig: mockPropertyConfig,
      sizes: [],
      projects: [],
    });

    render(<PropertySettingsPage />);

    expect(screen.getByText('No sizes found matching your search.')).toBeInTheDocument();
  });

  it('calls deleteSize when delete button is clicked', () => {
    render(<PropertySettingsPage />);

    const deleteBtn = screen.getByRole('button', { name: 'Delete 3BHK Luxury' });
    fireEvent.click(deleteBtn);

    expect(mockDeleteSize).toHaveBeenCalledWith('sz-1');
  });

  it('opens edit modal when edit button is clicked', () => {
    render(<PropertySettingsPage />);

    const editBtn = screen.getByRole('button', { name: 'Edit 3BHK Luxury' });
    fireEvent.click(editBtn);

    expect(screen.getByRole('heading', { level: 3, name: /Edit Property Size/i })).toBeInTheDocument();
  });

  it('opens project availability modal when Projects button is clicked', () => {
    render(<PropertySettingsPage />);

    const projectsBtn = screen.getByRole('button', { name: 'Manage Project Availability for 3BHK Luxury' });
    fireEvent.click(projectsBtn);

    expect(screen.getByText(/Manage Project Availability/i)).toBeInTheDocument();
  });

  it('switches between tabs cleanly without crashing', () => {
    render(<PropertySettingsPage />);

    // Switch to Configuration tab
    fireEvent.click(screen.getByText('Configuration'));
    expect(screen.getByText('Global Configuration')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // Switch to Feedback Outcomes tab
    fireEvent.click(screen.getByText('Feedback Outcomes'));
    expect(screen.getByTestId('mock-feedback-page')).toBeInTheDocument();

    // Switch to Orientation tab
    fireEvent.click(screen.getByText('Orientation'));
    expect(screen.getByText('Orientation & Fields')).toBeInTheDocument();

    // Switch back to Sizes tab
    fireEvent.click(screen.getByText('Sizes'));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('opens Import Modal and renders CSV preview table inside DataTable when CSV is uploaded', async () => {
    render(<PropertySettingsPage />);

    const importBtn = screen.getByRole('button', { name: /Import CSV/i });
    fireEvent.click(importBtn);

    expect(screen.getByRole('heading', { level: 3, name: /Import Sizes from CSV/i })).toBeInTheDocument();

    const csvContent = 'name,unitType,category,subCategory,totalArea\nVilla 4BHK,Villa,Residential,Villas,3500\nDuplex 5BHK,Duplex,Residential,Penthouses,4500\n';
    const file = new File([csvContent], 'sizes.csv', { type: 'text/csv' });

    const fileInput = document.getElementById('sizeImportInput');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Preview \(first 2 rows\):/i)).toBeInTheDocument();
    });

    // Check DataTable rendered preview columns
    expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'unitType' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'category' })).toBeInTheDocument();
    expect(screen.getByText('Villa 4BHK')).toBeInTheDocument();
    expect(screen.getByText('Duplex 5BHK')).toBeInTheDocument();
  });
});
