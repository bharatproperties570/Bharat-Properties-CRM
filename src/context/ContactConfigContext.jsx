import React, { createContext, useState, useContext } from 'react';

const ContactConfigContext = createContext();

export const useContactConfig = () => {
    const context = useContext(ContactConfigContext);
    if (!context) {
        throw new Error('useContactConfig must be used within a ContactConfigProvider');
    }
    return context;
};

// Initial Default Data for Professional Details
const DEFAULT_PROFESSIONAL_CONFIG = {
    "Salaried": {
        subCategories: [
            // Government Sector
            { name: "Central Govt", types: ["Group A Officer", "Group B Officer", "Section Officer", "Assistant", "Clerk", "MTS"] },
            { name: "State Govt", types: ["Class 1 Officer", "Class 2 Officer", "Superintendent", "Clerk", "Peon", "Police Personnel"] },
            { name: "PSU", types: ["Executive Director", "General Manager", "Manager", "Engineer", "Administrative Officer", "Technician"] },
            { name: "Defence", types: ["Commissioned Officer", "JCO", "NCO", "Soldier", "Civilian Staff"] },
            { name: "Civil Services", types: ["IAS", "IPS", "IFS", "IRS", "PCS", "PPS"] },

            // Private Sector
            { name: "IT & Software", types: ["Software Engineer", "Senior Developer", "Team Lead", "Project Manager", "Product Manager", "QA Engineer", "UI/UX Designer", "CTO"] },
            { name: "Banking & Finance", types: ["Branch Manager", "Operations Manager", "Probationary Officer", "Credit Manager", "Relationship Manager", "Analyst", "Clerk"] },
            { name: "Healthcare", types: ["Chief Medical Officer", "Specialist Doctor", "Resident Doctor", "Nursing Staff", "Hospital Administrator", "Lab Technician", "Pharmacist"] },
            { name: "Manufacturing", types: ["Plant Head", "Production Manager", "Quality Incharge", "Shift Supervisor", "Machine Operator", "Worker"] },
            { name: "Corporate", types: ["CEO", "CFO", "Director", "Vice President", "General Manager", "HR Manager", "Executive Assistant"] },
            { name: "Education", types: ["Principal", "Professor", "Associate Professor", "Assistant Professor", "Lecturer", "Teacher", "Counselor"] }
        ]
    },
    "Self Employed": {
        subCategories: [
            // Professionals
            { name: "Doctor", types: ["General Physician", "Surgeon", "Pediatrician", "Gynecologist", "Orthopedic", "Dentist", "Ayurvedic Doctor", "Homeopathic Doctor"] },
            { name: "Lawyer", types: ["Senior Advocate", "High Court Lawyer", "District Court Lawyer", "Civil Lawyer", "Criminal Lawyer", "Corporate Lawyer", "Legal Consultant"] },
            { name: "Accountant", types: ["Chartered Accountant (CA)", "Company Secretary (CS)", "Cost Accountant", "Tax Consultant", "Auditor"] },
            { name: "Architect/Designer", types: ["Principal Architect", "Interior Designer", "Landscape Architect", "Urban Planner"] },

            // Freelancers & Creatives
            { name: "Consultant", types: ["Business Consultant", "Management Consultant", "IT Consultant", "Financial Advisor"] },
            { name: "Media & Arts", types: ["Journalist", "Editor", "Photographer", "Videographer", "Content Creator", "Actor", "Musician", "Artist"] },
            { name: "Tech Freelancer", types: ["Freelance Developer", "Web Designer", "Digital Marketer", "SEO Specialist"] }
        ]
    },
    "Business Man": {
        subCategories: [
            // Trading
            { name: "Wholesale", types: ["Distributor", "Stockist", "C&F Agent", "Whole Seller"] },
            { name: "Retail", types: ["Showroom Owner", "Shop Owner", "Franchise Owner", "Departmental Store Owner"] },
            { name: "Import/Export", types: ["Merchant Exporter", "Manufacturer Exporter", "Service Provider"] },

            // Services
            { name: "Real Estate", types: ["Developer", "Builder", "Colonizer", "Property Dealer", "Investor"] },
            { name: "Hospitality", types: ["Hotel Owner", "Resort Owner", "Restaurant Owner", "Cafe Owner", "Catering Business"] },
            { name: "Transport", types: ["Transporter", "Fleet Owner", "Logistics Provider", "Travel Agency Owner"] },
            { name: "Financial Services", types: ["Money Lender", "DSA (Direct Selling Agent)", "Stock Broker", "Insurance Broker"] },

            // Manufacturing
            { name: "Industrialist", types: ["Factory Owner", "Mill Owner", "Industrial Unit Owner"] },
            { name: "Small Scale Industry", types: ["Workshop Owner", "Fabricator", "Manufacturer"] }
        ]
    },
    "Retired": {
        subCategories: [
            { name: "Govt Service", types: ["Retired Class 1 Officer", "Retired Gazetted Officer", "Retired Employee", "Pensioner"] },
            { name: "Defence", types: ["Ex-Serviceman (Officer)", "Ex-Serviceman (JCO/OR)", "War Veteran"] },
            { name: "Private Sector", types: ["Retired Executive", "Retired Manager", "Retired Staff"] },
            { name: "Bank", types: ["Retired Banker", "Voluntary Retired (VRS)"] }
        ]
    },
    "House Wife": {
        subCategories: [
            { name: "Homemaker", types: ["Homemaker"] },
            { name: "Part Time", types: ["Tuition Teacher", "Boutique Owner", "Home Baker", "Social Worker"] }
        ]
    },
    "Student": {
        subCategories: [
            { name: "School", types: ["Primary Student", "Secondary Student", "Senior Secondary (Arts)", "Senior Secondary (Commerce)", "Senior Secondary (Medical)", "Senior Secondary (Non-Medical)"] },
            { name: "College (UG)", types: ["B.Tech Student", "B.Sc Student", "B.Com Student", "B.A Student", "BBA Student", "BCA Student", "MBBS Student", "Law Student"] },
            { name: "University (PG)", types: ["M.Tech Student", "M.Sc Student", "M.Com Student", "M.A Student", "MBA Student", "PhD Scholar"] },
            { name: "Competitive Exam Aspirant", types: ["UPSC Aspirant", "Banking Aspirant", "SSC Aspirant", "Medical Aspirant", "Engineering Aspirant"] }
        ]
    }
};

// Initial Default Data for Address Hierarchy (State -> City -> Locations)
const DEFAULT_ADDRESS_CONFIG = {
    "India": {
        subCategories: [
            {
                name: "Punjab",
                subCategories: [
                    {
                        name: "Mohali",
                        subCategories: [
                            {
                                name: "Sector 66",
                                subCategories: [
                                    {
                                        name: "Mohali Tehsil",
                                        subCategories: [
                                            { name: "Sector 66 PO", types: ["160062"] },
                                            { name: "Kambali PO", types: ["160062"] }
                                        ]
                                    }
                                ]
                            },
                            {
                                name: "Sector 82",
                                subCategories: [
                                    {
                                        name: "Mohali Tehsil",
                                        subCategories: [
                                            { name: "Manakpur Kallar PO", types: ["140306"] }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        name: "Zirakpur",
                        subCategories: [
                            {
                                name: "VIP Road",
                                subCategories: [
                                    {
                                        name: "Dera Bassi Tehsil",
                                        subCategories: [
                                            { name: "Zirakpur PO", types: ["140603"] }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                name: "Haryana",
                subCategories: [
                    {
                        name: "Gurugram",
                        subCategories: [
                            {
                                name: "DLF Cyber City",
                                subCategories: [
                                    {
                                        name: "Gurgaon Tehsil",
                                        subCategories: [
                                            { name: "DLF QE PO", types: ["122002"] }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                name: "Chandigarh",
                subCategories: [
                    {
                        name: "Chandigarh",
                        subCategories: [
                            // Sectors 1-12 (North)
                            { name: "Sector 1", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 1 PO", types: ["160001"] }] }] },
                            { name: "Sector 2", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 2 PO", types: ["160001"] }] }] },
                            { name: "Sector 3", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 3 PO", types: ["160001"] }] }] },
                            { name: "Sector 4", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 4 PO", types: ["160001"] }] }] },
                            { name: "Sector 5", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 5 PO", types: ["160009"] }] }] },
                            { name: "Sector 6", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 6 PO", types: ["160001"] }] }] },
                            { name: "Sector 7", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 7 PO", types: ["160019"] }] }] },
                            { name: "Sector 8", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 8 PO", types: ["160009"] }] }] },
                            { name: "Sector 9", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 9 PO", types: ["160009"] }] }] },
                            { name: "Sector 10", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 10 PO", types: ["160011"] }] }] },
                            { name: "Sector 11", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 11 PO", types: ["160011"] }] }] },
                            { name: "Sector 12", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 12 PO", types: ["160012"] }] }] },

                            // Sectors 14-25 (Central/West)
                            { name: "Sector 14", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Panjab University PO", types: ["160014"] }] }] },
                            { name: "Sector 15", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 15 PO", types: ["160015"] }] }] },
                            { name: "Sector 16", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 16 PO", types: ["160015"] }] }] },
                            { name: "Sector 17", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 17 HO", types: ["160017"] }] }] },
                            { name: "Sector 18", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 18 PO", types: ["160018"] }] }] },
                            { name: "Sector 19", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 19 PO", types: ["160019"] }] }] },
                            { name: "Sector 20", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 20 PO", types: ["160020"] }] }] },
                            { name: "Sector 21", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 21 PO", types: ["160022"] }] }] },
                            { name: "Sector 22", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 22 PO", types: ["160022"] }] }] },
                            { name: "Sector 23", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 23 PO", types: ["160023"] }] }] },
                            { name: "Sector 24", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 24 PO", types: ["160023"] }] }] },
                            { name: "Sector 25", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 24 PO", types: ["160014"] }] }] },

                            // Sectors 26-38 (East/South)
                            { name: "Sector 26", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 26 PO", types: ["160019"] }] }] },
                            { name: "Sector 27", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 27 PO", types: ["160019"] }] }] },
                            { name: "Sector 28", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 28 PO", types: ["160002"] }] }] },
                            { name: "Sector 29", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 29 PO", types: ["160030"] }] }] },
                            { name: "Sector 30", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 30 PO", types: ["160030"] }] }] },
                            { name: "Sector 31", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 31 PO", types: ["160030"] }] }] },
                            { name: "Sector 32", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 32 PO", types: ["160030"] }] }] },
                            { name: "Sector 33", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 33 PO", types: ["160020"] }] }] },
                            { name: "Sector 34", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 34 PO", types: ["160022"] }] }] },
                            { name: "Sector 35", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 35 PO", types: ["160022"] }] }] },
                            { name: "Sector 36", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 36 PO", types: ["160036"] }] }] },
                            { name: "Sector 37", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 37 PO", types: ["160036"] }] }] },
                            { name: "Sector 38", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 38 PO", types: ["160014"] }] }] },

                            // Sectors 39-47
                            { name: "Sector 39", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 37 PO", types: ["160036"] }] }] },
                            { name: "Sector 40", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 40 PO", types: ["160036"] }] }] },
                            { name: "Sector 41", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 40 PO", types: ["160036"] }] }] },
                            { name: "Sector 42", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 36 PO", types: ["160036"] }] }] },
                            { name: "Sector 43", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 43 PO", types: ["160022"] }] }] },
                            { name: "Sector 44", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 44 PO", types: ["160047"] }] }] },
                            { name: "Sector 45", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 45 PO", types: ["160047"] }] }] },
                            { name: "Sector 46", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 46 PO", types: ["160047"] }] }] },
                            { name: "Sector 47", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 47 PO", types: ["160047"] }] }] },

                            // Other Areas
                            { name: "Manimajra", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Manimajra PO", types: ["160101"] }] }] },
                            { name: "Industrial Area Ph 1", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Ind. Area Ph-1 PO", types: ["160002"] }] }] },
                            { name: "Industrial Area Ph 2", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Ind. Area Ph-2 PO", types: ["160002"] }] }] },
                            { name: "Dhanas", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Dhanas PO", types: ["160014"] }] }] },
                            { name: "Hallo Majra", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Hallo Majra PO", types: ["160002"] }] }] },
                            { name: "Burail", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 45 PO", types: ["160047"] }] }] },
                            { name: "Dadumajra", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Sector 38 PO", types: ["160014"] }] }] },
                            { name: "Maloya", subCategories: [{ name: "Chandigarh", subCategories: [{ name: "Maloya PO", types: ["160025"] }] }] }
                        ]
                    }
                ]
            }
        ]
    }
};



// Initial Default Data for Profile Configuration (Titles, Docs, Education, etc.)
// Initial Default Data for Profile Configuration (Titles, Docs, Education, etc.)
const DEFAULT_PROFILE_CONFIG = {
    "Personal Details": {
        subCategories: [
            { name: "Titles", types: ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Er.", "Ar."] },
            { name: "Social Media", types: ["LinkedIn", "Facebook", "Twitter", "Instagram", "Website", "YouTube", "Pinterest", "Snapchat"] }
        ]
    },
    "Documents": {
        subCategories: [
            { name: "Identity Proof", types: ["Aadhar Card", "PAN Card", "Voter ID", "Passport", "Driving License"] },
            { name: "Address Proof", types: ["Ration Card", "Electricity Bill", "Water Bill", "Gas Connection Bill"] },
            {
                name: "Property Documents", types: [
                    "Sale Deed (Registry)", "Agreement to Sale (Biana)", "Power of Attorney (GPA/SPA)",
                    "Mutation (Intkal)", "Jamabandi (Fard)", "Possession Letter", "Allotment Letter",
                    "No Objection Certificate (NOC)", "Encumbrance Certificate (EC)", "Occupation Certificate (OC)",
                    "Completion Certificate (CC)", "Property Tax Receipt", "Khata/Khatauni"
                ]
            },
            { name: "Other", types: ["Other"] }
        ]
    },
    "Education History": {
        subCategories: [
            { name: "Doctorate", types: ["Ph.D", "M.Phil", "Pharm.D"] },
            { name: "Postgraduate", types: ["M.Tech", "M.Sc", "M.Com", "M.A.", "MBA", "MCA", "MD", "MS", "M.Pharma", "LLM", "M.Arch"] },
            { name: "Undergraduate", types: ["B.Tech", "B.E.", "B.Sc", "B.Com", "B.A.", "BBA", "BCA", "MBBS", "BDS", "B.Pharma", "LLB", "B.Arch", "B.Des"] },
            { name: "High School", types: ["10th Standard", "12th Standard (Science)", "12th Standard (Commerce)", "12th Standard (Arts)", "Diploma"] }
        ]
    },
    "Financial": {
        subCategories: [
            { name: "Income Sources", types: ['Salary', 'Business', 'Rental', 'Investment', 'Pension', 'Other'] },
            {
                name: "Loans", types: [
                    "State Bank of India (SBI)", "HDFC Bank", "ICICI Bank", "Punjab National Bank (PNB)", "Axis Bank",
                    "Bank of Baroda", "Canara Bank", "Union Bank of India", "Bank of India", "Kotak Mahindra Bank",
                    "IndusInd Bank", "Yes Bank", "IDFC First Bank", "Indian Bank", "Central Bank of India",
                    "Federal Bank", "Bank of Maharashtra", "UCO Bank", "Indian Overseas Bank", "Punjab & Sind Bank",
                    "Bandhan Bank", "RBL Bank", "City Union Bank", "Jammu & Kashmir Bank", "South Indian Bank",
                    "Karur Vysya Bank", "Tamilnad Mercantile Bank", "IDBI Bank", "Karnataka Bank", "Dhanlaxmi Bank"
                ]
            }
        ]
    },
    "Contact Method": {
        subCategories: [
            { name: "Mobile Types", types: ["Personal", "Official", "Home", "Work", "WhatsApp"] },
            { name: "Email Types", types: ["Personal", "Official"] }
        ]
    }
};

export const ContactConfigProvider = ({ children }) => {
    // Professional Configuration State
    const [professionalConfig, setProfessionalConfig] = useState(DEFAULT_PROFESSIONAL_CONFIG);

    // Address Configuration State
    const [addressConfig, setAddressConfig] = useState(DEFAULT_ADDRESS_CONFIG);

    // Profile Configuration State
    const [profileConfig, setProfileConfig] = useState(DEFAULT_PROFILE_CONFIG);

    // CRUD for Professional Config
    const updateProfessionalConfig = (newConfig) => {
        setProfessionalConfig(newConfig);
    };

    // CRUD for Address Config
    const updateAddressConfig = (newConfig) => {
        setAddressConfig(newConfig);
    };

    // CRUD for Profile Config
    const updateProfileConfig = (newConfig) => {
        setProfileConfig(newConfig);
    };

    return (
        <ContactConfigContext.Provider value={{
            professionalConfig,
            updateProfessionalConfig,
            addressConfig,
            updateAddressConfig,
            profileConfig,
            updateProfileConfig
        }}>
            {children}
        </ContactConfigContext.Provider>
    );
};
