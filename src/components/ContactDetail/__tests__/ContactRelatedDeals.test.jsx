import React from 'react';
import { render, screen } from '@testing-library/react';
import ContactRelatedDeals from '../../ContactRelatedDeals';

// Minimal mock functions
const mockToggleSection = jest.fn();
const mockShowNotification = jest.fn();
const mockOnNavigate = jest.fn();
const mockRenderValue = (val, fallback = '-', prefix = '') => (val !== undefined && val !== null ? `${prefix}${val}` : fallback);
const mockRenderLookup = (val, fallback = '-') => (val !== undefined && val !== null ? val : fallback);

describe('ContactRelatedDeals Image Rendering', () => {
  test('renders placeholder image for deal without imageUrl based on subCategory', () => {
    const matchedDeals = [
      {
        _id: 'deal1',
        unitNo: 'A-101',
        matchPercentage: 85,
        projectName: 'Sunrise Plot',
        location: 'Sector 2',
        price: 5000000,
        size: { value: 1200, unit: 'sqft' },
        subCategory: 'plot', // expecting plot placeholder
        // imageUrl omitted
      },
    ];

    render(
      <ContactRelatedDeals
        contact={{}}
        recordType="lead"
        expandedSections={["matching"]}
        toggleSection={mockToggleSection}
        matchedDeals={matchedDeals}
        loadingMatches={false}
        renderValue={mockRenderValue}
        showNotification={mockShowNotification}
        activeDeals={[]}
        setIsAddDealModalOpen={jest.fn()}
        renderLookup={mockRenderLookup}
        onNavigate={mockOnNavigate}
      />
    );

    const img = screen.getByAltText('Deal');
    expect(img).toBeInTheDocument();
    // The src should contain the placeholder path for plot
    expect(img.src).toContain('/src/assets/placeholders/plot.png');
  });
});
