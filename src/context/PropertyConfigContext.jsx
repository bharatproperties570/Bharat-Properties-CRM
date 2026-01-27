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

    // Master Fields State (Property Specific)
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
        ]
    });

    // Project Master Fields (Moved/Copied from Property)
    const [projectMasterFields, setProjectMasterFields] = useState({
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
        images: [
            'Front View', 'Bedroom', 'Kitchen', 'Washroom', 'Map'
        ],
        videos: [
            'Walkthrough', 'Drone View', 'Interior Tour'
        ]
    });

    // Dynamic Amenities Configuration
    const [projectAmenities, setProjectAmenities] = useState({
        'Basic': [
            { id: 'bp1', name: 'Car Parking', icon: 'fa-car' },
            { id: 'bp2', name: 'Intercom', icon: 'fa-phone-alt' },
            { id: 'bp3', name: 'Multi-Purpose Hall', icon: 'fa-users' },
            { id: 'bp4', name: '24x7 Water Supply', icon: 'fa-tint' },
            { id: 'bp5', name: 'Municipal Water Supply', icon: 'fa-faucet' },
            { id: 'bp6', name: 'Garbage Management System', icon: 'fa-trash-alt' },
            { id: 'bp7', name: 'Fire Fighting System', icon: 'fa-fire-extinguisher' },
            { id: 'bp8', name: 'Visitor Car Parking', icon: 'fa-car-side' },
            { id: 'bp9', name: 'Earthquake Resistance', icon: 'fa-house-damage' },
            { id: 'bp10', name: 'Lift', icon: 'fa-elevator' },
            { id: 'bp11', name: 'Maintenance Staff', icon: 'fa-concierge-bell' },
            { id: 'bp12', name: 'Power Supply', icon: 'fa-bolt' },
            { id: 'bp13', name: 'Air Condition', icon: 'fa-snowflake' },
            { id: 'bp14', name: 'Security', icon: 'fa-shield-alt' },
            { id: 'bp15', name: 'Bike Parking', icon: 'fa-motorcycle' }
        ],
        'Featured': [
            { id: 'fp1', name: 'Club House', icon: 'fa-glass-cheers' },
            { id: 'fp2', name: 'Gymnasium', icon: 'fa-dumbbell' },
            { id: 'fp3', name: 'Swimming Pool', icon: 'fa-swimming-pool' },
            { id: 'fp4', name: 'Garden', icon: 'fa-leaf' },
            { id: 'fp5', name: 'Jogging Track', icon: 'fa-running' },
            { id: 'fp6', name: 'Kids Play Area', icon: 'fa-child' },
            { id: 'fp7', name: 'Yoga And Meditation Center', icon: 'fa-om' },
            { id: 'fp8', name: 'Library', icon: 'fa-book' },
            { id: 'fp9', name: 'Spa & Saloon', icon: 'fa-spa' },
            { id: 'fp10', name: 'Indoor Games', icon: 'fa-chess' }
        ],
        'Nearby': [
            { id: 'np1', name: 'School', icon: 'fa-school' },
            { id: 'np2', name: 'Hospital', icon: 'fa-hospital' },
            { id: 'np3', name: 'Metro Station', icon: 'fa-subway' },
            { id: 'np4', name: 'Shopping Mall', icon: 'fa-shopping-bag' },
            { id: 'np5', name: 'Market', icon: 'fa-store' },
            { id: 'np6', name: 'Airport', icon: 'fa-plane' }
        ]
    });

    // Ensure new fields are added to state even if persisted (HMR/Storage fix)
    React.useEffect(() => {
        // ... (Logic to sync defaults if needed, simplified for clarity as we are hardcoding defaults above)
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

    const updateProjectMasterFields = (field, newValues) => {
        setProjectMasterFields(prev => ({
            ...prev,
            [field]: newValues
        }));
    };

    const updateProjectAmenities = (category, newAmenities) => {
        setProjectAmenities(prev => ({
            ...prev,
            [category]: newAmenities
        }));
    };

    // Company Master Fields
    const [companyMasterFields, setCompanyMasterFields] = useState({
        companyTypes: [
            'Private Limited', 'Public Limited', 'LLP', 'Sole Proprietorship', 'Partnership', 'One Person Company'
        ],
        industries: [
            'Real Estate', 'Construction', 'Architecture', 'Interior Design', 'Legal', 'Finance', 'Consultancy'
        ]
    });

    const updateCompanyMasterFields = (field, newValues) => {
        setCompanyMasterFields(prev => ({
            ...prev,
            [field]: newValues
        }));
    };

    // Lead & Campaign Master Fields
    const [leadMasterFields, setLeadMasterFields] = useState({
        transactionTypes: ['Collector Rate', 'Full White', 'Flexible'],
        fundingTypes: ['Home Loan', 'Self Funding', 'Loan Against Property', 'Personal Loan', 'Business Loan'],
        furnishingStatuses: ['Unfurnished', 'Semi-Furnished', 'Fully-Furnished'],
        timelines: ['Immediate', 'Within 3 Months', 'Within 6 Months', 'More than 6 Months'],
        campaigns: [
            {
                name: 'Organic Campaign',
                sources: [
                    { name: 'Walk-in', mediums: ['Store Visit', 'Front Desk'] },
                    { name: 'Referral', mediums: ['Client Referral', 'Employee Referral', 'Partner Referral'] },
                    { name: 'Website', mediums: ['Contact Form', 'Chatbot', 'Direct Call'] }
                ]
            },
            {
                name: 'Online Campaign',
                sources: [
                    { name: 'Facebook', mediums: ['Lead Form', 'Messenger', 'Comment', 'Post', 'Marketplace'] },
                    { name: 'Instagram', mediums: ['DM', 'Story Reply', 'Ad Click', 'Bio Link'] },
                    { name: 'Google Ads', mediums: ['Search Ad', 'Display Ad', 'YouTube Ad'] },
                    { name: 'LinkedIn', mediums: ['InMail', 'Post', 'Lead Gen Form'] }
                ]
            },
            {
                name: 'Offline Campaign',
                sources: [
                    { name: 'Cold Call', mediums: ['Database 1', 'Database 2'] },
                    { name: 'Newspaper Ad', mediums: ['Times of India', 'Hindustan Times'] },
                    { name: 'Hoarding', mediums: ['Sector 18', 'Main Highway'] }
                ]
            }
        ]
    });

    // Scoring Attributes State (Static Weights)
    const [scoringAttributes, setScoringAttributes] = useState({
        requirement: { label: 'Detailed Requirement', points: 32 },
        budget: { label: 'Budget Match', points: 10 },
        location: { label: 'Location Match', points: 10 },
        timeline: { label: 'Timeline Urgency', points: 10 },
        payment: { label: 'Payment Flexibility', points: 10 },
        source: { label: 'High Intent Source', points: 5 }
    });

    const updateScoringAttributes = (newAttributes) => {
        setScoringAttributes(prev => ({ ...prev, ...newAttributes }));
    };

    const updateLeadMasterFields = (field, newValues) => {
        setLeadMasterFields(prev => ({
            ...prev,
            [field]: newValues
        }));
    };

    // Activity Master Fields (Hierarchical: Activity -> Purpose -> Outcome { label, score })
    const [activityMasterFields, setActivityMasterFields] = useState({
        activities: [
            {
                name: 'Call',
                purposes: [
                    {
                        name: 'Introduction / First Contact',
                        outcomes: [
                            { label: 'Connected', score: 10 },
                            { label: 'Not Reachable', score: -2 },
                            { label: 'Wrong Number', score: -10 },
                            { label: 'Callback Requested', score: 5 },
                            { label: 'Busy', score: 0 }
                        ]
                    },
                    {
                        name: 'Requirement Gathering',
                        outcomes: [
                            { label: 'Requirements Shared', score: 15 },
                            { label: 'Partial Info', score: 8 },
                            { label: 'Refused to Share', score: -5 },
                            { label: 'Rescheduled', score: 0 }
                        ]
                    },
                    {
                        name: 'Follow-up',
                        outcomes: [
                            { label: 'Still Interested', score: 10 },
                            { label: 'Ready for Visit', score: 20 },
                            { label: 'Negotiation Mode', score: 12 },
                            { label: 'Lost Interest', score: -10 },
                            { label: 'No Response', score: -5 }
                        ]
                    },
                    {
                        name: 'Negotiation',
                        outcomes: [
                            { label: 'Offer Accepted', score: 50 },
                            { label: 'Offer Rejected', score: -20 },
                            { label: 'Counter Offer Made', score: 10 },
                            { label: 'Decision Pending', score: 0 }
                        ]
                    },
                    {
                        name: 'Post-Visit Feedback',
                        outcomes: [
                            { label: 'Liked Property', score: 25 },
                            { label: 'Disliked - Price', score: -5 },
                            { label: 'Disliked - Location', score: -5 },
                            { label: 'Thinking/Hold', score: 0 },
                            { label: 'Booking Request', score: 40 }
                        ]
                    },
                    {
                        name: 'Payment Reminder',
                        outcomes: [
                            { label: 'Payment Promised', score: 5 },
                            { label: 'Already Paid', score: 0 },
                            { label: 'Dispute', score: -10 },
                            { label: 'Extension Requested', score: -2 }
                        ]
                    }
                ]
            },
            {
                name: 'Meeting',
                purposes: [
                    {
                        name: 'Initial Consultation',
                        outcomes: [
                            { label: 'Qualified', score: 15 },
                            { label: 'Need More Time', score: 5 },
                            { label: 'Not Qualified', score: -10 },
                            { label: 'Rescheduled', score: 0 }
                        ]
                    },
                    {
                        name: 'Project Presentation',
                        outcomes: [
                            { label: 'Impressed', score: 20 },
                            { label: 'Neutral', score: 5 },
                            { label: 'Skeptical', score: -5 },
                            { label: 'Requested Site Visit', score: 25 }
                        ]
                    },
                    {
                        name: 'Price Negotiation',
                        outcomes: [
                            { label: 'Deal Closed', score: 100 },
                            { label: 'Stalemate', score: 0 },
                            { label: 'Discount Approved', score: 10 },
                            { label: 'Walk-away', score: -50 }
                        ]
                    },
                    {
                        name: 'Document Collection',
                        outcomes: [
                            { label: 'All Collected', score: 10 },
                            { label: 'Partial', score: 5 },
                            { label: 'Pending', score: 0 },
                            { label: 'Issues Found', score: -5 }
                        ]
                    },
                    {
                        name: 'Final Closing',
                        outcomes: [
                            { label: 'Signed', score: 100 },
                            { label: 'Reviewing Draft', score: 10 },
                            { label: 'Postponed', score: -5 },
                            { label: 'Cancelled', score: -50 }
                        ]
                    }
                ]
            },
            {
                name: 'Site Visit',
                purposes: [
                    {
                        name: 'First Visit (Solo)',
                        outcomes: [
                            { label: 'Very Interested', score: 30 },
                            { label: 'Somewhat Interested', score: 15 },
                            { label: 'Not Interested', score: -20 },
                            { label: 'Price Issue', score: -10 }
                        ]
                    },
                    {
                        name: 'Re-Visit (With Family)',
                        outcomes: [
                            { label: 'Shortlisted', score: 40 },
                            { label: 'Family Liked', score: 35 },
                            { label: 'Family Disliked', score: -20 },
                            { label: 'Need Consensus', score: 10 }
                        ]
                    },
                    {
                        name: 'Unit Selection',
                        outcomes: [
                            { label: 'Unit Blocked', score: 50 },
                            { label: 'Unit Not Available', score: -5 },
                            { label: 'Changed Preference', score: 0 },
                            { label: 'Thinking', score: 5 }
                        ]
                    },
                    {
                        name: 'Competitor Comparison',
                        outcomes: [
                            { label: 'Favors Us', score: 20 },
                            { label: 'Favors Competitor', score: -20 },
                            { label: 'Undecided', score: 0 }
                        ]
                    }
                ]
            },
            {
                name: 'Email',
                purposes: [
                    {
                        name: 'Introductory / Welcome',
                        outcomes: [
                            { label: 'Opened', score: 5 },
                            { label: 'Clicked', score: 8 },
                            { label: 'Bounced', score: -5 },
                            { label: 'No Action', score: 0 }
                        ]
                    },
                    {
                        name: 'Property Proposal',
                        outcomes: [
                            { label: 'Interested', score: 15 },
                            { label: 'Request Breakdown', score: 10 },
                            { label: 'Too Expensive', score: -5 },
                            { label: 'Unsubscribe', score: -10 }
                        ]
                    },
                    {
                        name: 'Newsletter',
                        outcomes: [
                            { label: 'Engagement', score: 3 },
                            { label: 'Ignored', score: 0 },
                            { label: 'Unsubscribed', score: -3 }
                        ]
                    },
                    {
                        name: 'Payment Invoice',
                        outcomes: [
                            { label: 'Paid', score: 20 },
                            { label: 'Viewed', score: 2 },
                            { label: 'Overdue', score: -10 }
                        ]
                    },
                    {
                        name: 'Seasonal Greeting',
                        outcomes: [
                            { label: 'Appreciated', score: 5 },
                            { label: 'No Response', score: 0 }
                        ]
                    }
                ]
            },
            {
                name: 'Task',
                purposes: [
                    {
                        name: 'General Task',
                        outcomes: [
                            { label: 'Completed', score: 10 },
                            { label: 'Deferred', score: 0 },
                            { label: 'Cancelled', score: -5 },
                            { label: 'Partially Completed', score: 5 }
                        ]
                    }
                ]
            }
        ]
    });

    // Property Sizes State (Moved from PropertySettingsPage)
    const [sizes, setSizes] = useState([
        { id: 1, project: 'DLF Cyber City', block: 'Building 8', category: 'Residential', subCategory: 'Flat/Apartment / Builder Floor', name: '3 BHK (1200 Sq Ft)', sizeType: '3 BHK', saleableArea: '1200', description: 'Sample Entry' }
    ]);

    const addSize = (newSize) => {
        setSizes(prev => [...prev, { ...newSize, id: Date.now() }]);
    };

    const updateSize = (updatedSize) => {
        setSizes(prev => prev.map(s => s.id === updatedSize.id ? updatedSize : s));
    };

    const deleteSize = (id) => {
        setSizes(prev => prev.filter(s => s.id !== id));
    };

    const updateActivityMasterFields = (newActivities) => {
        setActivityMasterFields({ activities: newActivities });
    };

    return (
        <PropertyConfigContext.Provider value={{
            propertyConfig,
            updateConfig,
            masterFields,
            updateMasterFields,
            projectMasterFields,
            updateProjectMasterFields,
            projectAmenities,
            updateProjectAmenities,
            sizes,
            addSize,
            updateSize,
            deleteSize,
            companyMasterFields,
            updateCompanyMasterFields,
            leadMasterFields,
            updateLeadMasterFields,
            activityMasterFields,
            updateActivityMasterFields,
            scoringAttributes,
            updateScoringAttributes
        }}>
            {children}
        </PropertyConfigContext.Provider>
    );
};
