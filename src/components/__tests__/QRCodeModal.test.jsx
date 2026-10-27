import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QRCodeModal from '../QRCodeModal';

describe('QRCodeModal (Design System Adoption Pilot)', () => {
  it('returns null when url is empty or absent', () => {
    const { container } = render(<QRCodeModal url="" onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal dialog with accessible title and QR code when url is provided', () => {
    const testUrl = 'https://crm.bharatproperties.co/f/feedback-token-123';
    render(<QRCodeModal url={testUrl} onClose={() => {}} />);

    const dialog = screen.getByRole('dialog', { name: /scan qr code/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(testUrl)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked or Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(<QRCodeModal url="https://example.com" onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: /close modal/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    handleClose.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
