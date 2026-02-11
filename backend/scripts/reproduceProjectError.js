import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../models/Project.js';

dotenv.config({ path: 'backend/.env' });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const mockProject = {
            name: "Test Project " + Date.now(), // Ensure unique name
            developerName: "Test Developer",
            isJointVenture: false,
            category: ["Residential"],
            subCategory: ["Flat/Apartment"],
            landArea: "10",
            landAreaUnit: "Acres",
            totalBlocks: "5",
            totalFloors: "10",
            totalUnits: "100",
            status: "Upcoming",
            launchDate: "2026-01-01",
            expectedCompletionDate: "2028-01-01",
            possessionDate: "2028-06-01",
            parkingType: "Open Parking",
            approvedBank: "HDFC",
            visibleTo: "All Users",
            locationSearch: "Sector 62, Gurgaon",
            latitude: "28.123456",
            longitude: "77.123456",
            address: {
                hNo: "1",
                street: "Main Road",
                city: "Gurgaon",
                state: "Haryana",
                country: "India",
                pincode: "122001"
            },
            amenities: {
                "Pool": true,
                "Gym": false
            },
            blocks: [],
            pricing: {
                pricingType: 'Standard',
                unitPrices: [],
                basePrice: { amount: '5000', unit: 'sqft' },
                masterCharges: [],
                paymentPlans: []
            },
            // Add fields that might be missing or causing issues
            projectDocuments: [],
            projectImages: [],
            projectVideos: []
        };

        console.log("Attempting to create project...");
        const project = await Project.create(mockProject);
        console.log("Project created successfully:", project._id);

    } catch (error) {
        console.error("Error creating project:", error);
    } finally {
        await mongoose.disconnect();
    }
};

run();
