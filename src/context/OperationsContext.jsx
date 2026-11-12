/**
 * OperationsContext — Global operations state for header & drawer.
 */
import React, { createContext, useContext } from 'react';
import { useOperationsSummary, useActiveOperations, useAlertSummary } from '../hooks/useOperations';
import { useOperationsStream } from '../hooks/useOperationsStream';

const OperationsContext = createContext({
  summary: null,
  activeOps: [],
  alertSummary: null,
  isConnected: false,
  lastEvent: null,
  isLoading: true,
});

export function OperationsProvider({ children }) {
  const { data: summary, isLoading: summaryLoading } = useOperationsSummary();
  const { data: activeOps, isLoading: activeLoading } = useActiveOperations();
  const { data: alertSummary } = useAlertSummary();
  const { isConnected, lastEvent, reconnect } = useOperationsStream();

  const value = {
    summary: summary || { active: 0, queued: 0, completed: 0, failed: 0, attention: 0, total: 0 },
    activeOps: activeOps || [],
    alertSummary: alertSummary || { info: 0, warning: 0, error: 0, critical: 0, total: 0 },
    isConnected,
    lastEvent,
    reconnect,
    isLoading: summaryLoading || activeLoading,
  };

  return (
    <OperationsContext.Provider value={value}>
      {children}
    </OperationsContext.Provider>
  );
}

export function useOperationsContext() {
  return useContext(OperationsContext);
}
