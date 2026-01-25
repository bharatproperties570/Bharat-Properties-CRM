import React, { createContext, useState, useContext } from 'react';
import { PROPERTY_CATEGORIES } from '../data/propertyData';

const PropertyConfigContext = createContext();

export const usePropertyConfig = () => {
    const context = useContext(PropertyConfigContext);
    if (!context) {
        throw new Error('usePropertyConfig must be used within a PropertyConfigProvider');
    }
    return context;
};

export const PropertyConfigProvider = ({ children }) => {
    // Initialize state with the static data
    const [propertyConfig, setPropertyConfig] = useState(PROPERTY_CATEGORIES);

    // Master Fields State (Facings, Road Widths, etc.)
    const [masterFields, setMasterFields] = useState({
        facings: [
            'Park Facing', 'Main Road Facing', 'Corner', 'School Facing',
            'Temple/Mandir Facing', 'Commercial Facing', 'Club Facing',
            'Pool Facing', 'Garden Facing'
        ],
        roadWidths: [
            '9 Mtr (30 Feet) Wide', '12 Mtr (40 Feet) Wide', '18 Mtr (60 Feet) Wide',
            '24 Mtr (80 Feet) Wide', '30 Mtr (100 Feet) Wide', '60 Mtr (200 Feet) Wide'
        ],
        directions: [
            'North', 'South', 'East', 'West',
            'North-East', 'North-West', 'South-East', 'South-West'
        ],
        unitTypes: [
            'Ordinary', 'Corner', 'Two Side Open', 'Three Side Open'
        ],
        floorLevels: [
            'Basement', 'Ground Floor', 'First Floor', 'Second Floor', 'Third Floor', 'Top Floor'
        ]
    });

    // Ensure new fields are added to state even if persisted (HMR/Storage fix)
    React.useEffect(() => {
        setMasterFields(prev => {
            const defaults = {
                facings: [
                    'Park Facing', 'Main Road Facing', 'Corner', 'School Facing',
                    'Temple/Mandir Facing', 'Commercial Facing', 'Club Facing',
                    'Pool Facing', 'Garden Facing'
                ],
                roadWidths: [
                    '9 Mtr (30 Feet) Wide', '12 Mtr (40 Feet) Wide', '18 Mtr (60 Feet) Wide',
                    '24 Mtr (80 Feet) Wide', '30 Mtr (100 Feet) Wide', '60 Mtr (200 Feet) Wide'
                ],
                directions: [
                    'North', 'South', 'East', 'West',
                    'North-East', 'North-West', 'South-East', 'South-West'
                ],
                unitTypes: [
                    'Ordinary', 'Corner', 'Two Side Open', 'Three Side Open'
                ],
                floorLevels: [
                    'Basement', 'Ground Floor', 'First Floor', 'Second Floor', 'Third Floor', 'Top Floor'
                ]
            };

            let hasChange = false;
            const next = { ...prev };
            Object.keys(defaults).forEach(key => {
                if (!next[key]) {
                    next[key] = defaults[key];
                    hasChange = true;
                }
            });
            return hasChange ? next : prev;
        });
    }, []);

    // CRUD Operations exposed to the app
    const updateConfig = (newConfig) => {
        setPropertyConfig(newConfig);
    };

    const updateMasterFields = (field, newValues) => {
        setMasterFields(prev => ({
            ...prev,
            [field]: newValues
        }));
    };

    return (
        <PropertyConfigContext.Provider value={{ propertyConfig, updateConfig, masterFields, updateMasterFields }}>
            {children}
        </PropertyConfigContext.Provider>
    );
};
