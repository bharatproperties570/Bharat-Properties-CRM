import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

export const useInventoryDetails = (inventoryId) => {
    const [inventory, setInventory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deals, setDeals] = useState([]);
    const [matchingLeads, setMatchingLeads] = useState([]);
    const [activeLeadsCount, setActiveLeadsCount] = useState(0);
    const [similarProperties, setSimilarProperties] = useState([]);
    const [lastRefresh, setLastRefresh] = useState(new Date());

    const fetchInventoryDetails = useCallback(async () => {
        if (!inventoryId) return;
        setLoading(true);
        try {
            const invResponse = await api.get(`inventory/${inventoryId}`);
            if (invResponse.data && invResponse.data.success) {
                const inv = invResponse.data.data;
                setInventory(inv);
                if (inv.deals) setDeals(inv.deals);

                // Fetch Matching Leads
                const matchResponse = await api.get(`inventory/match?inventoryId=${inventoryId}`);
                if (matchResponse.data && matchResponse.data.success) {
                    setMatchingLeads(matchResponse.data.data || []);
                    setActiveLeadsCount(matchResponse.data.count || 0);
                }

                // Fetch Similar Properties
                const projectParam = inv.projectId?._id || inv.projectId || inv.projectName;
                if (projectParam) {
                    const similarResponse = await api.get(`inventory?project=${projectParam}&limit=10`);
                    if (similarResponse.data && similarResponse.data.success) {
                        const filtered = (similarResponse.data.records || []).filter(p => p._id !== inventoryId);
                        setSimilarProperties(filtered);
                    }
                }
                setLastRefresh(new Date());
            } else {
                toast.error("Failed to load inventory details");
            }
        } catch (error) {
            console.error("Error fetching inventory details:", error);
            toast.error("Error loading inventory details");
        } finally {
            setLoading(false);
        }
    }, [inventoryId]);

    useEffect(() => {
        fetchInventoryDetails();

        const handleRefresh = () => fetchInventoryDetails();
        window.addEventListener('inventory-updated', handleRefresh);
        window.addEventListener('deal-updated', handleRefresh);

        return () => {
            window.removeEventListener('inventory-updated', handleRefresh);
            window.removeEventListener('deal-updated', handleRefresh);
        };
    }, [inventoryId, fetchInventoryDetails]);

    return {
        inventory,
        setInventory,
        loading,
        deals,
        matchingLeads,
        activeLeadsCount,
        similarProperties,
        lastRefresh,
        refresh: fetchInventoryDetails
    };
};
