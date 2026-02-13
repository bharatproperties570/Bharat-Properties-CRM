import mongoose from "mongoose";

const ProjectSchema = new mongoose.Schema({
    // Basic Info
    name: { type: String, required: true, unique: true, index: true },
    developerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
    developerName: String,
    isJointVenture: { type: Boolean, default: false },
    secondaryDeveloper: String,
    reraNumber: String,
    description: String,
    category: [String],
    subCategory: [String],

    // Project Stats
    landArea: String,
    landAreaUnit: String,
    totalBlocks: String,
    totalFloors: String,
    totalUnits: String,
    status: { type: String, default: 'Upcoming' },

    // Dates
    launchDate: Date,
    expectedCompletionDate: Date,
    possessionDate: Date,

    // Bank & Approvals
    parkingType: String,
    approvedBank: String,

    // System Details
    assign: [String],
    team: [String],
    visibleTo: String,

    // Location
    locationSearch: String,
    latitude: String,
    longitude: String,
    address: {
        hNo: String,
        street: String,
        locality: String,
        location: String,
        area: String,
        country: { type: String, default: 'India' },
        state: String,
        city: String,
        tehsil: String,
        postOffice: String,
        pincode: String
    },

    // Documents & Media
    projectDocuments: [{
        documentName: String,
        approvalAuthority: String,
        registrationNo: String,
        date: Date
    }],
    projectImages: [{
        title: String,
        category: String,
        path: String
    }],
    projectVideos: [{
        title: String,
        type: { type: String },
        url: String
    }],

    // Amenities
    amenities: {
        type: Map,
        of: Boolean
    },

    // Blocks
    blocks: [{
        name: String,
        floors: String,
        units: String,
        status: String,
        landArea: String,
        landAreaUnit: String,
        parkingType: String,
        launchDate: Date,
        expectedCompletionDate: Date,
        possessionDate: Date
    }],

    // Pricing
    pricing: {
        pricingType: String,
        unitPrices: [{
            block: String,
            subCategory: String,
            areaType: String,
            size: String,
            price: String
        }],
        basePrice: {
            amount: String,
            unit: String
        },
        masterCharges: [{
            id: String,
            name: String,
            category: String,
            basis: String,
            amount: String,
            gstEnabled: Boolean
        }],
        paymentPlans: [{
            name: String,
            type: { type: String },
            milestones: [{
                name: String,
                percentage: String,
                stage: String
            }]
        }]
    }
}, { timestamps: true });

export default mongoose.model("Project", ProjectSchema);
