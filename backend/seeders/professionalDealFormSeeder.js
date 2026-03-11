import mongoose from 'mongoose';
import DealForm from '../models/DealForm.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const seedProfessionalForm = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB for seeding...");

        const formSlug = 'professional-deal-capture';
        
        // Remove existing if any
        await DealForm.deleteOne({ slug: formSlug });

        const professionalForm = {
            name: "Professional Deal Capture Form",
            slug: formSlug,
            isActive: true,
            description: "Advanced deal capture form with dynamic inventory selection and premium UI.",
            sections: [
                {
                    id: "property-details",
                    title: "Property & Transaction",
                    fields: [
                        {
                            id: "projectName",
                            label: "Project Name",
                            type: "select",
                            required: true,
                            mappingField: "projectName",
                            placeholder: "Select Project",
                            order: 1
                        },
                        {
                            id: "block",
                            label: "Block/Sector",
                            type: "select",
                            required: true,
                            mappingField: "block",
                            placeholder: "Select Block",
                            order: 2
                        },
                        {
                            id: "unitNo",
                            label: "Unit Number",
                            type: "select",
                            required: true,
                            mappingField: "unitNo",
                            placeholder: "Select Unit",
                            order: 3
                        },
                        {
                            id: "intent",
                            label: "Transaction Type",
                            type: "select",
                            required: true,
                            mappingField: "intent",
                            options: ["Sell", "Rent", "Lease"],
                            placeholder: "Select Type",
                            order: 4
                        }
                    ]
                },
                {
                    id: "contact-info",
                    title: "Contact Information",
                    fields: [
                        {
                            id: "fullName",
                            label: "Contact Name",
                            type: "text",
                            required: true,
                            mappingField: "fullName",
                            placeholder: "Enter full name",
                            order: 1
                        },
                        {
                            id: "phone",
                            label: "Mobile Number",
                            type: "phone",
                            required: true,
                            mappingField: "phone",
                            placeholder: "Enter mobile number",
                            order: 2
                        },
                        {
                            id: "email",
                            label: "Email Address",
                            type: "email",
                            required: false,
                            mappingField: "email",
                            placeholder: "Enter email address",
                            order: 3
                        },
                        {
                            id: "role",
                            label: "I am the...",
                            type: "radio",
                            required: true,
                            mappingField: "role",
                            options: ["Owner", "Associate"],
                            defaultValue: "Owner",
                            order: 4
                        },
                        {
                            id: "relationship",
                            label: "Relation with Owner",
                            type: "text",
                            required: false,
                            mappingField: "relationship",
                            placeholder: "e.g. Spouse, Son, Agent",
                            helpText: "Only required if Associate",
                            order: 5
                        }
                    ]
                },
                {
                    id: "deal-info",
                    title: "Pricing & Details",
                    fields: [
                        {
                            id: "expectedPrice",
                            label: "Expected Price (₹)",
                            type: "text",
                            required: true,
                            mappingField: "price",
                            placeholder: "Enter expected price",
                            order: 1
                        }
                    ]
                }
            ],
            settings: {
                successMessage: "Thank you! Your deal has been captured professionally. Our team will verify and process it shortly.",
                autoAssignTo: null,
                autoTags: ["Professional-Capture"],
                theme: {
                    primaryColor: "#0f172a", // Slate 900 for a premium professional look
                    layout: "single"
                }
            }
        };

        await DealForm.create(professionalForm);
        console.log("Professional Deal Capture Form seeded successfully!");
        
        process.exit(0);
    } catch (error) {
        console.error("Error seeding form:", error);
        process.exit(1);
    }
};

seedProfessionalForm();
