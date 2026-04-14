import { useState, useEffect, useCallback } from 'react';
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
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [stats, setStats] = useState({ active: 0, inactive: 0, categories: [] });

    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    // -- Pagination Reset Logic --
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, statusFilter, filters, recordsPerPage]);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page: currentPage,
                limit: recordsPerPage,
                search: debouncedSearchTerm,
                statusCategory: statusFilter,
                ...filters
            });

            const response = await api.get(`inventory?${queryParams.toString()}`);

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
            console.error("Error fetching inventory:", error);
            toast.error("Error loading inventory");
        } finally {
            setLoading(false);
        }
    }, [currentPage, recordsPerPage, debouncedSearchTerm, statusFilter, filters]);

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
        refresh
    };
};
