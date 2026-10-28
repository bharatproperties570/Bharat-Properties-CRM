import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmailSettingsPage from '../EmailSettingsPage';

// Mock UserContext
const mockUpdateSignatures = vi.fn().mockResolvedValue({ success: true });
vi.mock('../../../../context/UserContext', () => ({
  useUserContext: () => ({
    currentUser: {
      id: 'test_user_1',
      name: 'Agent Bharat',
      email: 'agent@bharatproperties.com',
      preferences: {
        emailSignatures: [
          { id: 'sig_1', name: 'Default Signature', type: 'simple', content: '--Real Deal', isDefault: true }
        ]
      }
    },
    updateSignatures: mockUpdateSignatures
  })
}));

// Mock APIs
vi.mock('../../../../utils/api', () => ({
  systemSettingsAPI: {
    getByKey: vi.fn().mockImplementation((key) => {
      if (key === 'google_integration') {
        return Promise.resolve({
          data: {
            value: {
              connected: true,
              email: 'agent@bharatproperties.com'
            }
          }
        });
      }
      return Promise.resolve({
        status: 'success',
        data: {
          value: {
            email: 'agent@bharatproperties.com',
            provider: 'Google',
            useOAuth: true
          }
        }
      });
    }),
    upsert: vi.fn().mockResolvedValue({ status: 'success' })
  },
  emailAPI: {
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'Connection successful!' })
  },
  googleSettingsAPI: {
    getAuthUrl: vi.fn().mockResolvedValue({ success: true, url: 'https://accounts.google.com/oauth' })
  }
}));

// Mock Toast
vi.mock('../../../../components/Toast', () => ({
  default: ({ message, type, onClose }) => (
    <div data-testid="mock-toast" data-type={type}>
      {message}
      <button onClick={onClose}>Close</button>
    </div>
  )
}));

describe('EmailSettingsPage with DataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page header and sub-tabs (Connection, Signature, Visibility, Block list, Email templates)', () => {
    render(<EmailSettingsPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Email Account/i })).toBeInTheDocument();
    expect(screen.getByText(/Connect your email and manage your templates/i)).toBeInTheDocument();

    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('Signature')).toBeInTheDocument();
    expect(screen.getByText('Visibility')).toBeInTheDocument();
    expect(screen.getByText('Block list')).toBeInTheDocument();
    expect(screen.getByText('Email templates')).toBeInTheDocument();
  });

  it('navigates to Email templates tab and renders templates inside DataTable', () => {
    render(<EmailSettingsPage />);

    // Switch to Email templates tab
    fireEvent.click(screen.getByText('Email templates'));

    expect(screen.getByRole('heading', { level: 2, name: /Email templates/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search templates...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add template/i })).toBeInTheDocument();

    // Verify DataTable column headers
    expect(screen.getByRole('columnheader', { name: /Template name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Tags/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Created by/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Sharing/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Actions/i })).toBeInTheDocument();

    // Verify populated default templates rendered in table cells
    expect(screen.getByText('Welcome & Discovery')).toBeInTheDocument();
    expect(screen.getByText('Top Matches Priority')).toBeInTheDocument();
  });

  it('filters email templates dynamically based on search input', () => {
    render(<EmailSettingsPage />);
    fireEvent.click(screen.getByText('Email templates'));

    const searchInput = screen.getByPlaceholderText('Search templates...');
    fireEvent.change(searchInput, { target: { value: 'Welcome & Discovery' } });

    expect(screen.getByText('Welcome & Discovery')).toBeInTheDocument();
    expect(screen.queryByText('Top Matches Priority')).not.toBeInTheDocument();
  });

  it('displays empty message in DataTable when search matches no templates', () => {
    render(<EmailSettingsPage />);
    fireEvent.click(screen.getByText('Email templates'));

    const searchInput = screen.getByPlaceholderText('Search templates...');
    fireEvent.change(searchInput, { target: { value: 'NonExistentTemplateXYZ' } });

    expect(screen.getByText(/No templates match "NonExistentTemplateXYZ"/i)).toBeInTheDocument();
  });

  it('opens Create template modal when Add template button is clicked', () => {
    render(<EmailSettingsPage />);
    fireEvent.click(screen.getByText('Email templates'));

    fireEvent.click(screen.getByRole('button', { name: /Add template/i }));

    expect(screen.getByRole('heading', { level: 2, name: /Create template/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Welcome Email')).toBeInTheDocument();
  });

  it('opens edit template modal when edit action button is clicked', () => {
    render(<EmailSettingsPage />);
    fireEvent.click(screen.getByText('Email templates'));

    const editBtn = screen.getByRole('button', { name: /Edit Welcome & Discovery/i });
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);

    expect(screen.getByRole('heading', { level: 2, name: /Create template/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Welcome & Discovery')).toBeInTheDocument();
  });

  it('deletes a template from the table when delete action button is clicked', () => {
    render(<EmailSettingsPage />);
    fireEvent.click(screen.getByText('Email templates'));

    expect(screen.getByText('Welcome & Discovery')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /Delete Welcome & Discovery/i });
    fireEvent.click(deleteBtn);

    expect(screen.queryByText('Welcome & Discovery')).not.toBeInTheDocument();
  });

  it('navigates to Block list tab and renders team members in DataTable', () => {
    render(<EmailSettingsPage />);

    // Switch to Block list tab
    fireEvent.click(screen.getByText('Block list'));

    expect(screen.getByText('Team Members')).toBeInTheDocument();
    expect(screen.getByText('Individual Emails')).toBeInTheDocument();

    // Verify sub-tab team members table
    fireEvent.click(screen.getByText('Team Members'));

    expect(screen.getByRole('columnheader', { name: /Name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Email/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument();

    // Verify coworker rows
    expect(screen.getByText('Ramesh')).toBeInTheDocument();
    expect(screen.getByText('ramesh@bharatproperties.com')).toBeInTheDocument();
    expect(screen.getByText('Suresh')).toBeInTheDocument();
    expect(screen.getByText('suresh@bharatproperties.com')).toBeInTheDocument();
    expect(screen.getByText('Ajitesh')).toBeInTheDocument();
    expect(screen.getByText('ajitesh@bharatproperties.com')).toBeInTheDocument();
  });

  it('switches between all tabs cleanly without crashing', () => {
    render(<EmailSettingsPage />);

    // Connection
    fireEvent.click(screen.getByText('Connection'));
    expect(screen.getByText(/Invitation Email Logo/i)).toBeInTheDocument();

    // Signature
    fireEvent.click(screen.getByText('Signature'));
    expect(screen.getByRole('heading', { level: 3, name: /Email Signatures/i })).toBeInTheDocument();

    // Visibility
    fireEvent.click(screen.getByText('Visibility'));
    expect(screen.getByText(/Changes to visibility settings will be applied/i)).toBeInTheDocument();

    // Block list
    fireEvent.click(screen.getByText('Block list'));
    expect(screen.getByText('Team Members')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Team Members'));
    expect(screen.getByText(/Coworkers are automatically blocklisted/i)).toBeInTheDocument();

    // Email templates
    fireEvent.click(screen.getByText('Email templates'));
    expect(screen.getByRole('heading', { level: 2, name: /Email templates/i })).toBeInTheDocument();
  });

  it('security audit: masks credentials and does not expose passwords in DOM or table', async () => {
    const { container } = render(<EmailSettingsPage />);

    // Wait for or trigger Add New Email modal
    const addEmailBtn = screen.queryByRole('button', { name: /Add New Email/i });
    if (addEmailBtn) {
      fireEvent.click(addEmailBtn);
    } else {
      const disconnectBtn = await screen.findByText('Disconnect Email Account');
      fireEvent.click(disconnectBtn);
      const newAddBtn = screen.getByRole('button', { name: /Add New Email/i });
      fireEvent.click(newAddBtn);
    }

    // Verify modal password field is strictly masked with type="password"
    const passwordInput = container.querySelector('input[type="password"]');
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Switch to Email templates tab
    fireEvent.click(screen.getByText('Email templates'));

    // Verify DataTable has zero secret attributes or password inputs
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(table.querySelector('input[type="password"]')).toBeNull();
    expect(table.textContent).not.toContain('supersecret');
  });
});
