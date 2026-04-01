import { useState, useEffect } from 'react';

/**
 * useDebounce Hook
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default 500ms)
 * @returns The debounced value
 */
export const useDebounce = (value, delay = 500) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
};

export default useDebounce;
