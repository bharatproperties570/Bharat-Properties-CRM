export const PROPERTY_CATEGORIES = {
    "Residential": {
        subCategories: [
            {
                name: "Plot",
                types: [
                    { name: "1 Kanal", builtupTypes: [] },
                    { name: "2 Kanal", builtupTypes: [] },
                    { name: "16 Marla", builtupTypes: [] },
                    { name: "14 Marla", builtupTypes: [] },
                    { name: "10 Marla", builtupTypes: [] },
                    { name: "8 Marla", builtupTypes: [] },
                    { name: "6 Marla", builtupTypes: [] },
                    { name: "4 Marla", builtupTypes: [] },
                    { name: "3 Marla", builtupTypes: [] },
                    { name: "2 Marla", builtupTypes: [] }
                ]
            },
            {
                name: "Independent House",
                types: [
                    { name: "1 Kanal", builtupTypes: [] },
                    { name: "2 Kanal", builtupTypes: [] },
                    { name: "10 Marla", builtupTypes: [] },
                    { name: "8 Marla", builtupTypes: [] },
                    { name: "6 Marla", builtupTypes: [] }
                ]
            },
            {
                name: "Flat/Apartment",
                types: [
                    { name: "1 BHK", builtupTypes: ["Store", "Servant Room"] },
                    { name: "2 BHK", builtupTypes: ["Store", "Servant Room", "Study"] },
                    { name: "3 BHK", builtupTypes: ["Store", "Servant Room", "Pooja Room"] },
                    { name: "4 BHK", builtupTypes: ["Store", "Servant Room", "Pooja Room"] },
                    { name: "5 BHK", builtupTypes: ["Store", "Servant Room", "Pooja Room"] },
                    { name: "Studio", builtupTypes: [] }
                ]
            },
            {
                name: "Builder Floor",
                types: [
                    { name: "1 BHK", builtupTypes: ["Store", "Servant Room"] },
                    { name: "2 BHK", builtupTypes: ["Store", "Servant Room", "Study"] },
                    { name: "3 BHK", builtupTypes: ["Store", "Servant Room", "Pooja Room"] },
                    { name: "4 BHK", builtupTypes: ["Store", "Servant Room", "Pooja Room"] }
                ]
            }
        ]
    },
    "Commercial": {
        subCategories: [
            { name: "Shop", types: [{ name: "Booth", builtupTypes: [] }, { name: "Kiosk", builtupTypes: [] }] },
            { name: "Showroom", types: [{ name: "SCO", builtupTypes: [] }, { name: "SCF", builtupTypes: [] }, { name: "DSS", builtupTypes: [] }] },
            { name: "Office Space", types: [{ name: "Locable Office", builtupTypes: [] }, { name: "Virtual Office", builtupTypes: [] }] },
            { name: "Retail Store", types: [{ name: "Hyper Market", builtupTypes: [] }, { name: "Departmental Store", builtupTypes: [] }] },
            { name: "SOHO", types: [{ name: "SOHO", builtupTypes: [] }] },
            { name: "Executive Room", types: [{ name: "Room", builtupTypes: [] }] },
            { name: "Multiplex", types: [{ name: "Multiplex", builtupTypes: [] }] },
            { name: "Virtual Space", types: [{ name: "Virtual Space", builtupTypes: [] }] },
            { name: "Plot", types: [{ name: "Commercial Plot", builtupTypes: [] }] }
        ]
    },
    "Institutional": {
        subCategories: [
            { name: "School", types: [{ name: "Nursery School", builtupTypes: [] }, { name: "Crech", builtupTypes: [] }, { name: "High School", builtupTypes: [] }, { name: "Primary School", builtupTypes: [] }] },
            { name: "Hotel", types: [{ name: "Hotel", builtupTypes: [] }, { name: "Guest House", builtupTypes: [] }, { name: "Homestays", builtupTypes: [] }] },
            { name: "Universities", types: [{ name: "Deemed", builtupTypes: [] }, { name: "Private", builtupTypes: [] }] },
            { name: "Hospital", types: [{ name: "Nursing Home", builtupTypes: [] }, { name: "Clinic", builtupTypes: [] }] },
            { name: "College", types: [{ name: "Art College", builtupTypes: [] }, { name: "Technical College", builtupTypes: [] }, { name: "Medical College", builtupTypes: [] }] }
        ]
    },
    "Industrial": {
        subCategories: [
            { name: "Plot", types: [{ name: "1 Kanal", builtupTypes: [] }, { name: "10 Marla", builtupTypes: [] }, { name: "2 Kanal", builtupTypes: [] }, { name: "1 Acre", builtupTypes: [] }] },
            { name: "Warehouse", types: [{ name: "WRHSE", builtupTypes: [] }] },
            { name: "Cold Storage", types: [{ name: "CLDSTRG", builtupTypes: [] }] },
            { name: "Rice Seller", types: [{ name: "RCSLR", builtupTypes: [] }] },
            { name: "Building", types: [{ name: "BLDG", builtupTypes: [] }] },
            { name: "Factory", types: [{ name: "FCTRY", builtupTypes: [] }] }
        ]
    },
    "Agricultural": {
        subCategories: [
            { name: "Land", types: [{ name: "Cropland", builtupTypes: [] }, { name: "Woodland", builtupTypes: [] }, { name: "Pasture", builtupTypes: [] }, { name: "Commercial", builtupTypes: [] }, { name: "Farm", builtupTypes: [] }] },
            { name: "Farm House", types: [{ name: "Farm House", builtupTypes: [] }] }
        ]
    }
};

export const DIRECTION_OPTIONS = [
    'North', 'South', 'East', 'West',
    'North-East', 'North-West', 'South-East', 'South-West'
];

export const FACING_OPTIONS = [
    'Park Facing', 'Main Road Facing', 'Corner', 'School Facing', 'Temple/Mandir Facing', 'Commercial Facing', 'Club Facing', 'Pool Facing', 'Garden Facing'
];

export const ROAD_WIDTH_OPTIONS = [
    '9 Mtr (30 Feet) Wide',
    '12 Mtr (40 Feet) Wide',
    '18 Mtr (60 Feet) Wide',
    '24 Mtr (80 Feet) Wide',
    '30 Mtr (100 Feet) Wide',
    '60 Mtr (200 Feet) Wide'
];

export const PROPERTY_UNIT_TYPE_OPTIONS = [
    'Ordinary',
    'Corner',
    'Two Side Open',
    'Three Side Open'
];
