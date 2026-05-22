// src/context/ThemeContext.jsx — Enterprise 3-State Theme System
// Modes: 'light' | 'dark' | 'system'
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext();

// Apply theme to DOM — single source of truth
const applyTheme = (isDark) => {
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark-mode');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark-mode');
    root.setAttribute('data-theme', 'light');
  }
};

export const ThemeProvider = ({ children }) => {
  // mode: 'light' | 'dark' | 'system'
  const [mode, setMode] = useState(() => {
    if (typeof window === 'undefined') return 'system';
    return localStorage.getItem('themeMode') || 'system';
  });

  // Compute actual dark/light based on mode + system preference
  const getSystemDark = () =>
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const [systemDark, setSystemDark] = useState(getSystemDark);

  // Listen for OS theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Derived boolean
  const isDark = mode === 'dark' || (mode === 'system' && systemDark);

  // Apply to DOM whenever resolved theme changes
  useEffect(() => {
    applyTheme(isDark);
  }, [isDark]);

  // Cycle: system → light → dark → system
  const cycleTheme = useCallback(() => {
    setMode(prev => {
      const next = prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system';
      localStorage.setItem('themeMode', next);
      return next;
    });
  }, []);

  // Direct set (for the 3-segment control)
  const setThemeMode = useCallback((newMode) => {
    localStorage.setItem('themeMode', newMode);
    setMode(newMode);
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, mode, cycleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
