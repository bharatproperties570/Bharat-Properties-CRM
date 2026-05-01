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
                
                // Release UI first
                setLoading(false);

                // Fetch Matching Leads in Background
                api.get(`inventory/match?inventoryId=${inventoryId}`).then(matchResponse => {
                    if (matchResponse.data && matchResponse.data.success) {
                        setMatchingLeads(matchResponse.data.data || []);
                        setActiveLeadsCount(matchResponse.data.count || 0);
                    }
                }).catch(err => console.error("Matches fetch error:", err));

                // Fetch Similar Properties in Background
                const projectParam = inv.projectId?._id || inv.projectId || inv.projectName;
                if (projectParam) {
                    api.get(`inventory?project=${projectParam}&limit=10`).then(similarResponse => {
                        if (similarResponse.data && similarResponse.data.success) {
                            const filtered = (similarResponse.data.records || []).filter(p => p._id !== inventoryId);
                            setSimilarProperties(filtered);
                        }
                    }).catch(err => console.error("Similar properties fetch error:", err));
                }
                setLastRefresh(new Date());
            } else {
                toast.error("Failed to load inventory details");
                setLoading(false);
            }
        } catch (error) {
            console.error("Error fetching inventory details:", error);
            toast.error("Error loading inventory details");
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
