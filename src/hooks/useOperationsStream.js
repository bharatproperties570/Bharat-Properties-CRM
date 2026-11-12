/**
 * useOperationsStream — SSE hook for real-time operation updates.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '../utils/api';

const API_BASE = import.meta.env.VITE_API_URL || '';
const MAX_RETRY_DELAY = 30000;

export function useOperationsStream() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const esRef = useRef(null);
  const retryRef = useRef(1000);
  const qc = useQueryClient();

  const connect = useCallback(() => {
    if (esRef.current) { try { esRef.current.close(); } catch (e) {} }

    const token = getAuthToken();
    if (!token) return;

    const url = `${API_BASE}/api/operations/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => {
      setIsConnected(true);
      retryRef.current = 1000;
    });

    es.addEventListener('OPERATION_CREATED', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLastEvent({ type: 'OPERATION_CREATED', data, ts: Date.now() });
        qc.invalidateQueries({ queryKey: ['operations', 'summary'] });
        qc.invalidateQueries({ queryKey: ['operations', 'active'] });
      } catch (err) {}
    });

    es.addEventListener('OPERATION_UPDATE', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLastEvent({ type: 'OPERATION_UPDATE', data, ts: Date.now() });
        qc.invalidateQueries({ queryKey: ['operations'] });
      } catch (err) {}
    });

    es.addEventListener('PROGRESS_UPDATE', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLastEvent({ type: 'PROGRESS_UPDATE', data, ts: Date.now() });
        // Update specific operation cache
        if (data.jobId) {
          qc.setQueryData(['operations', 'detail', data.jobId], (old) =>
            old ? { ...old, ...data } : old
          );
        }
      } catch (err) {}
    });

    es.addEventListener('ALERT', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLastEvent({ type: 'ALERT', data, ts: Date.now() });
        qc.invalidateQueries({ queryKey: ['operations', 'alerts'] });
        qc.invalidateQueries({ queryKey: ['operations', 'alertSummary'] });
      } catch (err) {}
    });

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      // Reconnect with exponential backoff
      const delay = Math.min(retryRef.current, MAX_RETRY_DELAY);
      retryRef.current = delay * 2;
      setTimeout(connect, delay);
    };
  }, [qc]);

  useEffect(() => {
    connect();
    return () => { if (esRef.current) esRef.current.close(); };
  }, [connect]);

  const reconnect = useCallback(() => {
    retryRef.current = 1000;
    connect();
  }, [connect]);

  return { isConnected, lastEvent, reconnect };
}
