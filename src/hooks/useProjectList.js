import { useState, useEffect } from 'react';
import useDebounce from './useDebounce';
import { useProjects } from '../utils/crmHooks';

export const useProjectList = (initialFilters = {}) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState(initialFilters);
    const [sortConfig, setSortConfig] = useState({ label: 'Recently Updated', by: 'updatedAt', order: -1, icon: 'fa-bolt' });

    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    // -- Pagination Reset Logic --
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, filters, recordsPerPage, sortConfig]);

    const queryParams = {
        page: currentPage,
        limit: recordsPerPage,
        search: debouncedSearchTerm,
        sortBy: sortConfig.by,
        sortOrder: sortConfig.order,
        ...filters
    };

    const { data: queryData, isFetching, refetch } = useProjects(queryParams);

    // Map TanStack query result to the legacy signature
    const projects = queryData?.data || [];
    const totalRecords = queryData?.totalCount || 0;
    const totalPages = Math.max(queryData?.totalPages || 1, 1);
    const loading = isFetching;

    // No-op setter to preserve structural compatibility for consumers
    // since mutation state updates are handled exclusively by TanStack.
    const setProjects = () => {};

    const refresh = () => refetch();

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
