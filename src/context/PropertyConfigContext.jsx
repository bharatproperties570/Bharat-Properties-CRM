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
        ],
        documents: [
            'Registry', 'Mutation', 'GPA', 'Aadhaar Card', 'PAN Card'
        ],
        images: [
            'Front View', 'Bedroom', 'Kitchen', 'Washroom', 'Map'
        ],
        videos: [
            'Walkthrough', 'Drone View', 'Interior Tour'
        ],
        approvals: [
            'RERA', 'DTCP', 'TCP', 'CLU', 'OC', 'CC'
        ],
        approvalAuthorities: [
            'DTCP', 'RERA', 'GMADA', 'HUDA', 'MC'
        ],
        projectStatuses: [
            'Under Construction', 'Ready to Move', 'New Launch', 'Pre-Launch'
        ],
        parkingTypes: [
            'Covered', 'Open', 'Stilt', 'Basement', 'Podium'
        ],
        // Mock Data for Project > Block > Size Mapping
        projectSizes: {
            "Sector 3 Chandigarh": {
                "North Block": ["1 Kanal (4500 Sq Ft)", "10 Marla (2250 Sq Ft)"]
            },
            "Sector 85 (Wave Estate)": {
                "A Block": ["1 Kanal (500 Sq Yd)", "10 Marla (250 Sq Yd)"],
                "B Block": ["14 Marla (350 Sq Yd)", "1 Kanal"],
                "C Block": ["200 Sq Yd", "300 Sq Yd"]
            },
            "Sector 69 Mohali": {
                "East Block": ["Showroom (120 Sq Yd)", "Booth (40 Sq Yd)"],
                "West Block": ["SCO (150 Sq Yd)", "Bay Shop (60 Sq Yd)"]
            },
            "Sector 77 Mohali": {
                "East Block": ["2 BHK (1350 Sq Ft)", "3 BHK (1650 Sq Ft)"],
                "West Block": ["3 BHK + Servant (2100 Sq Ft)", "4 BHK (2800 Sq Ft)"]
            }
        }
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
                ],
                documents: [
                    'Registry', 'Mutation', 'GPA', 'Aadhaar Card', 'PAN Card'
                ],
                images: [
                    'Front View', 'Bedroom', 'Kitchen', 'Washroom', 'Map'
                ],
                videos: [
                    'Walkthrough', 'Drone View', 'Interior Tour'
                ],
                approvals: [
                    'RERA', 'DTCP', 'TCP', 'CLU', 'OC', 'CC'
                ],
                approvalAuthorities: [
                    'DTCP', 'RERA', 'GMADA', 'HUDA', 'MC'
                ],
                projectStatuses: [
                    'Under Construction', 'Ready to Move', 'New Launch', 'Pre-Launch'
                ],
                parkingTypes: [
                    'Covered', 'Open', 'Stilt', 'Basement', 'Podium'
                ],
                projectSizes: {
                    "Sector 3 Chandigarh": {
                        "North Block": ["1 Kanal (4500 Sq Ft)", "10 Marla (2250 Sq Ft)"]
                    },
                    "Sector 85 (Wave Estate)": {
                        "A Block": ["1 Kanal (500 Sq Yd)", "10 Marla (250 Sq Yd)"]
                    }
                }
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
