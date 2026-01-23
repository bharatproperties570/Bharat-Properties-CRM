export const leadData = [
    {
        name: 'Mr. Intiyaz A Ali',
        mobile: '9898989898',
        req: { type: 'Buy Residential Plot', size: '1 Kanal, 14 Marla' },
        detailedReq: {
            propertyType: true, subType: true, unitType: true, area: true,
            facing: true, road: true, direction: true, propertyUnitType: true
        },
        budget: '₹1,00,00,000 - ₹1,50,00,000',
        budgetMatch: 'perfect',
        location: 'Sector 4, Sector 6, Bharat Nagar',
        locationPref: 'level1',
        timeline: 'urgent',
        payment: ['self', 'white', 'collector'],
        source: 'Walk-In',
        activities: [
            { type: 'CONNECTED_CALL', date: '2026-01-22' },
            { type: 'VISIT_COMPLETED', date: '2026-01-21' }
        ],
        owner: 'Suraj Keshwar (Sales)',
        activity: '2 Calls',
        lastAct: 'Today',
        remarks: 'int.',
        isConverted: true,
        contactId: '9898989898',
        addOn: '05/11/24<br>07:30:02'
    },
    {
        name: 'Dr. Digvijay Kumar',
        mobile: '07047752734',
        req: { type: 'Rent Commercial Shop', size: 'Booth, SCO, DSS' },
        detailedReq: {
            propertyType: true, subType: true, unitType: true, area: true,
            facing: false, road: true, direction: false, propertyUnitType: false
        },
        budget: '₹40,00,000 - ₹50,00,000',
        budgetMatch: 'slightly_lower',
        location: 'Sector 17, Kurukshetra',
        locationPref: 'level2',
        timeline: '15days',
        payment: ['loan', 'flexible'],
        source: 'Google',
        activities: [
            { type: 'CONNECTED_CALL', date: '2026-01-20' },
            { type: 'WHATSAPP_REPLY', date: '2026-01-19' }
        ],
        owner: 'Sukram Singh (Sales)',
        activity: '2 Calls',
        lastAct: '1 Days Before',
        remarks: 'int. in comm',
        addOn: '07/11/24<br>11:23:03'
    },
    {
        name: 'Mr. Vijay Kumar',
        mobile: '9812312345',
        req: { type: 'Buy, Agriculture Land', size: '' },
        detailedReq: {
            propertyType: true, subType: true, unitType: false, area: true,
            facing: false, road: false, direction: false, propertyUnitType: false
        },
        budget: '₹40,00,000 - ₹50,00,000',
        budgetMatch: 'mismatch',
        location: 'Vill Umri, Kurukshetra',
        locationPref: 'level3',
        timeline: '1month',
        payment: ['loan'],
        source: 'Reference',
        activities: [
            { type: 'CONNECTED_CALL', date: '2026-01-15' }
        ],
        owner: 'Suraj Keshwar (Sales)',
        activity: '2 Calls',
        lastAct: '5 Days Before',
        remarks: 'land in kkr',
        addOn: '10/08/24'
    }
];

export const contactData = [
    {
        name: 'Mr. Naveen Kumar',
        mobile: '9468081966',
        email: 'naveen.k@gmail.com',
        address: 'Sector 17, Chandigarh',
        professional: 'Corporate',
        designation: 'Project Manager',
        company: 'Tech Solutions Ltd',
        tags: 'High Priority',
        source: 'Walk-In',
        lastComm: 'Called today at 10 AM',
        actionable: 'Follow up',
        ownership: 'Suraj (Sales)',
        addOnDate: '11/01/2026',
        addOnTime: '5:04:00 PM',
        group: 'January 2026',
        icon: 'fa-user',
        crmLinks: { leads: 2, deals: 1, activities: 3 },
        category: 'Customer',
        professionSubCategory: 'Sales Person',
        activities: [
            {
                activityType: 'Call',
                subject: 'Follow up on Sector 17 Plot',
                status: 'Completed',
                dueDate: '2026-01-20',
                completionResult: 'Interested',
                clientFeedback: 'Client wants to see the plot again on Sunday.'
            },
            {
                activityType: 'Meeting',
                subject: 'Price Negotiation',
                status: 'Overdue',
                dueDate: '2026-01-18',
                notes: 'Need to discuss final discount.'
            },
            {
                activityType: 'Task',
                subject: 'Send PPT for Bharat Nagar',
                status: 'Upcoming',
                dueDate: '2026-01-25'
            }
        ],
        conversionMeta: {
            date: '10/01/2026',
            scoreAtConversion: 92,
            source: 'Walk-In',
            trigger: 'Rule B: High Intent Action'
        },
        documents: [
            { documentName: 'ID Proof', documentNo: 'ABCD1234E', documentPicture: { name: 'aadhar_card.jpg' } },
            { documentName: 'Address Proof', documentNo: '9876543210', documentPicture: { name: 'utility_bill.pdf' } }
        ]
    },
    {
        name: 'Mr. Pawan Kumar',
        mobile: '9466937965',
        email: 'pawankumar@outlook.com',
        address: 'Panchkula, Haryana',
        professional: 'Legal',
        designation: 'Corporate Lawyer',
        company: 'Kumar & Associates',
        tags: '-',
        source: 'Whatsapp',
        lastComm: 'Message sent yesterday',
        actionable: 'Send Brochure',
        ownership: 'Suraj (Sales)',
        addOnDate: '11/01/2026',
        addOnTime: '3:59:32 PM',
        group: 'January 2026',
        icon: 'fa-user',
        crmLinks: { property: 1, booking: 1 },
        category: 'Prospect'
    },
    {
        name: 'Mr. Deepak Bhardwaj',
        mobile: '9467238581',
        email: 'deepaknrww@gmail.com',
        address: 'Narwana Jind, Haryana',
        professional: 'IT',
        designation: 'Software Engineer',
        company: 'Infosys',
        tags: 'Interested',
        source: 'Facebook',
        lastComm: 'Meeting scheduled',
        actionable: 'Internal Discussion',
        ownership: 'Suraj (Sales)',
        addOnDate: '11/01/2026',
        addOnTime: '3:40:44 PM',
        group: 'January 2026',
        icon: 'fa-user',
        crmLinks: { leads: 1, deals: 1, property: 2, activities: 1 },
        category: 'Customer'
    },
    {
        name: 'Mr. Raghbir Maan',
        mobile: '8901550334',
        email: 'raghbir.maan@yahoo.com',
        address: '36 Urban Estate Kurukshetra',
        professional: 'Business',
        designation: 'Business Owner',
        company: 'Maan Enterprises',
        tags: 'VIP',
        source: 'Walkin',
        lastComm: 'No communication yet',
        actionable: '-',
        ownership: 'Suraj (Sales)',
        addOnDate: '06/01/2026',
        addOnTime: '6:26:29 PM',
        group: 'January 2026',
        icon: 'fa-user',
        crmLinks: {},
        category: 'Real Estate Agent',
        professionSubCategory: 'Real Estate Agent'
    },
    {
        name: 'Mrs. Manpreet Kaur',
        mobile: '7009550400',
        email: 'manpreetsaini75@gmail.com',
        address: 'Zirakpur 140306',
        professional: 'Marketing',
        designation: 'Marketing Head',
        company: 'Saini Marketing Dept',
        tags: 'Warm Lead',
        source: '99 Acre',
        lastComm: 'Voice call 2 days ago',
        actionable: '-',
        ownership: 'Suraj Keshwar (Sales)',
        addOnDate: '06/01/2026',
        addOnTime: '12:04:09 PM',
        group: 'January 2026',
        icon: 'fa-user',
        crmLinks: { project: 1, activities: 2 },
        category: 'Prospect',
        activities: [
            {
                activityType: 'Email',
                subject: 'Brochure Sent',
                status: 'Completed',
                dueDate: '2026-01-15',
                completionResult: 'Sent',
                clientFeedback: 'Acknowledged receipt.'
            },
            {
                activityType: 'Call',
                subject: 'Initial Query Handling',
                status: 'Upcoming',
                dueDate: '2026-01-24'
            }
        ],
        documents: [
            { documentName: 'ID Proof', documentNo: 'PAN998877', documentPicture: { name: 'pan_card.jpg' } }
        ]
    }
];

export const mockCampaigns = {
    online: [
        { id: 1, name: 'Google Ads Q1', source: 'Google', campaigns: 'G-772', leads: 432, date: '10/01/2026' },
        { id: 2, name: 'Facebook Brand', source: 'FB', campaigns: 'FB-992', leads: 215, date: '08/01/2026' },
        { id: 3, name: 'Instagram Influencer', source: 'IG', campaigns: 'IG-112', leads: 156, date: '05/01/2026' },
        { id: 4, name: 'Retargeting Campaign', source: 'Google', campaigns: 'G-882', leads: 326, date: '02/01/2026' }
    ],
    offline: [
        { id: 1, name: 'BillBoard Sec 14', desc: 'Main Road Billboard', contact: '8882229990', event: 'Physical', status: 'Active', cost: '₹50,000', delivered: '12/01/2026', created: '01/01/2026' },
        { id: 2, name: 'SMS Blast - Jan', desc: 'January Property Update', contact: 'SMS-Bulk', event: 'SMS', status: 'Sent', cost: '₹5,000', delivered: '10/01/2026', created: '05/01/2026' },
        { id: 3, name: 'Call Center Outbound', desc: 'Calling old leads', contact: 'Call-Team', event: 'Call', status: 'In-Progress', cost: '₹15,000', delivered: '-', created: '08/01/2026' }
    ],
    organic: [
        { id: 1, name: 'Weekly Newsletter', source: 'Email', date: '12/01/2026' },
        { id: 2, name: 'YouTube Walkthrough', source: 'YT', date: '10/01/2026' },
        { id: 3, name: 'Blog: Top Properties', source: 'Website', date: '05/01/2026' }
    ]
};

export const ivrOptions = {
    numbers: [
        { id: 1, label: 'Sales Line', number: '+91 8000 123 456' },
        { id: 2, label: 'Support Line', number: '+91 8000 987 654' }
    ],
    flows: [
        { id: 'sales', label: 'Sales Flow' },
        { id: 'support', label: 'Support Flow' },
        { id: 'followup', label: 'Follow-up Flow' }
    ],
    agents: [
        { id: 'self', label: 'Self (Suraj)' },
        { id: 'roundrobin', label: 'Round Robin' }
    ]
};

export const users = [
    { id: 'u1', name: 'Suraj Keshwar', role: 'Sales Manager', avatar: 'SK', availability: 'Available' },
    { id: 'u2', name: 'Amit Sharma', role: 'Sales Executive', avatar: 'AS', availability: 'In Meeting' },
    { id: 'u3', name: 'Priya Singh', role: 'Support Agent', avatar: 'PS', availability: 'Available' },
    { id: 'u4', name: 'Rahul Verma', role: 'Field Agent', avatar: 'RV', availability: 'Offline' },
    { id: 'u5', name: 'Vikram Singh', role: 'Senior Manager', avatar: 'VS', availability: 'Available' }
];

export const suggestedTags = [
    'Hot Lead', 'Investor', 'Nurture', 'VIP', 'High Budget', 'Immediate Buys', 'NRI Client', 'Referral', 'Follow-up Required'
];

export const inventoryData = [
    {
        id: 1,
        unitNo: '1',
        corner: 'Corner',
        type: 'Plot(Residential)',
        size: '4 Marla (100.00 Sq Yard)',
        location: 'A Block',
        area: 'Sector 66 Beta (IT City) Mohali',
        direction: 'South East',
        facing: 'Dividing Road',
        road: '100 Ft. Road',
        status: 'Active',
        ownerName: 'Mr. Vijay Kumar',
        ownerPhone: '9878299954',
        ownerAddress: 'Vpo Lahra Gagga Samana, Patiala Punjab 147101, Near Main Chowk, Opposite Royal Garden, Block C, Street 12',
        associatedContact: 'Amit Sharma',
        associatedPhone: '9876543210',
        remarks: 'Interested For Sale',
        followUp: '-',
        lastContactDate: '12/6/2025',
        lastContactTime: '2:43 PM',
        lastContactUser: 'Admin',
        lat: 30.6695,
        lng: 76.7112
    },
    {
        id: 2,
        unitNo: '1',
        corner: 'Three Side Open',
        type: 'School(Institutional)',
        size: '18814.76 Sq Yard',
        location: 'Third Block',
        area: 'Sector 4 Kurukshetra',
        direction: 'South',
        facing: 'Mandir',
        road: '24 Mtr Wide',
        status: 'Active',
        ownerName: 'Mr. VINOD RAWAL',
        ownerPhone: '9812501234',
        ownerAddress: '457 Urban Estate Sector 13, Kurukshetra Haryana 136118, Behind Government College, Flat No 22, Sector 13 Extension',
        associatedContact: 'Deepak Gupta',
        associatedPhone: '9416012345',
        remarks: 'No -But wants to buy another property',
        followUp: '-',
        lastContactDate: '12/22/2025',
        lastContactTime: '10:27 AM',
        lastContactUser: 'Admin',
        lat: 29.9691,
        lng: 76.8406
    },
    {
        id: 3,
        unitNo: '1',
        corner: 'Ordinary',
        type: 'Shop(Residential)',
        size: '-',
        location: 'First Block',
        area: 'Sector 8 Kurukshetra',
        direction: '-',
        facing: '-',
        road: '-',
        status: 'Active',
        ownerName: 'Mr. Satish Sharma',
        ownerPhone: '9812234567',
        ownerAddress: 'Shop No 12, Main Market, Sector 8 Kurukshetra, Haryana, Near Railway Station Road',
        associatedContact: 'Rahul Vats',
        associatedPhone: '9896054321',
        remarks: 'Call Not Picked',
        followUp: '-',
        lastContactDate: '11/29/2025',
        lastContactTime: '9:32 PM',
        lastContactUser: 'Varun Saini',
        lat: 29.9642,
        lng: 76.8258
    },
    {
        id: 4,
        unitNo: '1 SP',
        corner: 'Corner',
        type: 'Plot(Residential)',
        size: '1 Kanal (623.59 Sq Yard)',
        location: 'First Block',
        area: 'Sector 3 Kurukshetra',
        direction: 'North',
        facing: 'Green Belt',
        road: '9 Mtr Wide',
        status: 'Active',
        ownerName: 'Mr. SATWANTI',
        ownerPhone: '941212937',
        ownerAddress: '49 Urban Estate Sector 14, Rohtak Haryana 124001, Near Civil Hospital, House No 45A, Park View Apartment',
        associatedContact: 'Vikram Singh',
        associatedPhone: '9991122334',
        remarks: 'Not Interested',
        followUp: '-',
        lastContactDate: '01/05/2026',
        lastContactTime: '11:15 AM',
        lastContactUser: 'Admin',
        lat: 29.9754,
        lng: 76.8123
    },
    {
        id: 5,
        unitNo: '1 P',
        corner: 'Ordinary',
        type: 'Showroom(Commercial)',
        size: 'DSS (94.56 Sq Yard)',
        location: 'Huda Market',
        area: 'Sector 4 Kurukshetra',
        direction: 'East',
        facing: 'Parking',
        road: '9 Mtr Wide',
        status: 'Active',
        ownerName: 'Mr. Akshay Kumar',
        ownerPhone: '7015484257',
        ownerAddress: 'Ekta Vihar, Kurukshetra Haryana 136118, Near Park Main Gate, Lane 3, House 102',
        associatedContact: 'Sanjay Dutt',
        associatedPhone: '8816077889',
        remarks: '',
        followUp: '-',
        lastContactDate: '01/12/2026',
        lastContactTime: '4:20 PM',
        lastContactUser: 'Varun Saini',
        lat: 29.9700,
        lng: 76.8200
    },
    {
        id: 6,
        unitNo: '1 SP',
        corner: 'Corner',
        type: 'House(Residential)',
        size: '10 Marla (233.12 Sq Yard)',
        location: 'Fourth Block',
        area: 'Sector 4 Kurukshetra',
        direction: 'South',
        facing: 'Green Belt',
        road: '9 Mtr Wide',
        status: 'Inactive',
        ownerName: 'Smt. Kamlesh Devi',
        ownerPhone: '981224230',
        ownerAddress: 'Teh Thanesar Vpo Mathana, Kurukshetra Haryana 136131, Ward 15, Street 2',
        associatedContact: 'Monu Kumar',
        associatedPhone: '9034567890',
        remarks: '',
        followUp: '-',
        lastContactDate: '01/08/2026',
        lastContactTime: '9:45 AM',
        lastContactUser: 'Admin',
        lat: 29.9650,
        lng: 76.8300
    },
    {
        id: 7,
        unitNo: '13',
        corner: 'Ordinary',
        type: 'Residential Plot',
        size: 'Sector 13 Kurukshetra',
        location: 'Sector 13',
        area: 'Kurukshetra, Haryana',
        direction: '-',
        facing: '-',
        road: '-',
        status: 'Active',
        ownerName: 'Admin Post',
        ownerPhone: '9000000000',
        ownerAddress: 'VPO Mathana, Kurukshetra, Haryana 136131, Block A, Plot 50',
        associatedContact: 'Bharat Properties',
        associatedPhone: '9988776655',
        remarks: 'Verified Listing',
        followUp: '-',
        lastContactDate: '1/10/2026',
        lastContactTime: '11:00 AM',
        lastContactUser: 'Admin',
        lat: 29.9720,
        lng: 76.8450
    },
    {
        id: 8,
        unitNo: '45',
        corner: 'Ordinary',
        type: 'Residential Plot',
        size: '1 Kanal',
        location: 'Sector 17',
        area: 'Kurukshetra, Haryana',
        direction: 'East',
        facing: 'Park',
        road: '12 Mtr',
        status: 'Active',
        ownerName: 'Mr. Naveen Kumar',
        ownerPhone: '9468081966',
        ownerEmail: 'naveen.k@gmail.com',
        ownerAddress: 'Sector 17, Chandigarh',
        associatedContact: 'Suraj (Sales)',
        associatedPhone: '9988776655',
        remarks: 'Direct Owner',
        followUp: '-',
        lastContactDate: '1/20/2026',
        lastContactTime: '10:00 AM',
        lastContactUser: 'Admin'
    },
    {
        id: 9,
        unitNo: '12A',
        corner: 'Corner',
        type: 'Commercial SCO',
        size: '120 Sq Yard',
        location: 'Sector 17 Market',
        area: 'Kurukshetra, Haryana',
        direction: 'North',
        facing: 'Main Road',
        road: '24 Mtr',
        status: 'Active',
        ownerName: 'Naveen K (Alias)',
        ownerPhone: '9468081966',
        ownerEmail: 'naveen.k@gmail.com',
        ownerAddress: 'Sector 17, Chandigarh',
        associatedContact: 'Suraj (Sales)',
        associatedPhone: '9988776655',
        remarks: 'Potential owner match',
        followUp: '-',
        lastContactDate: '1/21/2026',
        lastContactTime: '3:00 PM',
        lastContactUser: 'Admin'
    },
    {
        id: 10,
        unitNo: '102',
        corner: 'Ordinary',
        type: 'Residential Plot',
        size: '8 Marla',
        location: 'Sector 24',
        area: 'Kurukshetra, Haryana',
        status: 'Active',
        price: '1.25 Cr',
        ownerName: 'Mr. Naveen Kumar',
        ownerPhone: '9468081966',
        ownerAddress: 'Sector 17, Chandigarh'
    },
    {
        id: 11,
        unitNo: 'DSS-15',
        corner: 'Ordinary',
        type: 'Commercial Shop',
        size: '100 Sq Yard',
        location: 'Sector 8 Market',
        area: 'Kurukshetra, Haryana',
        status: 'Inactive',
        price: '45 Lac',
        ownerName: 'Mr. Naveen Kumar',
        ownerPhone: '9468081966',
        ownerAddress: 'Sector 17, Chandigarh'
    },
    {
        id: 12,
        unitNo: 'P-99',
        corner: 'Three Side Open',
        type: 'Residential Plot',
        size: '2 Kanal',
        location: 'Sector 4',
        area: 'Kurukshetra, Haryana',
        status: 'Active',
        price: '3.50 Cr',
        ownerName: 'Mrs. Manpreet Kaur',
        ownerPhone: '7009550400',
        ownerAddress: 'Zirakpur 140306'
    },
    {
        id: 13,
        unitNo: 'Unit 4C',
        corner: 'Ordinary',
        type: 'Apartment',
        size: '3BHK',
        location: 'Royal Palms',
        area: 'Mohali, Punjab',
        status: 'Active',
        price: '75 Lac',
        ownerName: 'Mrs. Manpreet Kaur',
        ownerPhone: '7009550400',
        ownerAddress: 'Zirakpur 140306'
    },
    {
        id: 14,
        unitNo: '55',
        corner: 'Ordinary',
        type: 'Residential Plot',
        size: '10 Marla',
        location: 'Sector 3',
        area: 'Kurukshetra, Haryana',
        status: 'Active',
        price: '95 Lac',
        ownerName: 'Ashok Kumar',
        ownerPhone: '9876543210',
        previousOwnerPhone: '9468081966', // Naveen Kumar as Previous Owner
        previousOwnerName: 'Mr. Naveen Kumar'
    },
    {
        id: 15,
        unitNo: 'Booth 12',
        corner: 'Ordinary',
        type: 'Commercial Shop',
        size: '50 Sq Yard',
        location: 'Old Market',
        area: 'Zirakpur, Punjab',
        status: 'Active',
        ownerName: 'Sunil Verma',
        ownerPhone: '9898980000',
        previousOwnerPhone: '7009550400', // Manpreet Kaur as Previous Owner
        previousOwnerName: 'Mrs. Manpreet Kaur'
    }
];
