import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import useDebounce from './useDebounce';

export const useProjectList = (initialFilters = {}) => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalRecords, setTotalRecords] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState(initialFilters);
    const [sortConfig, setSortConfig] = useState({ label: 'Recently Updated', by: 'updatedAt', order: -1, icon: 'fa-bolt' });
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    // -- Pagination Reset Logic --
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, filters, recordsPerPage, sortConfig]);

    const fetchProjects = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page: currentPage,
                limit: recordsPerPage,
                search: debouncedSearchTerm,
                sortBy: sortConfig.by,
                sortOrder: sortConfig.order,
                ...filters
            });

            const response = await api.get(`projects?${queryParams.toString()}`);

            if (response.data && response.data.success) {
                setProjects(response.data.data || []);
                setTotalRecords(response.data.totalCount || 0);
                const tp = response.data.totalPages || 1;
                setTotalPages(tp > 0 ? tp : 1);
            }
        } catch (error) {
            console.error("Error fetching projects:", error);
            toast.error("Error loading projects");
        } finally {
            setLoading(false);
        }
    }, [currentPage, recordsPerPage, debouncedSearchTerm, filters, sortConfig]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects, refreshTrigger]);

    const refresh = () => setRefreshTrigger(prev => prev + 1);

    return {
        projects,
        loading,
        totalRecords,
        totalPages,
        currentPage,
        setCurrentPage,
        recordsPerPage,
        setRecordsPerPage,
        searchTerm,
        setSearchTerm,
        filters,
        setFilters,
        sortConfig,
        setSortConfig,
        setProjects,
        refresh
    };
};
