import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MarketingOverviewPage from '../MarketingOverviewPage';

// Mock contexts and external hooks
vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ isDark: true, theme: 'dark' })
}));

vi.mock('../../../context/PropertyConfigContext', () => ({
  usePropertyConfig: () => ({
    projects: [{ id: 'p1', name: 'Bharat Heights' }],
    propertyConfig: {},
    sizes: []
  })
}));

vi.mock('../../../utils/crmHooks', () => ({
  useUsers: () => ({ data: [{ id: 'u1', name: 'Suraj' }] })
}));

vi.mock('../../../utils/api', () => ({
  marketingAPI: {
    getStats: vi.fn().mockResolvedValue({ success: true, data: {} }),
    getContent: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getCampaignHistory: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getScheduled: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getAnalyticsOverview: vi.fn().mockResolvedValue({
      success: true,
      overview: {
        funnel: {},
        sourceAttribution: { categories: {} },
        dripAnalytics: {},
        weeklyVelocity: { days: [] },
        topAssets: [],
        topProspects: [],
        optimization: { kpis: {}, recommendations: [] }
      }
    }),
    getWhatsAppTemplates: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getSmsTemplates: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getPortalStatuses: vi.fn().mockResolvedValue({ success: true, portals: [] }),
    getOmnichannelTelemetry: vi.fn().mockResolvedValue({
      success: true,
      telemetry: {
        kpis: { totalReach: 13421, totalGroups: 278, broadcastReadyGroups: 278, activeScanningCursors: 175, activeChannelsCount: 6 },
        channels: [],
        groups: [{ groupJid: '123@g.us', subject: 'Kurukshetra property', participantCount: 32, canSend: true }],
        intakeIntelligence: { activeCursorsCount: 175, recentScannedInquiries: [] },
        brokers: []
      }
    }),
    getLinkedInStatus: vi.fn().mockResolvedValue({ success: true, connected: false }),
    getAutopilotConfig: vi.fn().mockResolvedValue({ success: true, config: {} })
  },
  leadsAPI: {
    getAll: vi.fn().mockResolvedValue({ success: true, data: [] })
  },
  dealsAPI: {
    getAll: vi.fn().mockResolvedValue({ success: true, data: [] })
  },
  googleSettingsAPI: {
    getStatus: vi.fn().mockResolvedValue({ success: true, connected: false })
  },
  emailAPI: {},
  aiAgentsAPI: {
    getAll: vi.fn().mockResolvedValue({ success: true, agents: [] })
  },
  enrichmentAPI: {},
  socialAPI: {
    getUnifiedStatus: vi.fn().mockResolvedValue({ success: true, data: {} })
  },
  systemSettingsAPI: {
    getByKey: vi.fn().mockResolvedValue({ success: true, data: {} }),
    getSetting: vi.fn().mockResolvedValue({ success: true, data: {} })
  },
  lookupsAPI: {
    getByType: vi.fn().mockResolvedValue({ success: true, data: [] })
  },
  usersAPI: {},
  projectsAPI: {},
  api: {
    get: vi.fn().mockResolvedValue({ success: true, data: [] }),
    post: vi.fn().mockResolvedValue({ success: true, data: {} })
  }
}));

vi.mock('../../../services/smsService', () => ({
  default: {
    getStatus: vi.fn().mockResolvedValue({ success: true, data: {} })
  }
}));

describe('MarketingOverviewPage Tabs Stability', () => {
  it('renders and switches between all tabs without error', async () => {
    const { container } = render(
      <BrowserRouter>
        <MarketingOverviewPage onNavigate={() => {}} />
      </BrowserRouter>
    );

    const navItems = container.querySelectorAll('.nav-item');
    expect(navItems.length).toBeGreaterThan(0);

    for (const item of navItems) {
      await act(async () => {
        fireEvent.click(item);
      });
      expect(container).toBeTruthy();
    }
  });
});
