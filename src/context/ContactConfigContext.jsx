import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { api, safeStorage } from '../utils/api';
import { useLookups, useLookupMutations } from '../utils/crmHooks';
import { useQueryClient } from '@tanstack/react-query';

const ContactConfigContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
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

    const REQUIRED_CONTACT_TYPES = ['Professional', 'Address', 'Profile', 'Document-Category', 'DocumentCategory', 'Document-Type', 'DocumentType'];
    const { data: rawLookups } = useLookups(REQUIRED_CONTACT_TYPES);
    const { createLookup, updateLookup: apiUpdate, deleteLookup: apiDelete } = useLookupMutations();
    const queryClient = useQueryClient();

    const buildHierarchy = useCallback((flatList, rootType) => {
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
    }, []);

    const buildDocHierarchy = useCallback((flatList) => {
        // Supporting both versions (hyphenated and non-hyphenated) to ensure data is found
        const categories = flatList.filter(item =>
            item.lookup_type === 'Document-Category' || item.lookup_type === 'DocumentCategory'
        );
        const hierarchy = {};

        categories.forEach(cat => {
            const types = flatList.filter(item =>
                (item.lookup_type === 'Document-Type' || item.lookup_type === 'DocumentType') &&
                (item.parent_lookup_id === cat._id || item.parent_lookup_id?._id === cat._id ||
                    item.parent_lookup_value === cat.lookup_value)
            );

            // If we already have this category name, merge subCategories
            if (hierarchy[cat.lookup_value]) {
                const existingSubNames = new Set(hierarchy[cat.lookup_value].subCategories.map(s => s.name));
                types.forEach(t => {
                    if (!existingSubNames.has(t.lookup_value)) {
                        hierarchy[cat.lookup_value].subCategories.push({
                            id: t._id,
                            name: t.lookup_value
                        });
                    }
                });
            } else {
                hierarchy[cat.lookup_value] = {
                    id: cat._id,
                    name: cat.lookup_value,
                    subCategories: types.map(t => ({
                        id: t._id,
                        name: t.lookup_value
                    }))
                };
            }
        });

        return hierarchy;
    }, []);

    useEffect(() => {
        if (!rawLookups || rawLookups.length === 0) {
            setLoading(false);
            return;
        }

        const grouped = {};
        rawLookups.forEach(item => {
            const type = item.lookup_type;
            if (!grouped[type]) grouped[type] = [];
            grouped[type].push(item);
        });

        if (grouped['Professional']) {
            setProfessionalConfig(buildHierarchy(grouped['Professional'], 'Professional'));
        }
        if (grouped['Address']) {
            setAddressConfig(buildHierarchy(grouped['Address'], 'Address'));
        }
        if (grouped['Profile']) {
            setProfileConfig(buildHierarchy(grouped['Profile'], 'Profile'));
        }

        const combinedDocs = [
            ...(grouped['Document-Category'] || []),
            ...(grouped['DocumentCategory'] || []),
            ...(grouped['Document-Type'] || []),
            ...(grouped['DocumentType'] || [])
        ];
        setDocumentConfig(buildDocHierarchy(combinedDocs));

        setLoading(false);
    }, [rawLookups, buildHierarchy, buildDocHierarchy]);

    const fetchLookups = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: ['lookups'] });
    }, [queryClient]);

    const addLookup = async (type, value, parentValue) => {
        try {
            await createLookup.mutateAsync({
                lookup_type: type,
                lookup_value: value,
                parent_lookup_value: parentValue
            });
            await fetchLookups();
            return true;
        } catch (error) {
            console.error("Failed to add lookup", error);
            return false;
        }
    };

    const updateLookup = async (id, value, type, parentValue) => {
        try {
            await apiUpdate.mutateAsync({
                id,
                data: {
                    lookup_value: value,
                    lookup_type: type,
                    parent_lookup_value: parentValue
                }
            });
            await fetchLookups();
            return true;
        } catch (error) {
            console.error("Failed to update lookup", error);
            return false;
        }
    };

    const deleteLookup = async (id) => {
        try {
            await apiDelete.mutateAsync(id);
            await fetchLookups();
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
