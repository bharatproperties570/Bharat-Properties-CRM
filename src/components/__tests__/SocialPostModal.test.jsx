import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SocialPostModal from '../SocialPostModal';
import { marketingAPI, socialAPI } from '../../utils/api';

vi.mock('../../utils/api', () => ({
  marketingAPI: {
    generateSocial: vi.fn(),
    generateVisual: vi.fn(),
    broadcastToHub: vi.fn().mockResolvedValue({ success: true, results: { success: ['99acres', 'Magicbricks'] } }),
    getPortalStatuses: vi.fn().mockResolvedValue({
      success: true,
      statuses: {
        '99acres': { id: '99acres', name: '99acres.com', connected: true },
        magicbricks: { id: 'magicbricks', name: 'Magicbricks', connected: false }
      }
    })
  },
  socialAPI: {
    postContent: vi.fn().mockResolvedValue({ success: true })
  }
}));

vi.mock('react-hot-toast', () => ({
  default: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('SocialPostModal - Enterprise Promote Studio', () => {
  const mockProjectData = {
    id: 'proj-12345',
    name: 'Godrej Palm Retreat 302',
    title: 'Godrej Palm Retreat 302',
    location: 'Sector 150, Noida Expressway',
    price: '₹ 1.85 Cr',
    description: 'Ultra luxurious golf view residences',
    imageUrl: 'https://example.com/property.jpg',
    reraNumber: 'UPRERAPRJ1234',
    projectType: 'Luxury Residential',
    type: 'project'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SocialPostModal isOpen={false} onClose={() => {}} initialData={mockProjectData} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders Social Media Studio by default with platform chips and formats', () => {
    render(
      <SocialPostModal isOpen={true} onClose={() => {}} initialData={mockProjectData} />
    );

    expect(screen.getByText('Promote Studio')).toBeInTheDocument();
    expect(screen.getByText('Social Media Studio')).toBeInTheDocument();
    expect(screen.getByText('Portals & Syndication')).toBeInTheDocument();

    // Check Format Buttons
    expect(screen.getByText('Post')).toBeInTheDocument();
    expect(screen.getByText('Story')).toBeInTheDocument();
    expect(screen.getByText('Reel')).toBeInTheDocument();

    // Check Launch action button
    expect(screen.getByText(/Launch to facebook/i)).toBeInTheDocument();
  });

  it('switches to Portals & Syndication tab and shows Anti-Poaching Guard and Portals', () => {
    render(
      <SocialPostModal isOpen={true} onClose={() => {}} initialData={mockProjectData} />
    );

    // Click on Portals & Syndication tab
    const portalsTab = screen.getByText('Portals & Syndication');
    fireEvent.click(portalsTab);

    // Verify Anti-Poaching Privacy Guard header and toggles
    expect(screen.getByText('Anti-Poaching Privacy Guard')).toBeInTheDocument();
    expect(screen.getByText('SHIELD ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Mask Unit #')).toBeInTheDocument();
    expect(screen.getByText('Hide Exact Pin')).toBeInTheDocument();
    expect(screen.getByText('Price on Request')).toBeInTheDocument();

    // Verify major portal channels (11 portals, strictly NO BNA)
    expect(screen.getAllByText('99acres.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Magicbricks').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Housing.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CommonFloor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Makaan.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OLX India').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quikr Homes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PropTiger').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sulekha NoBroker').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Property Guide Online').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Square Yards').length).toBeGreaterThan(0);
    expect(screen.queryByText('BNA Broker Syndicate')).toBeNull();

    // Verify Syndication action button with 11 portals
    expect(screen.getByText(/Syndicate to Selected Portals \(11\)/i)).toBeInTheDocument();
  });

  it('provides bulk selection actions (Clear All and Select All)', () => {
    render(
      <SocialPostModal isOpen={true} onClose={() => {}} initialData={mockProjectData} />
    );

    fireEvent.click(screen.getByText('Portals & Syndication'));

    // Initially 11 selected
    expect(screen.getByText(/Syndicate to Selected Portals \(11\)/i)).toBeInTheDocument();

    // Click Clear All
    const clearBtn = screen.getByText('Clear All');
    fireEvent.click(clearBtn);

    // Now 0 selected
    expect(screen.getByText(/Syndicate to Selected Portals \(0\)/i)).toBeInTheDocument();

    // Click Select All (11)
    const selectAllBtn = screen.getByText(/Select All \(11\)/i);
    fireEvent.click(selectAllBtn);

    // Back to 11 selected
    expect(screen.getByText(/Syndicate to Selected Portals \(11\)/i)).toBeInTheDocument();
  });

  it('renders portal preview switcher and updates dynamic preview replica', () => {
    render(
      <SocialPostModal isOpen={true} onClose={() => {}} initialData={mockProjectData} />
    );

    fireEvent.click(screen.getByText('Portals & Syndication'));

    // Default preview is 99acres
    expect(screen.getAllByText(/99acres Verified Listing/i).length).toBeGreaterThan(0);

    // Click Square Yards in preview switcher
    const squareYardsBtn = screen.getByTitle('Preview on Square Yards');
    fireEvent.click(squareYardsBtn);

    // Verify dynamic replica rendered Square Yards
    expect(screen.getAllByText(/Square Yards PropTech Network/i).length).toBeGreaterThan(0);
    expect(screen.getByText('PROPINVENTORY SYNC')).toBeInTheDocument();
    expect(screen.getByText('Book Inspection')).toBeInTheDocument();
  });

  it('toggles privacy settings and reflects in preview', () => {
    render(
      <SocialPostModal isOpen={true} onClose={() => {}} initialData={mockProjectData} />
    );

    // Switch to portals tab
    fireEvent.click(screen.getByText('Portals & Syndication'));

    // By default, hideUnitNo is true, so unit # is masked
    expect(screen.getAllByText(/\[CONFIDENTIAL\]/i).length).toBeGreaterThan(0);

    // Toggle Price on Request
    const priceToggle = screen.getByText('Price on Request').closest('div');
    fireEvent.click(priceToggle);

    // Now Price on Request should be active and displayed in preview card
    expect(screen.getAllByText('Price on Request').length).toBeGreaterThan(0);
  });

  it('dispatches broadcastToHub with selected portals and privacy options when syndicate button clicked', async () => {
    render(
      <SocialPostModal isOpen={true} onClose={() => {}} initialData={mockProjectData} />
    );

    // Switch to portals tab
    fireEvent.click(screen.getByText('Portals & Syndication'));

    // Deselect Housing.com by finding its portal card
    const housingCard = screen.getByText('Housing.com', { selector: 'span' }).closest('.portal-card');
    fireEvent.click(housingCard);

    // Click Syndicate button (10 remaining)
    const syndicateBtn = screen.getByText(/Syndicate to Selected Portals \(10\)/i);
    fireEvent.click(syndicateBtn);

    await waitFor(() => {
      expect(marketingAPI.broadcastToHub).toHaveBeenCalledWith({
        id: 'proj-12345',
        type: 'project',
        platforms: {
          '99acres': true,
          magicbricks: true,
          commonfloor: true,
          makaan: true,
          olx: true,
          quikr: true,
          proptiger: true,
          sulekha: true,
          propertyguide: true,
          squareyards: true
        },
        privacy: {
          hideUnitNo: true,
          hideLocation: false,
          priceOnRequest: false
        }
      });
    });
  });

  it('validates video requirement when launching to YouTube without video', async () => {
    const toast = (await import('react-hot-toast')).default;
    render(
      <SocialPostModal isOpen={true} onClose={() => {}} initialData={mockProjectData} />
    );

    // Click on YouTube platform
    const ytButton = screen.getByText('YouTube');
    fireEvent.click(ytButton);

    // Click Launch to youtube
    const launchButton = screen.getByText(/Launch to youtube/i);
    fireEvent.click(launchButton);

    // Must warn user via toast without calling API
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('YouTube requires a video file (.mp4)'),
      expect.any(Object)
    );
    expect(socialAPI.postContent).not.toHaveBeenCalled();
  });

  it('renders 4 AI Tone selector chips and triggers multi-tone generation on click', async () => {
    marketingAPI.generateSocial.mockResolvedValueOnce({
      success: true,
      content: '💎 EXCLUSIVE LUXURY LIVING | Godrej Palm Retreat'
    });

    render(
      <SocialPostModal isOpen={true} onClose={() => {}} initialData={mockProjectData} />
    );

    // Verify all 4 tones are present
    expect(screen.getByText(/⚡ Urgent \(Hinglish\)/i)).toBeTruthy();
    expect(screen.getByText(/💎 Luxury Living/i)).toBeTruthy();
    expect(screen.getByText(/📈 Investor ROI/i)).toBeTruthy();
    expect(screen.getByText(/🎯 Short Hook/i)).toBeTruthy();

    // Click on Luxury Living tone
    fireEvent.click(screen.getByText(/💎 Luxury Living/i));

    await waitFor(() => {
      expect(marketingAPI.generateSocial).toHaveBeenCalledWith(
        'proj-12345',
        'facebook',
        'luxury',
        'post'
      );
    });
  });

  it('does not attach stale sample media when visual generation fails', async () => {
    const toast = (await import('react-hot-toast')).default;
    marketingAPI.generateVisual.mockRejectedValueOnce(new Error('No configured visual provider'));

    render(
      <SocialPostModal isOpen={true} onClose={() => {}} initialData={mockProjectData} />
    );

    fireEvent.click(screen.getByText(/Generate AI Image/i));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'No configured visual provider',
        expect.any(Object)
      );
    });
    expect(marketingAPI.generateVisual).toHaveBeenCalledWith(expect.objectContaining({
      dealId: 'proj-12345',
      type: 'image'
    }));
    expect(toast.success).not.toHaveBeenCalledWith(
      expect.stringMatching(/AI Property Image Generated|AI Drone Reel Attached/i),
      expect.anything()
    );
  });

  it('renders Visual AI & Brand Studio with Brand Kit and Visual Prompt Lab', async () => {
    render(
      <SocialPostModal isOpen={true} onClose={() => {}} initialData={mockProjectData} />
    );

    // Verify Brand Kit studio elements
    expect(screen.getByText(/Visual AI & Brand Studio/i)).toBeTruthy();
    expect(screen.getByText(/BHARAT BRAND KIT/i)).toBeTruthy();
    expect(screen.getByText(/Apply Brand Kit/i)).toBeTruthy();
    expect(screen.getByText(/Visual Prompt Lab/i)).toBeTruthy();

    // Open Visual Prompt Lab
    fireEvent.click(screen.getByText(/Visual Prompt Lab/i));
    expect(screen.getByText(/Designer Prompt Studio/i)).toBeTruthy();
    expect(screen.getByText(/APPROVED CRM PDF REFERENCE/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Load approved PDFs/i })).toBeTruthy();
  });
});
