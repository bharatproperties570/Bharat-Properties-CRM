import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IntegrationsSettingsPage from '../IntegrationsSettingsPage';
import { marketingAPI, socialAPI, systemSettingsAPI } from '../../../../utils/api';

vi.mock('../../../../utils/api', () => ({
  googleSettingsAPI: {
    getStatus: vi.fn().mockResolvedValue({ success: true, connected: false })
  },
  systemSettingsAPI: {
    getByKey: vi.fn().mockResolvedValue({ data: { value: {} } }),
    upsert: vi.fn().mockResolvedValue({ success: true })
  },
  marketingAPI: {
    getPortalStatuses: vi.fn().mockResolvedValue({
      success: true,
      portals: [
        { id: '99acres', name: '99acres.com', connected: true, health: 'HEALTHY' },
        { id: 'magicbricks', name: 'Magicbricks', connected: false, health: 'UNCONFIGURED' }
      ]
    }),
    savePortalConfig: vi.fn().mockResolvedValue({ success: true }),
    testPortalConnection: vi.fn().mockResolvedValue({
      success: true,
      message: '✓ Connection validated for 99acres.com!'
    }),
    getWhatsAppTemplates: vi.fn().mockResolvedValue({ success: true, templates: [] }),
    getLinkedInStatus: vi.fn().mockResolvedValue({ success: true, connected: false })
  },
  socialAPI: {
    getUnifiedStatus: vi.fn().mockResolvedValue({
      success: true,
      twitter: { connected: false, health: 'DISCONNECTED' }
    }),
    saveConfig: vi.fn().mockResolvedValue({ success: true }),
    testConnection: vi.fn().mockResolvedValue({ success: true, message: '✓ Twitter / X verified!' })
  },
  BASE_BACKEND_URL: 'https://api.bharatproperties.co'
}));

vi.mock('../../../../services/smsService', () => ({
  default: {
    getProviders: vi.fn().mockResolvedValue({ data: [] }),
    updateConfig: vi.fn().mockResolvedValue({ success: true }),
    activateProvider: vi.fn().mockResolvedValue({ success: true }),
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'SMS Test OK' })
  }
}));

vi.mock('../../../../services/whatsappService', () => ({
  default: {
    getAccounts: vi.fn().mockResolvedValue({ success: true, data: [] })
  }
}));

vi.mock('../../../../services/contactSyncManager', () => ({
  default: {
    syncContacts: vi.fn(),
    getSyncStatus: vi.fn().mockReturnValue({ autoSync: true, autoEnrich: true, intervalHours: 12 }),
    updateConfig: vi.fn()
  }
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('IntegrationsSettingsPage - Property Portals & Twitter Integration Hub (Phase 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Property Portals category and all 11 Indian property portal cards', async () => {
    render(<IntegrationsSettingsPage />);

    // Verify Category Header
    expect(screen.getByText('Property Portals')).toBeInTheDocument();

    // Verify all 11 Indian portals are present
    expect(screen.getByText('99acres.com')).toBeInTheDocument();
    expect(screen.getByText('Magicbricks')).toBeInTheDocument();
    expect(screen.getByText('Housing.com')).toBeInTheDocument();
    expect(screen.getByText('CommonFloor')).toBeInTheDocument();
    expect(screen.getByText('Makaan.com')).toBeInTheDocument();
    expect(screen.getByText('OLX India')).toBeInTheDocument();
    expect(screen.getByText('Quikr Homes')).toBeInTheDocument();
    expect(screen.getByText('PropTiger')).toBeInTheDocument();
    expect(screen.getByText('Sulekha NoBroker')).toBeInTheDocument();
    expect(screen.getByText('Property Guide Online')).toBeInTheDocument();
    expect(screen.getByText('Square Yards')).toBeInTheDocument();

    // Verify BNA is NOT present in Property Portals
    expect(screen.queryByText(/BNA/i)).toBeNull();

    // Verify Social Category contains Twitter / X
    expect(screen.getByText('Twitter / X')).toBeInTheDocument();
  });

  it('reflects active connection status for configured portals', async () => {
    render(<IntegrationsSettingsPage />);

    await waitFor(() => {
      expect(marketingAPI.getPortalStatuses).toHaveBeenCalled();
    });

    // 99acres was mocked as connected: true, so it should display 'Update Settings'
    const updateButtons = screen.getAllByText('Update Settings');
    expect(updateButtons.length).toBeGreaterThan(0);
  });

  it('opens portal connection modal and saves configuration', async () => {
    render(<IntegrationsSettingsPage />);

    // Find and click Configure on Magicbricks
    const magicbricksCard = screen.getByText('Magicbricks').closest('div[style*="border-radius: 16px"]');
    const configureBtn = magicbricksCard.querySelector('button');
    fireEvent.click(configureBtn);

    // Modal title should appear
    expect(screen.getByText('Magicbricks Partner Syndication')).toBeInTheDocument();

    // Inputs for credentials
    const partnerInput = screen.getByPlaceholderText(/Partner Code/i);
    const apiKeyInput = screen.getByPlaceholderText(/Portal Secret API Key/i);

    fireEvent.change(partnerInput, { target: { value: 'MB-DELHI-9988' } });
    fireEvent.change(apiKeyInput, { target: { value: 'secret_mb_token_123' } });

    // Click Test Connection
    const testBtn = screen.getByText('Test Connection');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(marketingAPI.testPortalConnection).toHaveBeenCalledWith('magicbricks', expect.objectContaining({
        partnerId: 'MB-DELHI-9988',
        apiKey: 'secret_mb_token_123'
      }));
    });

    // Click Save Configuration
    const saveBtn = screen.getByText('Save Configuration');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(marketingAPI.savePortalConfig).toHaveBeenCalledWith('magicbricks', expect.objectContaining({
        partnerId: 'MB-DELHI-9988',
        apiKey: 'secret_mb_token_123'
      }));
    });
  });

  it('opens Twitter / X connection modal and tests connection', async () => {
    render(<IntegrationsSettingsPage />);

    // Find and click Configure on Twitter / X
    const twitterCard = screen.getByText('Twitter / X').closest('div[style*="border-radius: 16px"]');
    const configureBtn = twitterCard.querySelector('button');
    fireEvent.click(configureBtn);

    // Verify Twitter modal
    expect(screen.getByText('Twitter / X API Integration')).toBeInTheDocument();

    const apiKeyInput = screen.getByPlaceholderText('Twitter API Key');
    const apiSecretInput = screen.getByPlaceholderText('Twitter API Secret');
    const tokenInput = screen.getByPlaceholderText('OAuth Access Token');
    const tokenSecretInput = screen.getByPlaceholderText('OAuth Access Token Secret');

    fireEvent.change(apiKeyInput, { target: { value: 'mock_tw_api_key' } });
    fireEvent.change(apiSecretInput, { target: { value: 'mock_tw_api_secret' } });
    fireEvent.change(tokenInput, { target: { value: 'mock_tw_access_token' } });
    fireEvent.change(tokenSecretInput, { target: { value: 'mock_tw_token_secret' } });

    // Click Test Connection
    const testBtn = screen.getByText('Test Connection');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(socialAPI.testConnection).toHaveBeenCalledWith(expect.objectContaining({
        platform: 'twitter'
      }));
    });

    // Click Save Configuration
    const saveBtn = screen.getByText('Save Configuration');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(socialAPI.saveConfig).toHaveBeenCalledWith('twitter', expect.objectContaining({
        apiKey: 'mock_tw_api_key',
        apiSecret: 'mock_tw_api_secret',
        accessToken: 'mock_tw_access_token',
        accessTokenSecret: 'mock_tw_token_secret'
      }));
    });
  });
});
