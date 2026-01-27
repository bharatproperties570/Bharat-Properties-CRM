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
        // Campaign Fields
        // Campaign Hierarchy: Campaign Name -> Source -> Medium
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

    const updateLeadMasterFields = (field, newValues) => {
        setLeadMasterFields(prev => ({
            ...prev,
            [field]: newValues
        }));
    };

    // Activity Master Fields (Hierarchical: Activity -> Purpose -> Outcome)
    const [activityMasterFields, setActivityMasterFields] = useState({
        activities: [
            {
                name: 'Call',
                purposes: [
                    { name: 'Introduction / First Contact', outcomes: ['Connected', 'Not Reachable', 'Wrong Number', 'Callback Requested', 'Busy'] },
                    { name: 'Requirement Gathering', outcomes: ['Requirements Shared', 'Partial Info', 'Refused to Share', 'Rescheduled'] },
                    { name: 'Follow-up', outcomes: ['Still Interested', 'Ready for Visit', 'Negotiation Mode', 'Lost Interest', 'No Response'] },
                    { name: 'Negotiation', outcomes: ['Offer Accepted', 'Offer Rejected', 'Counter Offer Made', 'Decision Pending'] },
                    { name: 'Post-Visit Feedback', outcomes: ['Liked Property', 'Disliked - Price', 'Disliked - Location', 'Thinking/Hold', 'Booking Request'] },
                    { name: 'Payment Reminder', outcomes: ['Payment Promised', 'Already Paid', 'Dispute', 'Extension Requested'] }
                ]
            },
            {
                name: 'Meeting',
                purposes: [
                    { name: 'Initial Consultation', outcomes: ['Qualified', 'Need More Time', 'Not Qualified', 'Rescheduled'] },
                    { name: 'Project Presentation', outcomes: ['Impressed', 'Neutral', 'Skeptical', 'Requested Site Visit'] },
                    { name: 'Price Negotiation', outcomes: ['Deal Closed', 'Stalemate', 'Discount Approved', 'Walk-away'] },
                    { name: 'Document Collection', outcomes: ['All Collected', 'Partial', 'Pending', 'Issues Found'] },
                    { name: 'Final Closing', outcomes: ['Signed', 'Reviewing Draft', 'Postponed', 'Cancelled'] }
                ]
            },
            {
                name: 'Site Visit',
                purposes: [
                    { name: 'First Visit (Solo)', outcomes: ['Very Interested', 'Somewhat Interested', 'Not Interested', 'Price Issue'] },
                    { name: 'Re-Visit (With Family)', outcomes: ['Shortlisted', 'Family Liked', 'Family Disliked', 'Need Consensus'] },
                    { name: 'Unit Selection', outcomes: ['Unit Blocked', 'Unit Not Available', 'Changed Preference', 'Thinking'] },
                    { name: 'Competitor Comparison', outcomes: ['Favors Us', 'Favors Competitor', 'Undecided'] }
                ]
            },
            {
                name: 'Email',
                purposes: [
                    { name: 'Introductory / Welcome', outcomes: ['Opened', 'Clicked', 'Bounced', 'No Action'] },
                    { name: 'Property Proposal', outcomes: ['Interested', 'Request Breakdown', 'Too Expensive', 'Unsubscribe'] },
                    { name: 'Newsletter', outcomes: ['Engagement', 'Ignored', 'Unsubscribed'] },
                    { name: 'Payment Invoice', outcomes: ['Paid', 'Viewed', 'Overdue'] },
                    { name: 'Seasonal Greeting', outcomes: ['Appreciated', 'No Response'] }
                ]
            }
        ]
    });

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
            companyMasterFields,
            updateCompanyMasterFields,
            leadMasterFields,
            updateLeadMasterFields,
            activityMasterFields,
            updateActivityMasterFields
        }}>
            {children}
        </PropertyConfigContext.Provider>
    );
};
