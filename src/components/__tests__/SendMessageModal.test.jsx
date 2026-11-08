import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import SendMessageModal from '../SendMessageModal';
import smsService from '../../services/smsService';
import whatsappService from '../../services/whatsappService';
import { systemSettingsAPI } from '../../utils/api';

vi.mock('../../services/smsService', () => ({
  default: {
    getTemplates: vi.fn(),
    sendMessage: vi.fn()
  }
}));

vi.mock('../../services/whatsappService', () => ({
  default: {
    getTemplates: vi.fn(),
    getAccounts: vi.fn(),
    previewTemplate: vi.fn(),
    sendMessage: vi.fn()
  }
}));

vi.mock('../../utils/api', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn()
  },
  systemSettingsAPI: {
    getByKey: vi.fn()
  }
}));

vi.mock('../../context/TriggersContext', () => ({
  useTriggers: () => ({ fireEvent: vi.fn() })
}));

vi.mock('../../context/PropertyConfigContext', () => ({
  usePropertyConfig: () => ({
    getLookupValue: vi.fn((key, val) => val),
    lookups: {},
    projects: [],
    sizes: []
  })
}));

vi.mock('../../context/UserContext', () => ({
  useUserContext: () => ({
    currentUser: { fullName: 'Test Agent', phone: '+91 9991333570' }
  })
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn()
  }
}));

describe('SendMessageModal Channel Selection & Lifecycle Stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    smsService.getTemplates.mockResolvedValue([
      { id: 'sms_tpl_1', name: 'General SMS Intro', body: 'Hello {{Name}}' }
    ]);

    whatsappService.getTemplates.mockResolvedValue([
      { id: 'wa_tpl_1', name: 'whatsapp_welcome', status: 'APPROVED', channel: 'both', body: 'Welcome {{1}}' },
      {
        id: 'wa_media_tpl_1',
        name: 'luxury_villa_showcase',
        status: 'APPROVED',
        channel: 'both',
        headerType: 'IMAGE',
        headerMediaUrl: '/uploads/villa_banner.jpg',
        headerFileName: 'villa_banner.jpg',
        body: 'Check out this stunning villa!'
      }
    ]);

    whatsappService.getAccounts.mockResolvedValue({
      success: true,
      data: [
        { id: 'acc_wa_1', accountLabel: 'Primary WA', displayPhoneNumber: '+91 9991333570', isDefault: true, provider: 'META' }
      ]
    });

    whatsappService.previewTemplate.mockResolvedValue({
      success: true,
      resolvedBody: 'Welcome Valued Client'
    });

    systemSettingsAPI.getByKey.mockResolvedValue({
      success: true,
      data: { value: {} }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders with initial SMS channel and default SMS options', async () => {
    render(
      <SendMessageModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecipients={[{ name: 'John Doe', phone: '9876543210' }]}
      />
    );

    expect(screen.getByText('Send Message')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();

    // SMS button should be active and SMS view rendered
    expect(screen.getByText(/GSM 7-bit/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type your SMS message here/i)).toBeInTheDocument();
  });

  it('allows selecting WhatsApp channel and makes WhatsApp options visible', async () => {
    render(
      <SendMessageModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecipients={[{ name: 'Jane Doe', phone: '9876543210' }]}
      />
    );

    const waBtn = screen.getByRole('button', { name: /whatsapp/i });
    fireEvent.click(waBtn);

    // WhatsApp channel specific options must appear
    await waitFor(() => {
      expect(screen.getByText(/Send From WhatsApp Number/i)).toBeInTheDocument();
      expect(screen.getByText(/Select Template/i)).toBeInTheDocument();
      expect(screen.getByText(/Business Account/i)).toBeInTheDocument(); // Right panel preview
    });

    // "Send via App" button is visible in WhatsApp mode
    expect(screen.getByRole('button', { name: /send via app/i })).toBeInTheDocument();

    // Verify SMS specific element is no longer rendered
    expect(screen.queryByText(/GSM 7-bit/i)).not.toBeInTheDocument();
  });

  it('allows selecting RCS channel and makes RCS options visible', async () => {
    render(
      <SendMessageModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecipients={[{ name: 'Jane Doe', phone: '9876543210' }]}
      />
    );

    const rcsBtn = screen.getByRole('button', { name: /rcs/i });
    fireEvent.click(rcsBtn);

    // RCS channel specific options must appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. Exclusive Launch Offer/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Describe your offer in detail/i)).toBeInTheDocument();
      expect(screen.getByText(/Suggested Actions \(Buttons\)/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add action button/i })).toBeInTheDocument();
    });

    // Verify SMS specific element is not rendered
    expect(screen.queryByText(/GSM 7-bit/i)).not.toBeInTheDocument();
  });

  it('retains WhatsApp selection across parent re-renders with fresh prop references', async () => {
    const { rerender } = render(
      <SendMessageModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecipients={[{ name: 'Lead 1', phone: '9999999999' }]}
        initialProperties={[]}
      />
    );

    const waBtn = screen.getByRole('button', { name: /whatsapp/i });
    fireEvent.click(waBtn);

    await waitFor(() => {
      expect(screen.getByText(/Business Account/i)).toBeInTheDocument();
    });

    // Simulate parent re-render with new array references (common cause of state reset)
    rerender(
      <SendMessageModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecipients={[{ name: 'Lead 1', phone: '9999999999' }]}
        initialProperties={[]}
      />
    );

    // Channel MUST remain WhatsApp
    expect(screen.getByText(/Business Account/i)).toBeInTheDocument();
    expect(screen.queryByText(/GSM 7-bit/i)).not.toBeInTheDocument();
  });

  it('re-initializes cleanly when modal transitions from closed to open', async () => {
    const { rerender } = render(
      <SendMessageModal
        isOpen={false}
        onClose={vi.fn()}
        initialChannel="WHATSAPP"
        initialRecipients={[{ name: 'Alice', phone: '9123456789' }]}
      />
    );

    expect(screen.queryByText('Send Message')).not.toBeInTheDocument();

    // Now open modal with initialChannel = WHATSAPP
    rerender(
      <SendMessageModal
        isOpen={true}
        onClose={vi.fn()}
        initialChannel="WHATSAPP"
        initialRecipients={[{ name: 'Alice', phone: '9123456789' }]}
      />
    );

    expect(screen.getByText('Send Message')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Business Account/i)).toBeInTheDocument();
    });
  });

  it('renders Upload File and CRM Records switcher in WhatsApp mode', async () => {
    render(
      <SendMessageModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecipients={[{ name: 'Bob', phone: '9988776655' }]}
      />
    );

    const waBtn = screen.getByRole('button', { name: /whatsapp/i });
    fireEvent.click(waBtn);

    await waitFor(() => {
      expect(screen.getByText(/Attach Media \/ Documents/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /upload file/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /crm records/i })).toBeInTheDocument();
    });

    // Check WhatsApp size guidance text
    expect(screen.getByText(/Images ≤ 5MB \(JPG\/PNG\) • Videos ≤ 16MB \(MP4\) • Documents ≤ 20MB \(PDF\)/i)).toBeInTheDocument();
  });

  it('allows attaching direct media upload conforming to WhatsApp limits', async () => {
    const { api } = await import('../../utils/api');
    api.post.mockResolvedValue({
      data: {
        success: true,
        url: '/uploads/deal_villa_photo.jpg',
        filename: 'deal_villa_photo.jpg'
      }
    });

    render(
      <SendMessageModal
        isOpen={true}
        onClose={vi.fn()}
        initialRecipients={[{ name: 'Charlie', phone: '9811223344' }]}
      />
    );

    const waBtn = screen.getByRole('button', { name: /whatsapp/i });
    fireEvent.click(waBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upload file/i })).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const file = new File(['dummy image content'], 'deal_villa_photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/deal_villa_photo\.jpg/i)).toBeInTheDocument();
      expect(screen.getByText(/Attached/i)).toBeInTheDocument();
    });
  });
});
