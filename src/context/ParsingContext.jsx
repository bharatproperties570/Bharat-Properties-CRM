import React, { createContext, useContext, useState, useEffect } from 'react';

const ParsingContext = createContext();

export const useParsing = () => useContext(ParsingContext);

// Initial Standard Data (Could come from DB)
const DEFAULT_CITIES = ['Chandigarh', 'Mohali', 'Zirakpur', 'Panchkula', 'Kharar', 'New Chandigarh', 'Derabassi'];

const DEFAULT_LOCATIONS = [
    'Sector', 'Aerocity', 'IT City', 'Eco City', 'JLPL', 'TDP', 'Bestech', 'Homeland', 'Marbella', 'Green Lotus', 'Escon Arena'
];

const DEFAULT_TYPES = {
    'Plot': ['plot', 'land', 'gaz', 'sqyd', 'kanal', 'marla'],
    'Flat': ['flat', 'apartment', 'bhk', 'penthouse', 'floor'],
    'Commercial': ['shop', 'showroom', 'booth', 'sco', 'dss', 'office', 'bay', 'scf'],
    'Villa': ['villa', 'kothi', 'independent house', 'bungalow', 'house']
};

export const ParsingProvider = ({ children }) => {
    // Dynamic Rules State
    const [cities, setCities] = useState(DEFAULT_CITIES);
    const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
    const [types, setTypes] = useState(DEFAULT_TYPES);
    const [customPatterns, setCustomPatterns] = useState(null);

    // Persist to LocalStorage (Mock DB)
    useEffect(() => {
        const savedCities = localStorage.getItem('parser_cities');
        const savedLocations = localStorage.getItem('parser_locations');

        if (savedCities) setCities(JSON.parse(savedCities));
        if (savedLocations) setLocations(JSON.parse(savedLocations));
        const savedTypes = localStorage.getItem('parser_types');
        if (savedTypes) setTypes(JSON.parse(savedTypes));
    }, []);

    const saveSettings = (newCities, newLocations, newTypes) => {
        setCities(newCities);
        setLocations(newLocations);
        setTypes(newTypes);

        localStorage.setItem('parser_cities', JSON.stringify(newCities));
        localStorage.setItem('parser_locations', JSON.stringify(newLocations));
        // Recalculate Regex
        regeneratePatternObject(newCities, newLocations, newTypes);
    };

    const addKeyword = (category, keyword) => {
        if (!keyword) return;
        if (category === 'CITY') {
            const newCities = [...cities, keyword];
            saveSettings(newCities, locations, types);
        } else if (category === 'LOCATION') {
            const newLocs = [...locations, keyword];
            saveSettings(cities, newLocs, types);
        } else if (category === 'TYPE') {
            // keyword should be object { category: 'Flat', word: 'studio' }
            const { category: typeCat, word } = keyword;
            const newTypes = { ...types };
            if (newTypes[typeCat]) {
                newTypes[typeCat] = [...newTypes[typeCat], word];
                saveSettings(cities, locations, newTypes);
            }
        }
    };

    const removeKeyword = (category, keyword) => {
        if (category === 'CITY') {
            const newCities = cities.filter(c => c !== keyword);
            saveSettings(newCities, locations, types);
        } else if (category === 'LOCATION') {
            const newLocs = locations.filter(l => l !== keyword);
            saveSettings(cities, newLocs, types);
        } else if (category === 'TYPE') {
            // keyword here is { category: 'Flat', word: 'apartment' } or similar? 
            // Better interface: removeKeyword('TYPE', 'Flat', 'apartment')
            // But function signature is fixed. Let's assume keyword is an object or we overload
            // Actually, let's just make keyword generic and rely on caller to pass valid args or change signature?
            // Let's change signature slightly or assume keyword is an object for TYPE.
            // Simplified: removeKeyword('TYPE', { category: 'Flat', word: 'apartment' })
            const { category: typeCat, word } = keyword;
            const newTypes = { ...types };
            if (newTypes[typeCat]) {
                newTypes[typeCat] = newTypes[typeCat].filter(w => w !== word);
                saveSettings(cities, locations, newTypes);
            }
        }
    };

    const regeneratePatternObject = (cList, lList, tList) => {
        // Construct Regex Objects dynamically to pass to parser
        // We need to create strings joined by |
        // Escape special chars? Minimal escaping needed for alpha-numeric words

        const cityPattern = new RegExp(`(${cList.join('|')})`, 'i');
        // For locations, we need to handle "Sector (\d+)" vs just plain names
        // We will keep the complex Sector regex static but append the new dynamic list
        const dynamicLocs = lList.filter(l => l.toLowerCase() !== 'sector').join('|');
        const locPattern = new RegExp(`(?:sector|sec|sec-|sector-)\\s?(\\d+[a-z]?)|(${dynamicLocs})`, 'i');

        setCustomPatterns({
            CITY: cityPattern,
            LOCATION: locPattern,
            TYPE_KEYWORDS: tList // Pass the map directly
        });
    };

    // Init on load
    useEffect(() => {
        regeneratePatternObject(cities, locations, types);
    }, []);

    return (
        <ParsingContext.Provider value={{
            cities, locations, types,
            addKeyword, removeKeyword,
            customPatterns
        }}>
            {children}
        </ParsingContext.Provider>
    );
};
