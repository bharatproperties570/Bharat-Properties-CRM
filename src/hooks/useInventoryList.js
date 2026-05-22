import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import useDebounce from './useDebounce';

export const useInventoryList = (initialFilters = {}) => {
    const [inventoryItems, setInventoryItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalRecords, setTotalRecords] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState(''); // '' | 'Active' | 'InActive'
    const [filters, setFilters] = useState(initialFilters);
    const [sortConfig, setSortConfig] = useState({ label: 'Unit Sequence', by: 'unitNo', order: 1, icon: 'fa-sort-numeric-down' });
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [stats, setStats] = useState({ active: 0, inactive: 0, categories: [] });

    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const controllerRef = useRef(null);

    // -- Pagination Reset Logic --
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, statusFilter, filters, recordsPerPage, sortConfig]);

const fetchInventory = useCallback(async () => {
    // Abort any pending request
    if (controllerRef.current) {
        console.log('Aborting previous inventory request');
        controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    // If a search term exists but is too short, skip fetching to avoid missing data
    // Skip fetch for very short search terms (<2 chars)
    if (debouncedSearchTerm && debouncedSearchTerm.length < 2) {
        console.log('Search term too short, skipping fetch');
        setLoading(false);
        return;
    }

    setLoading(true);
    try {
        const queryParams = new URLSearchParams({
            page: currentPage,
            limit: recordsPerPage,
            search: debouncedSearchTerm,
            statusCategory: statusFilter,
            sortBy: sortConfig.by,
            sortOrder: sortConfig.order,
            ...filters
        });

        const response = await api.get(`inventory?${queryParams.toString()}`, {
            signal: controller.signal
        });

        if (response.data && response.data.success) {
            setInventoryItems(response.data.records || []);
            setTotalRecords(response.data.totalCount || 0);
            const tp = response.data.totalPages || 1;
            setTotalPages(tp > 0 ? tp : 1);
            setStats({
                active: response.data.activeCount || 0,
                inactive: response.data.inactiveCount || 0,
                categories: response.data.categoryStats || []
            });
        }
    } catch (error) {
        // Suppress abort‑related errors to avoid noisy toast notifications
        const isAbort = error.name === 'AbortError' || String(error.message).toLowerCase().includes('canceled');
        if (!isAbort) {
            console.error("Error fetching inventory:", error);
            toast.error("Error loading inventory");
        }
    } finally {
        setLoading(false);
    }
}, [currentPage, recordsPerPage, debouncedSearchTerm, statusFilter, filters, sortConfig]);

    useEffect(() => {
        fetchInventory();
    }, [fetchInventory, refreshTrigger]);

    useEffect(() => {
        const handleUpdate = () => setRefreshTrigger(prev => prev + 1);
        window.addEventListener('inventory-updated', handleUpdate);
        return () => window.removeEventListener('inventory-updated', handleUpdate);
    }, []);

    const refresh = () => setRefreshTrigger(prev => prev + 1);

    return {
        inventoryItems,
        loading,
        totalRecords,
        totalPages,
        currentPage,
        setCurrentPage,
        recordsPerPage,
        setRecordsPerPage,
        searchTerm,
        setSearchTerm,
        statusFilter,
        setStatusFilter,
        filters,
        setFilters,
        stats,
        sortConfig,
        setSortConfig,
        refresh
    };
};
