import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '../Input';

describe('Input Primitive', () => {
  it('renders input with label and maintains deterministic accessible association', () => {
    const { rerender } = render(<Input label="Lead Name" placeholder="Enter name" value="" onChange={() => {}} />);

    const label = screen.getByText('Lead Name');
    const input = screen.getByPlaceholderText('Enter name');

    expect(label).toBeInTheDocument();
    expect(input).toBeInTheDocument();
    expect(label).toHaveAttribute('for', input.id);

    // Verify deterministic ID persistence across re-renders (Defect 1 regression test)
    const initialId = input.id;
    rerender(<Input label="Lead Name" placeholder="Enter name" value="Acme Corp" onChange={() => {}} />);
    expect(screen.getByPlaceholderText('Enter name').id).toBe(initialId);
  });

  it('preserves caller-supplied explicit ID when provided', () => {
    render(<Input id="custom-user-email" label="Email Address" />);

    const input = screen.getByLabelText('Email Address');
    expect(input).toHaveAttribute('id', 'custom-user-email');
  });

  it('renders textarea element when type="textarea"', () => {
    render(<Input type="textarea" label="Notes" placeholder="Add activity details" />);

    const textarea = screen.getByPlaceholderText('Add activity details');
    expect(textarea.tagName.toLowerCase()).toBe('textarea');
    expect(screen.getByLabelText('Notes')).toBe(textarea);
  });

  it('renders error message with role="alert" and binds aria-describedby and aria-invalid', () => {
    render(<Input label="Mobile" placeholder="Phone" error="Invalid phone number format" />);

    const input = screen.getByPlaceholderText('Phone');
    const errorAlert = screen.getByRole('alert');

    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent('Invalid phone number format');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', errorAlert.id);
  });

  it('handles controlled text input changes correctly', () => {
    let capturedValue = '';
    const handleChange = (e) => { capturedValue = e.target.value; };

    render(<Input label="City" onChange={handleChange} placeholder="City name" />);

    const input = screen.getByPlaceholderText('City name');
    fireEvent.change(input, { target: { value: 'Gurugram' } });
    expect(capturedValue).toBe('Gurugram');
  });
});
