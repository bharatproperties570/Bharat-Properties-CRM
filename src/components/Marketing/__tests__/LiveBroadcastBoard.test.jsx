import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LiveBroadcastBoard from '../LiveBroadcastBoard';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

vi.mock('../../../utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false })
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('LiveBroadcastBoard - Phase 4 Real-Time Telemetry & Controls', () => {
  const mockProjectId = '672b1234567890abcdef1234';
  const mockCampaign = {
    campaignId: 'camp-p4-999',
    name: 'Sector 150 VIP Launch',
    status: 'ACTIVE',
    progressPercent: 60,
    totalRecipients: 20,
    processedRecipients: 12,
    isCooldown: false,
    remainingCooldownSeconds: 0,
    isBaileys: false,
    stats: {
      sent: 10,
      delivered: 2,
      failed: 1,
      unknown: 0
    },
    auditTrail: [
      { action: 'DISPATCH_BATCH', details: 'Dispatched batch 2', timestamp: '2026-11-06T08:00:00.000Z' }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  it('renders null when no campaigns exist and liveState is empty', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/live?')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.resolve({ data: { success: true, data: null } });
    });

    const { container } = render(
      <LiveBroadcastBoard projectId={mockProjectId} />
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(`/marketing/broadcast/live?projectId=${mockProjectId}&limit=5`);
    });

    expect(container.firstChild).toBeNull();
  });

  it('queries /marketing/broadcast/live with projectId and renders live telemetry board', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/live?')) {
        return Promise.resolve({ data: { success: true, data: [mockCampaign] } });
      }
      return Promise.resolve({ data: { success: true, data: mockCampaign } });
    });

    render(<LiveBroadcastBoard projectId={mockProjectId} />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(`/marketing/broadcast/live?projectId=${mockProjectId}&limit=5`);
    });

    expect(await screen.findByText(/Live Broadcast Board \(Phase 4\)/i)).toBeInTheDocument();
    expect(screen.getByText('Sector 150 VIP Launch · Provider: Official Meta Cloud API')).toBeInTheDocument();
    expect(screen.getByText('Broadcasting In Flight')).toBeInTheDocument();
    expect(screen.getByText(/Dispatch Progress: 12 of 20 Recipients/i)).toBeInTheDocument();
    expect(screen.getByText('(60%)')).toBeInTheDocument();
  });

  it('supports Operator Pause action and updates campaign state', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/live?')) {
        return Promise.resolve({ data: { success: true, data: [mockCampaign] } });
      }
      return Promise.resolve({ data: { success: true, data: mockCampaign } });
    });
    api.post.mockResolvedValueOnce({ data: { success: true } });

    render(<LiveBroadcastBoard projectId={mockProjectId} />);

    await screen.findByText(/Live Broadcast Board \(Phase 4\)/i);

    const pauseBtn = screen.getByRole('button', { name: /pause/i });
    fireEvent.click(pauseBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        `/marketing/broadcast/${mockCampaign.campaignId}/pause`,
        expect.objectContaining({ reason: expect.any(String) })
      );
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('paused'));
  });

  it('supports Operator Resume action when campaign is paused', async () => {
    const pausedCampaign = { ...mockCampaign, status: 'PAUSED' };
    api.get.mockImplementation((url) => {
      if (url.includes('/live?')) {
        return Promise.resolve({ data: { success: true, data: [pausedCampaign] } });
      }
      return Promise.resolve({ data: { success: true, data: pausedCampaign } });
    });
    api.post.mockResolvedValueOnce({ data: { success: true } });

    render(<LiveBroadcastBoard projectId={mockProjectId} />);

    await screen.findByText(/Live Broadcast Board \(Phase 4\)/i);

    const resumeBtn = screen.getByRole('button', { name: /resume/i });
    fireEvent.click(resumeBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        `/marketing/broadcast/${pausedCampaign.campaignId}/resume`,
        expect.objectContaining({ reason: expect.any(String) })
      );
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('resumed'));
  });

  it('supports Retry Failed recipients when retryable errors exist', async () => {
    const failedCampaign = {
      ...mockCampaign,
      status: 'COMPLETED',
      stats: { sent: 15, failed: 5, unknown: 0 }
    };

    api.get.mockImplementation((url) => {
      if (url.includes('/live?')) {
        return Promise.resolve({ data: { success: true, data: [failedCampaign] } });
      }
      return Promise.resolve({ data: { success: true, data: failedCampaign } });
    });

    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        retryCampaignId: 'camp-retry-101',
        retryRecipientCount: 5
      }
    });

    render(<LiveBroadcastBoard projectId={mockProjectId} />);

    await screen.findByText(/Live Broadcast Board \(Phase 4\)/i);

    const retryBtn = screen.getByRole('button', { name: /retry failed/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        `/marketing/broadcast/${failedCampaign.campaignId}/retry-failed`
      );
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('5 recipients'));
  });
});
