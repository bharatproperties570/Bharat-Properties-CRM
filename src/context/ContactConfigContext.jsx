import React, { createContext, useState, useContext, useEffect } from 'react';
import { api } from '../utils/api';

const ContactConfigContext = createContext();

export const useContactConfig = () => {
    const context = useContext(ContactConfigContext);
    if (!context) {
        throw new Error('useContactConfig must be used within a ContactConfigProvider');
    }
    return context;
};

export const ContactConfigProvider = ({ children }) => {
    const [professionalConfig, setProfessionalConfig] = useState({});
    const [addressConfig, setAddressConfig] = useState({});
    const [profileConfig, setProfileConfig] = useState({});
    const [documentConfig, setDocumentConfig] = useState({});
    const [loading, setLoading] = useState(true);

    const fetchLookups = async () => {
        try {
            setLoading(true);

            const [profRes, addrRes, profiRes, docCatRes, docTypeRes] = await Promise.all([
                api.get('/lookups', { params: { lookup_type: 'Professional' } }),
                api.get('/lookups', { params: { lookup_type: 'Address' } }),
                api.get('/lookups', { params: { lookup_type: 'Profile' } }),
                api.get('/lookups', { params: { lookup_type: 'Document-Category' } }),
                api.get('/lookups', { params: { lookup_type: 'Document-Type' } })
            ]);

            if (profRes.data && profRes.data.status === 'success') {
                setProfessionalConfig(buildHierarchy(profRes.data.data, 'Professional'));
            }
            if (addrRes.data && addrRes.data.status === 'success') {
                setAddressConfig(buildHierarchy(addrRes.data.data, 'Address'));
            }
            if (profiRes.data && profiRes.data.status === 'success') {
                setProfileConfig(buildHierarchy(profiRes.data.data, 'Profile'));
            }

            // Combine Document-Category and Document-Type for hierarchy
            const combinedDocs = [
                ...(docCatRes?.data?.data || []),
                ...(docTypeRes?.data?.data || [])
            ];
            setDocumentConfig(buildDocHierarchy(combinedDocs));

        } catch (error) {
            console.error("Failed to fetch lookups", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLookups();
    }, []);

    const buildHierarchy = (flatList, rootType) => {
        const rootItems = flatList.filter(item => item.lookup_type === rootType && !item.parent_lookup_value);
        const hierarchy = {};

        // Recursive function to find children
        const findChildren = (parentValue) => {
            const children = flatList.filter(item => item.lookup_type === rootType && item.parent_lookup_value === parentValue);
            if (children.length === 0) return null;

            return children.map(child => {
                const subChildren = findChildren(child.lookup_value);
                const node = {
                    name: child.lookup_value,
                    id: child._id,
                    lookup_type: child.lookup_type,
                    parent_lookup_value: child.parent_lookup_value
                };

                if (subChildren) {
                    node.subCategories = subChildren;
                }
                return node;
            });
        };

        rootItems.forEach(item => {
            const children = findChildren(item.lookup_value);
            hierarchy[item.lookup_value] = {
                id: item._id, // Capture ID for root items
                lookup_type: item.lookup_type,
                parent_lookup_value: item.parent_lookup_value,
                subCategories: children || []
            };
        });

        return hierarchy;
    };

    const buildDocHierarchy = (flatList) => {
        const categories = flatList.filter(item => item.lookup_type === 'Document-Category');
        const hierarchy = {};

        categories.forEach(cat => {
            const types = flatList.filter(item =>
                item.lookup_type === 'Document-Type' &&
                (item.parent_lookup_id === cat._id || item.parent_lookup_id?._id === cat._id)
            );

            hierarchy[cat.lookup_value] = {
                id: cat._id,
                name: cat.lookup_value,
                subCategories: types.map(t => ({
                    id: t._id,
                    name: t.lookup_value
                }))
            };
        });

        return hierarchy;
    };


    const addLookup = async (type, value, parentValue) => {
        try {
            await api.post('/lookups', {
                lookup_type: type,
                lookup_value: value,
                parent_lookup_value: parentValue
            });
            await fetchLookups(); // Refresh
            return true;
        } catch (error) {
            console.error("Failed to add lookup", error);
            return false;
        }
    };

    const updateLookup = async (id, value, type, parentValue) => {
        try {
            // Backend uses SaveLookup for update if lookup_id is present
            await api.put(`/lookups/${id}`, {
                lookup_value: value,
                lookup_type: type,
                parent_lookup_value: parentValue
            });
            await fetchLookups(); // Refresh
            return true;
        } catch (error) {
            console.error("Failed to update lookup", error);
            return false;
        }
    };

    const deleteLookup = async (id) => {
        try {
            // Using params object for cleaner query string construction
            await api.delete(`/lookups/${id}`);
            await fetchLookups(); // Refresh
            return true;
        } catch (error) {
            console.error("Failed to delete lookup", error);
            return false;
        }
    };

    return (
        <ContactConfigContext.Provider value={{
            professionalConfig,
            addressConfig,
            profileConfig,
            documentConfig,
            loading,
            addLookup,
            updateLookup,
            deleteLookup
        }}>
            {children}
        </ContactConfigContext.Provider>
    );
};
