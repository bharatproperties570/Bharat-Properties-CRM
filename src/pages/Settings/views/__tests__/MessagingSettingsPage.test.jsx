import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MessagingSettingsPage from '../MessagingSettingsPage';

// Mock crmHooks
vi.mock('../../../../utils/crmHooks', () => ({
  useWhatsAppTemplatesDb: () => ({ data: [] }),
  useSaveWhatsAppTemplatesMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ success: true }) }),
  useSubmitWhatsAppTemplateMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ success: true }) }),
  useSyncWhatsAppTemplatesCommand: () => ({ mutateAsync: vi.fn().mockResolvedValue({ success: true }) }),
}));

// Mock APIs
vi.mock('../../../../utils/api', () => ({
  systemSettingsAPI: {
    getByKey: vi.fn().mockResolvedValue({ status: 'success', data: { value: [] } }),
    upsert: vi.fn().mockResolvedValue({ status: 'success' })
  }
}));

// Mock smsService
vi.mock('../../../../services/smsService', () => ({
  default: {
    getTemplates: vi.fn().mockResolvedValue({ success: true, data: [] }),
    deleteTemplate: vi.fn().mockResolvedValue({ success: true }),
    saveTemplate: vi.fn().mockResolvedValue({ success: true })
  }
}));

// Mock whatsappService
vi.mock('../../../../services/whatsappService', () => ({
  default: {
    getTemplates: vi.fn().mockResolvedValue({ success: true, data: [] })
  }
}));

// Mock Sweetalert2
vi.mock('sweetalert2', () => ({
  default: {
    fire: vi.fn().mockResolvedValue({ isConfirmed: true })
  }
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn()
  }
}));

const renderWithQueryClient = (ui) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

describe('MessagingSettingsPage with DataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Messaging Settings header and tab navigation', () => {
    renderWithQueryClient(<MessagingSettingsPage />);

    expect(screen.getByText(/Messaging Settings/i)).toBeInTheDocument();
    expect(screen.getByText(/Manage SMS, WhatsApp, and social media integration settings/i)).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('Variables')).toBeInTheDocument();
    expect(screen.getByText('Block list')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
  });

  it('renders Templates table with DataTable semantic structure and headers', () => {
    const { container } = renderWithQueryClient(<MessagingSettingsPage />);

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(table.querySelector('thead')).toBeInTheDocument();
    expect(table.querySelector('tbody')).toBeInTheDocument();

    expect(screen.getByRole('columnheader', { name: /Template name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Channel/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Dated/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Tags/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Created by/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Sharing/i })).toBeInTheDocument();
  });

  it('switches channel filter between SMS, Whatsapp, and RCS cleanly', () => {
    renderWithQueryClient(<MessagingSettingsPage />);

    const smsButton = screen.getByRole('button', { name: /^SMS$/i });
    fireEvent.click(smsButton);

    const rcsButton = screen.getByRole('button', { name: /^RCS$/i });
    fireEvent.click(rcsButton);

    const waButton = screen.getByRole('button', { name: /^Whatsapp$/i });
    fireEvent.click(waButton);

    expect(screen.getByText(/Sync from Meta/i)).toBeInTheDocument();
  });

  it('switches to Variables tab and renders VariableRegistryTab with 4 DataTable columns', () => {
    const { container } = renderWithQueryClient(<MessagingSettingsPage />);

    const variablesTab = screen.getByText('Variables');
    fireEvent.click(variablesTab);

    expect(screen.getByText(/Supported Template Variables/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search variables by syntax/i)).toBeInTheDocument();

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();

    expect(screen.getByRole('columnheader', { name: /Variable Syntax/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Description & Data Source/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Sample Data/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Context/i })).toBeInTheDocument();
  });

  it('filters variables via category pills in VariableRegistryTab DataTable', () => {
    renderWithQueryClient(<MessagingSettingsPage />);

    fireEvent.click(screen.getByText('Variables'));

    const dealPill = screen.getByRole('button', { name: /Deal & Transaction/i });
    fireEvent.click(dealPill);

    const badges = screen.getAllByText(/Deal \/ Transaction/i);
    expect(badges.length).toBeGreaterThan(0);
  });

  it('filters variables via search query and renders empty state fallback when no match', () => {
    renderWithQueryClient(<MessagingSettingsPage />);

    fireEvent.click(screen.getByText('Variables'));

    const searchInput = screen.getByPlaceholderText(/Search variables by syntax/i);
    fireEvent.change(searchInput, { target: { value: 'non_existent_var_xyz123' } });

    expect(screen.getByText(/No variables found matching/i)).toBeInTheDocument();

    const clearButton = screen.getByRole('button', { name: /Clear Search & Filters/i });
    fireEvent.click(clearButton);

    expect(searchInput.value).toBe('');
  });

  it('security audit: table renders zero credentials, API keys, or raw tokens', () => {
    const { container } = renderWithQueryClient(<MessagingSettingsPage />);

    const html = container.innerHTML;
    expect(html).not.toMatch(/api[_-]?secret/i);
    expect(html).not.toMatch(/access[_-]?token/i);
    expect(html).not.toMatch(/private[_-]?key/i);
    expect(html).not.toMatch(/mongodb(\+srv)?:\/\//i);
  });
});
