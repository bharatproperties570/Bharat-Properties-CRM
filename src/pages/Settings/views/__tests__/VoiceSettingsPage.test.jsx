import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VoiceSettingsPage from '../VoiceSettingsPage';

// Mock API dependencies
const mockGetAnalytics = vi.fn();
const mockGetVoiceConfig = vi.fn();

vi.mock('../../../../utils/api', () => ({
  systemSettingsAPI: {
    getByKey: vi.fn().mockResolvedValue({ status: 'success', data: { value: {} } }),
    upsert: vi.fn().mockResolvedValue({ status: 'success' })
  },
  jarvisAPI: {
    getAnalytics: (...args) => mockGetAnalytics(...args),
    getVoiceConfig: (...args) => mockGetVoiceConfig(...args),
    saveVoiceConfig: vi.fn().mockResolvedValue({ success: true })
  }
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('VoiceSettingsPage with DataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetVoiceConfig.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        voice: 'Charon',
        style: 'warm Indian real estate advisor',
        speed: 1.0,
        provider: 'gemini',
        wakeAlias: 'JARVIS'
      }
    });

    mockGetAnalytics.mockResolvedValue({
      success: true,
      totalCommands: 142,
      voiceCommands: 98,
      textCommands: 44,
      successRate: 97,
      avgLatencyMs: 1240,
      recentCommands: [
        {
          _id: 'cmd_1',
          createdAt: '2026-10-28T10:00:00Z',
          userId: { name: 'Vikram Mehta' },
          transcript: 'Show me available 3BHK flats in DLF Phase 5',
          intent: 'search_inventory',
          llmLatencyMs: 1120,
          status: 'executed'
        },
        {
          _id: 'cmd_2',
          createdAt: '2026-10-28T10:05:00Z',
          userId: { name: 'Priya Sharma' },
          transcript: 'Schedule follow up with Rahul Kumar tomorrow at 4 PM',
          intent: 'schedule_activity',
          llmLatencyMs: 1350,
          status: 'executed'
        }
      ]
    });
  });

  it('renders page header and tabs (JARVIS Voice OS, Connection, Call Outcomes, Scripts, etc.)', () => {
    render(<VoiceSettingsPage />);
    expect(screen.getByRole('heading', { level: 2, name: /Calls & Voice Settings/i })).toBeInTheDocument();
    expect(screen.getByText(/Manage JARVIS Voice OS, team telephony, and call intelligence settings/i)).toBeInTheDocument();

    expect(screen.getByText(/⚡ JARVIS Voice OS/i)).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('Call Outcomes')).toBeInTheDocument();
    expect(screen.getByText('Scripts')).toBeInTheDocument();
  });

  it('switches to JARVIS Voice OS tab and renders recent commands in DataTable with 6 semantic columns', async () => {
    render(<VoiceSettingsPage />);

    // Switch to JARVIS Voice OS tab
    fireEvent.click(screen.getByText(/⚡ JARVIS Voice OS/i));

    // Wait for analytics data to populate
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: /Recent Jarvis Voice Commands/i })).toBeInTheDocument();
    });

    // Check DataTable headers
    expect(screen.getByRole('columnheader', { name: /Timestamp/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /User/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Transcript/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Intent/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Latency/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument();

    // Check command row contents
    expect(screen.getByText(/Show me available 3BHK flats in DLF Phase 5/i)).toBeInTheDocument();
    expect(screen.getByText('Vikram Mehta')).toBeInTheDocument();
    expect(screen.getByText('search_inventory')).toBeInTheDocument();
    expect(screen.getByText('1120ms')).toBeInTheDocument();

    expect(screen.getByText(/Schedule follow up with Rahul Kumar/i)).toBeInTheDocument();
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('schedule_activity')).toBeInTheDocument();
  });

  it('renders empty message in DataTable when no voice commands exist', async () => {
    mockGetAnalytics.mockResolvedValueOnce({
      success: true,
      totalCommands: 0,
      voiceCommands: 0,
      textCommands: 0,
      successRate: 100,
      avgLatencyMs: 0,
      recentCommands: []
    });

    render(<VoiceSettingsPage />);
    fireEvent.click(screen.getByText(/⚡ JARVIS Voice OS/i));

    await waitFor(() => {
      expect(screen.getByText('No voice commands recorded yet.')).toBeInTheDocument();
    });
  });

  it('clicking Refresh triggers jarvisAPI.getAnalytics and reloads table data', async () => {
    render(<VoiceSettingsPage />);
    fireEvent.click(screen.getByText(/⚡ JARVIS Voice OS/i));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    });

    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    expect(mockGetAnalytics).toHaveBeenCalledTimes(2);
  });

  it('switches between multiple voice settings tabs cleanly without crashing', () => {
    render(<VoiceSettingsPage />);

    // Connection tab
    fireEvent.click(screen.getByText('Connection'));
    expect(screen.getByText(/Virtual Number/i)).toBeInTheDocument();

    // Call Outcomes tab
    fireEvent.click(screen.getByText('Call Outcomes'));
    expect(screen.getByRole('button', { name: /\+ Add Call Outcome/i })).toBeInTheDocument();

    // Scripts tab
    fireEvent.click(screen.getByText('Scripts'));
    expect(screen.getByRole('button', { name: /\+ Add call script/i })).toBeInTheDocument();

    // Visibility tab
    fireEvent.click(screen.getByText('Visibility'));
    expect(screen.getByText(/Changes to visibility settings will be applied/i)).toBeInTheDocument();

    // Block list tab
    fireEvent.click(screen.getByText('Block list'));
    expect(screen.getByText(/Block Numbers/i)).toBeInTheDocument();
  });

  it('security audit: table renders zero credentials, passwords, or secret tokens', async () => {
    render(<VoiceSettingsPage />);
    fireEvent.click(screen.getByText(/⚡ JARVIS Voice OS/i));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    const table = screen.getByRole('table');
    expect(table.querySelector('input[type="password"]')).toBeNull();
    expect(table.textContent).not.toContain('supersecret');
    expect(table.textContent).not.toContain('auth_token');
  });
});
