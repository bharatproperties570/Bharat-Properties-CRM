import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from '../models/Inventory.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const PROJECTS_LIST = [
    { id: 1, name: 'Sector 3 Chandigarh', location: 'Sector 3, Chandigarh, 160001, India', blocks: ['North Block'], units: ['101', '102', '103', '104', '201', '202'], category: ['Residential', 'Plot', 'House'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-blue', lat: 30.7585, lng: 76.8040 },
    { id: 2, name: 'Sector 2 Chandigarh', location: 'Sector 2, Chandigarh, 160001, India', blocks: ['North Block'], units: ['A1', 'A2', 'B1', 'B2'], category: ['Residential', 'Plot', 'House', 'Flat/Apartment'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-orange', lat: 30.7620, lng: 76.7980 },
    { id: 3, name: 'Sector 71 Mohali', location: 'Sector 71, Phase 1, Mohali, Punjab', blocks: [], units: ['1', '2', '3', 'Shop 1'], category: ['Institutional', 'Independent House', 'Flat/Apartment', 'Shop'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-green', lat: 30.7100, lng: 76.7150 },
    { id: 4, name: 'Sector 69 Mohali', location: 'Sector 69, SAS Nagar, Punjab, India', blocks: ['East Block', 'West Block'], units: ['Showroom 1', 'Showroom 2'], category: ['Commercial', 'Showroom', 'School', 'Hotel'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-red', lat: 30.6950, lng: 76.7200 },
    { id: 5, name: 'Sector 70 Mohali', location: 'Sector 70, SAS Nagar, Punjab', blocks: [], units: ['Plot 10', 'Plot 11'], category: ['Residential', 'Plot', 'Independent House'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-purple', lat: 30.7020, lng: 76.7250 },
    { id: 6, name: 'Sector 77 Mohali', location: 'Sector 77, SAS Nagar, Punjab', blocks: ['East Block', 'West Block'], units: ['Office 101', 'Office 102'], category: ['Residential/Commercial', 'Multiplex', 'Office Space'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-blue', lat: 30.6850, lng: 76.7300 },
    { id: 7, name: 'Sector 13 Kurukshetra', location: 'Sector 13, Kurukshetra, Haryana', blocks: [], units: ['Plot 55'], category: ['Residential', 'Plot'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-orange', lat: 29.9720, lng: 76.8450 },
    { id: 8, name: 'Sector 85 (Wave Estate)', location: 'Wave Estate, Sector 85, Mohali', blocks: ['A Block', 'B Block', 'C Block'], units: ['Floor 1', 'Floor 2'], category: ['Residential', 'Plot', 'Independent House'], user: 'Admin', date: '2023-10-24', thumb: 'thumb-green', lat: 30.6750, lng: 76.7500 },
];

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        process.exit(1);
    }
};

const seedData = async () => {
    await connectDB();

    try {
        await Inventory.deleteMany({});
        console.log('Inventory Cleared');

        const inventoryItems = [];

        for (const project of PROJECTS_LIST) {
            for (const unit of project.units) {
                // Generate consistent random data based on unit/project
                const isCommercial = project.category.includes('Commercial') || project.category.includes('Shop') || project.category.includes('Showroom');
                const price = isCommercial ? (10000000 + Math.random() * 50000000) : (5000000 + Math.random() * 20000000);
                const sizeVal = isCommercial ? 120 : 250;

                inventoryItems.push({
                    unitNo: unit,
                    unitNumber: unit,
                    project: project.name,
                    projectName: project.name,
                    location: project.location,
                    area: project.location, // Mapping for InventoryPage.jsx usage
                    city: project.name.includes('Mohali') ? 'Mohali' : project.name.includes('Chandigarh') ? 'Chandigarh' : 'Kurukshetra',

                    category: { lookup_value: project.category[0] || 'Residential' }, // Mocking lookup object structure
                    type: project.category[0] || 'Residential',
                    subCategory: { lookup_value: project.category[1] || 'Plot' },

                    status: { lookup_value: Math.random() > 0.3 ? 'Active' : 'Sold Out' },
                    intent: { lookup_value: Math.random() > 0.5 ? 'For Sale' : 'For Rent' },

                    price: Math.floor(price),
                    size: sizeVal,
                    sizeUnit: 'Sq. Yds',

                    facing: { lookup_value: ['North', 'South', 'East', 'West'][Math.floor(Math.random() * 4)] },
                    direction: ['North-East', 'South-West', 'North-West', 'South-East'][Math.floor(Math.random() * 4)],
                    roadWidth: ['30 ft', '40 ft', '60 ft'][Math.floor(Math.random() * 3)],
                    road: ['30 ft', '40 ft', '60 ft'][Math.floor(Math.random() * 3)],

                    corner: Math.random() > 0.8 ? 'Corner' : 'Standard',

                    ownerName: `Owner ${unit}`,
                    ownerPhone: `+91 98765 ${Math.floor(10000 + Math.random() * 90000)}`,
                    ownerAddress: `House #${Math.floor(Math.random() * 100)}, Sector ${Math.floor(Math.random() * 50)}, Chandigarh`,

                    associatedContact: `Dealer ${Math.floor(Math.random() * 10)}`,
                    associatedPhone: `+91 98123 ${Math.floor(10000 + Math.random() * 90000)}`,

                    lat: project.lat + (Math.random() - 0.5) * 0.01,
                    lng: project.lng + (Math.random() - 0.5) * 0.01,

                    remarks: 'Generated via seed script',
                    lastContactDate: '24/10/2023',
                    lastContactTime: '10:00 AM',
                    lastContactUser: 'System',

                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }
        }

        // Use native collection.insertMany to bypass mongoose validation for mismatched types (Object instead of ObjectId)
        await Inventory.collection.insertMany(inventoryItems);
        console.log(`Successfully seeded ${inventoryItems.length} inventory items.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedData();
