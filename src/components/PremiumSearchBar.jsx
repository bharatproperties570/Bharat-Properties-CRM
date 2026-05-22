// src/components/PremiumSearchBar.jsx
// ✨ Enterprise‑grade search bar with glassmorphism, dark‑mode, and subtle animations.
// Re‑usable component used across list views (Contacts, Leads, etc.).

import React from 'react';
import './PremiumSearchBar.css'; // Styles are scoped to this component.

/**
 * Props:
 *  - value: current input value
 *  - onChange: handler for input change
 *  - placeholder: input placeholder text
 *  - className (optional): additional class names
 */
export default function PremiumSearchBar({ value, onChange, placeholder = 'Search…', className = '', loading = false }) {
  return (
    <div className={`premium-search-bar ${className}`}>
      <input
        type="text"
        className="search-input-premium"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-label="Search"
      />
      {/* Clear button appears when there is input */}
      {value && (
        <button
          type="button"
          className="search-clear-btn"
          aria-label="Clear search"
          onClick={() => onChange({ target: { value: '' } })}
        >
          <i className="fas fa-times" />
        </button>
      )}
      {/* Loading spinner when fetching data */}
      {loading && <div className="search-spinner" title="Loading..." />}
      <i
        className={`fas fa-search search-icon-premium ${value ? 'active' : ''}`}
      ></i>
    </div>
  );
}
