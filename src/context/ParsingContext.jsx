import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { parsingRulesAPI } from '../utils/api';
import toast from 'react-hot-toast';

const ParsingContext = createContext();

export const useParsing = () => useContext(ParsingContext);

// Initial Standard Data (Fallback)
const DEFAULT_CITIES = ['Chandigarh', 'Mohali', 'Zirakpur', 'Panchkula', 'Kharar', 'New Chandigarh', 'Derabassi'];
const DEFAULT_LOCATIONS = ['Sector', 'Aerocity', 'IT City', 'Eco City', 'JLPL', 'TDP', 'Bestech', 'Homeland', 'Marbella', 'Green Lotus', 'Escon Arena'];
const DEFAULT_TYPES = {
    'Residential': ['flat', 'apartment', 'bhk', 'penthouse', 'floor', 'builder floor', 'studio', 'duplex', 'simplex', 'villa', 'kothi', 'house', 'independent house', 'bungalow', 'mansion', 'residence', 'plot', 'land', 'gaz', 'sqyd', 'kanal', 'marla', 'bigha', 'acre'],
    'Commercial': ['shop', 'showroom', 'booth', 'sco', 'scf', 'dss', 'bay shop', 'double storey', 'office', 'office space', 'retail', 'anchor store', 'food court', 'multiplex', 'hotel', 'restaurant', 'pub', 'bar', 'club', 'resort', 'commercial plot', 'commercial land', 'plaza', 'mall'],
    'Industrial': ['factory', 'shed', 'warehouse', 'godown', 'storage', 'cold storage', 'industrial plot', 'industrial land', 'industrial shed', 'plant', 'manufacturing unit', 'industry'],
    'Agricultural': ['farm', 'farm land', 'agricultural land', 'agriculture', 'khet', 'zameen', 'jameen', 'vadi', 'farmhouse', 'orchard', 'nursery'],
    'Institutional': ['school', 'college', 'university', 'campus', 'institute', 'coaching centre', 'education', 'hospital', 'nursing home', 'clinic', 'dispensary', 'labs', 'pathology', 'institutional plot', 'religious', 'temple', 'mandir', 'gurudwara', 'church']
};

export const ParsingProvider = ({ children }) => {
    const [cities, setCities] = useState([]);
    const [locations, setLocations] = useState([]);
    const [types, setTypes] = useState(DEFAULT_TYPES);
    const [allRules, setAllRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [customPatterns, setCustomPatterns] = useState(null);

    const fetchRules = useCallback(async () => {
        try {
            setLoading(true);
            const response = await parsingRulesAPI.getAll();
            if (response.success) {
                const rules = response.data;
                setAllRules(rules);

                // Process rules into categories
                const fetchedCities = rules.filter(r => r.type === 'CITY').map(r => r.value);
                const fetchedLocations = rules.filter(r => r.type === 'LOCATION').map(r => r.value);

                // Build types map
                const fetchedTypes = { ...DEFAULT_TYPES };
                rules.filter(r => r.type === 'TYPE').forEach(r => {
                    if (fetchedTypes[r.category]) {
                        if (!fetchedTypes[r.category].includes(r.value)) {
                            fetchedTypes[r.category] = [...fetchedTypes[r.category], r.value];
                        }
                    } else {
                        fetchedTypes[r.category] = [r.value];
                    }
                });

                // Set states, use defaults as fallback if empty? 
                // No, if empty we should probably use defaults or just stay empty.
                // Let's merge with defaults for a "ready out of box" experience
                setCities(fetchedCities.length > 0 ? fetchedCities : DEFAULT_CITIES);
                setLocations(fetchedLocations.length > 0 ? fetchedLocations : DEFAULT_LOCATIONS);
                setTypes(fetchedTypes);

                regeneratePatternObject(
                    fetchedCities.length > 0 ? fetchedCities : DEFAULT_CITIES,
                    fetchedLocations.length > 0 ? fetchedLocations : DEFAULT_LOCATIONS,
                    fetchedTypes
                );
            }
        } catch (error) {
            console.error("Failed to fetch parsing rules:", error);
            // Fallback to defaults on error
            setCities(DEFAULT_CITIES);
            setLocations(DEFAULT_LOCATIONS);
            setTypes(DEFAULT_TYPES);
            regeneratePatternObject(DEFAULT_CITIES, DEFAULT_LOCATIONS, DEFAULT_TYPES);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const addKeyword = async (category, keyword) => {
        try {
            let payload;
            if (category === 'CITY') payload = { type: 'CITY', value: keyword };
            else if (category === 'LOCATION') payload = { type: 'LOCATION', value: keyword };
            else if (category === 'TYPE') payload = { type: 'TYPE', category: keyword.category, value: keyword.word };

            const response = await parsingRulesAPI.create(payload);
            if (response.success) {
                toast.success("Keyword added successfully");
                fetchRules(); // Refresh
            }
        } catch (error) {
            toast.error(error.message || "Failed to add keyword");
        }
    };

    const removeKeyword = async (category, keyword) => {
        try {
            let ruleToDelete;
            if (category === 'CITY') ruleToDelete = allRules.find(r => r.type === 'CITY' && r.value === keyword);
            else if (category === 'LOCATION') ruleToDelete = allRules.find(r => r.type === 'LOCATION' && r.value === keyword);
            else if (category === 'TYPE') ruleToDelete = allRules.find(r => r.type === 'TYPE' && r.category === keyword.category && r.value === keyword.word);

            if (ruleToDelete) {
                await parsingRulesAPI.delete(ruleToDelete._id);
                toast.success("Keyword removed");
            } else {
                // If not in DB, it's a default. Just remove from local state temporarily? 
                // Or inform user they can't delete defaults until they are synced?
                // For simplicity, let's just toast
                toast.error("Standard keywords cannot be removed unless saved to DB first.");
                return;
            }
            fetchRules();
        } catch (error) {
            toast.error("Failed to remove keyword");
        }
    };

    const regeneratePatternObject = (cList, lList, tList) => {
        const cityPattern = new RegExp(`(${cList.join('|')})`, 'i');
        const dynamicLocs = lList.filter(l => l.toLowerCase() !== 'sector').join('|');
        const locPattern = new RegExp(`(?:sector|sec|sec-|sector-)\\s?(\\d+[a-z]?)|(${dynamicLocs})`, 'i');

        setCustomPatterns({
            CITY: cityPattern,
            LOCATION: locPattern,
            TYPE_KEYWORDS: tList
        });
    };

    return (
        <ParsingContext.Provider value={{
            cities, locations, types,
            addKeyword, removeKeyword,
            customPatterns, loading,
            refreshRules: fetchRules
        }}>
            {children}
        </ParsingContext.Provider>
    );
};
