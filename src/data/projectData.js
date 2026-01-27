export const PROJECTS_LIST = [
    { id: 1, name: 'Sector 3 Chandigarh', location: 'Sector 3, Chandigarh, 160001, India', blocks: ['North Block'], units: ['101', '102', '103', '104', '201', '202'], category: ['Residential', 'Plot', 'House'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-blue', lat: 30.7585, lng: 76.8040 },
    { id: 2, name: 'Sector 2 Chandigarh', location: 'Sector 2, Chandigarh, 160001, India', blocks: ['North Block'], units: ['A1', 'A2', 'B1', 'B2'], category: ['Residential', 'Plot', 'House', 'Flat/Apartment'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-orange', lat: 30.7620, lng: 76.7980 },
    { id: 3, name: 'Sector 71 Mohali', location: 'Sector 71, Phase 1, Mohali, Punjab', blocks: [], units: ['1', '2', '3', 'Shop 1'], category: ['Institutional', 'Independent House', 'Flat/Apartment', 'Shop'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-green', lat: 30.7100, lng: 76.7150 },
    { id: 4, name: 'Sector 69 Mohali', location: 'Sector 69, SAS Nagar, Punjab, India', blocks: ['East Block', 'West Block'], units: ['Showroom 1', 'Showroom 2'], category: ['Commercial', 'Showroom', 'School', 'Hotel'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-red', lat: 30.6950, lng: 76.7200 },
    { id: 5, name: 'Sector 70 Mohali', location: 'Sector 70, SAS Nagar, Punjab', blocks: [], units: ['Plot 10', 'Plot 11'], category: ['Residential', 'Plot', 'Independent House'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-purple', lat: 30.7020, lng: 76.7250 },
    { id: 6, name: 'Sector 77 Mohali', location: 'Sector 77, SAS Nagar, Punjab', blocks: ['East Block', 'West Block'], units: ['Office 101', 'Office 102'], category: ['Residential/Commercial', 'Multiplex', 'Office Space'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-blue', lat: 30.6850, lng: 76.7300 },
    { id: 7, name: 'Sector 13 Kurukshetra', location: 'Sector 13, Kurukshetra, Haryana', blocks: [], units: ['Plot 55'], category: ['Residential', 'Plot'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-orange', lat: 29.9720, lng: 76.8450 },
    { id: 8, name: 'Sector 85 (Wave Estate)', location: 'Wave Estate, Sector 85, Mohali', blocks: ['A Block', 'B Block', 'C Block'], units: ['Floor 1', 'Floor 2'], category: ['Residential', 'Plot', 'Independent House'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-green', lat: 30.6750, lng: 76.7500 },
];

// Helper to group by City for legacy support if needed, or structured access
const groupByCity = (projects) => {
    return projects.reduce((acc, project) => {
        const city = project.location.includes('Mohali') ? 'Mohali' :
            project.location.includes('Chandigarh') ? 'Chandigarh' :
                project.location.includes('Kurukshetra') ? 'Kurukshetra' : 'Other';

        if (!acc[city]) acc[city] = [];
        // Map to format expected by some components if they use specific keys like 'towers'
        // For now, we keep 'blocks' as the source of truth and can alias if needed.
        acc[city].push({
            ...project,
            towers: project.blocks // Alias blocks as towers for compatibility
        });
        return acc;
    }, {});
};

export const PROJECT_DATA = groupByCity(PROJECTS_LIST);

export const CITIES = Object.keys(PROJECT_DATA);
