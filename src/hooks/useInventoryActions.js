import { useState, useCallback } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

export const useInventoryActions = (inventory, setInventory, onNavigate, onAddDeal) => {
    const [isCopying, setIsCopying] = useState(false);

    const handleWhatsAppShare = useCallback(() => {
        if (!inventory) return;
        const text = `*Property Listing:* ${inventory.unitNo}\n*Project:* ${inventory.projectName}\n*Block:* ${inventory.block}\n*Type:* ${inventory.category} (${inventory.subCategory})\n*Size:* ${inventory.size?.value || inventory.size} ${inventory.sizeUnit}\n*Locality:* ${inventory.address?.locality || inventory.address?.area}\n*Price:* ${inventory.price?.value || inventory.price || 'Ask for Price'}\n\nInterested? Let me know!`;
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    }, [inventory]);

    const handleCopyDetails = useCallback(() => {
        if (!inventory) return;
        const text = `Property: ${inventory.unitNo} | Project: ${inventory.projectName} | Block: ${inventory.block} | Type: ${inventory.category} | Size: ${inventory.size?.value || inventory.size} ${inventory.sizeUnit} | Locality: ${inventory.address?.locality || inventory.address?.area}`;
        navigator.clipboard.writeText(text);
        setIsCopying(true);
        toast.success("Listing details copied to clipboard!");
        setTimeout(() => setIsCopying(false), 2000);
    }, [inventory]);

    const handleCreateDeal = useCallback((type) => {
        if (!inventory || !onAddDeal) return;
        const intentValue = type === 'Lease' ? 'Lease' : (type === 'Rent' ? 'Rent' : 'Sell');
        onAddDeal({
            ...inventory,
            inventoryId: inventory._id,
            intent: intentValue,
            owner: inventory.owners?.[0] || {
                name: inventory.ownerName,
                phone: inventory.ownerPhone,
                email: inventory.ownerEmail
            },
            associatedContact: inventory.associates?.[0]?.contact || inventory.associatedContact
        });
    }, [inventory, onAddDeal]);

    const handleToggleIntent = useCallback(async (type) => {
        if (!inventory) return;
        try {
            const currentIntents = Array.isArray(inventory.intent)
                ? inventory.intent.map(i => (i && typeof i === 'object' ? i.lookup_value : i))
                : [inventory.intent && typeof inventory.intent === 'object' ? inventory.intent.lookup_value : inventory.intent].filter(Boolean);

            let newIntents = currentIntents.includes(type)
                ? currentIntents.filter(i => i !== type)
                : [...currentIntents, type];

            const response = await api.put(`inventory/${inventory._id}`, { intent: newIntents });
            if (response.data && response.data.success) {
                setInventory(response.data.data);
                toast.success(`${type} transaction type ${currentIntents.includes(type) ? 'disabled' : 'enabled'}`);
                window.dispatchEvent(new CustomEvent('inventory-updated'));
            }
        } catch (error) {
            console.error("Error toggling intent:", error);
            toast.error("Failed to update transaction type");
        }
    }, [inventory, setInventory]);

    const updateInventoryField = useCallback(async (fieldName, value) => {
        if (!inventory) return;
        try {
            const response = await api.put(`inventory/${inventory._id}`, { [fieldName]: value });
            if (response.data && response.data.success) {
                setInventory(response.data.data);
                toast.success('Inventory updated');
                window.dispatchEvent(new CustomEvent('inventory-updated'));
            }
        } catch (error) {
            console.error(`Error updating ${fieldName}:`, error);
            toast.error('Update failed');
        }
    }, [inventory, setInventory]);

    return {
        isCopying,
        handleWhatsAppShare,
        handleCopyDetails,
        handleCreateDeal,
        handleToggleIntent,
        updateInventoryField
    };
};
