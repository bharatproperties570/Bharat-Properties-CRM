// ThemeToggle.jsx — Enterprise 3-Segment Theme Control
// Light | System | Dark — no dropdown, animated pill
import React from 'react';
import { useTheme } from '../context/ThemeContext';
import './ThemeToggle.css';

/* Inline SVG icons — no font dependency */
const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const SystemIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

const SEGMENTS = [
  { mode: 'light',  Icon: SunIcon,    tip: 'Light'  },
  { mode: 'system', Icon: SystemIcon, tip: 'System' },
  { mode: 'dark',   Icon: MoonIcon,   tip: 'Dark'   },
];

export default function ThemeToggle() {
  const { mode, setThemeMode } = useTheme();

  return (
    <div
      className="theme-toggle"
      data-mode={mode}
      role="group"
      aria-label="Theme selector"
    >
      {/* Animated sliding indicator */}
      <span className="theme-toggle__indicator" aria-hidden="true" />

      {SEGMENTS.map(({ mode: m, Icon, tip }) => (
        <button
          key={m}
          className={`theme-toggle__btn${mode === m ? ' active' : ''}`}
          onClick={() => setThemeMode(m)}
          aria-pressed={mode === m}
          aria-label={`${tip} mode`}
          data-tip={tip}
          type="button"
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
