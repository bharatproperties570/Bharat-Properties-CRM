export const bookingData = [
    {
        id: 'BK-2024-001',
        dealType: 'Sell',
        stage: 'Pending', // Pending, Booked, Agreement, Registry, Cancelled
        health: 'At Risk', // On Track, At Risk, Delayed
        dealDate: '2024-11-01',
        customer: {
            seller: {
                name: 'Rajiv Kumar',
                mobile: '9876543210',
                avatar: 'RK'
            },
            buyer: {
                name: 'Amit Sharma',
                mobile: '9123456780',
                avatar: 'AS'
            }
        },
        property: {
            project: 'Sector 4 Estate',
            unit: 'Plot-1550',
            location: 'Sector 4, Kurukshetra',
            block: 'B-Block'
        },
        stakeholders: {
            executive: 'Rajesh Kumar',
            partner: 'Amit Realty',
            developer: 'Huda Authority'
        },
        financials: {
            dealValue: 10350000,
            dealPaid: 500000,
            dealPending: 9850000,
            commissionTotal: 207000,
            commissionReceived: 0,
            commissionPending: 207000,
            paymentPlan: 'CLPP'
        },
        legal: {
            status: 'Pending', // Pending, Partial, Verified
            advocate: '-',
            documents: {
                agreement: 'Pending',
                idProof: 'Verified',
                propertyPapers: 'Pending',
                noc: 'Pending'
            }
        },
        timeline: {
            daysInStage: 5,
            expectedAgreement: '2024-11-15',
            actualAgreement: null,
            expectedRegistry: '2024-12-01',
            nextAction: {
                type: 'Collect Token',
                dueDate: '2024-11-05',
                assignedTo: 'Rajesh Kumar'
            }
        },
        source: 'Campaign: Diwali Bonanza (FB)'
    },
    {
        id: 'BK-2024-002',
        dealType: 'Rent',
        stage: 'Booked',
        health: 'On Track',
        dealDate: '2024-10-15',
        customer: {
            seller: {
                name: 'Priya Verma',
                mobile: '9988776655',
                avatar: 'PV'
            },
            buyer: {
                name: 'Sandeep Singh',
                mobile: '8877665544',
                avatar: 'SS'
            }
        },
        property: {
            project: 'Sector 3 Heights',
            unit: 'Flat 402',
            location: 'Sector 3, Kurukshetra',
            block: 'Tower A'
        },
        stakeholders: {
            executive: 'Priya Sharma',
            partner: 'Direct',
            developer: 'DLF'
        },
        financials: {
            dealValue: 25000,
            dealPaid: 25000,
            dealPending: 0,
            commissionTotal: 12500,
            commissionReceived: 12500,
            commissionPending: 0,
            paymentPlan: 'Monthly'
        },
        legal: {
            status: 'Verified',
            advocate: 'Adv. Mehta',
            documents: {
                agreement: 'Verified',
                idProof: 'Verified',
                propertyPapers: 'Verified',
                noc: 'N/A'
            }
        },
        timeline: {
            daysInStage: 2,
            expectedAgreement: '2024-10-18',
            actualAgreement: null,
            expectedRegistry: null, // Rent doesn't always need registry
            nextAction: {
                type: 'Sign Agreement',
                dueDate: '2024-10-18',
                assignedTo: 'Priya Sharma'
            }
        },
        source: 'Walk-in'
    },
    {
        id: 'BK-2024-003',
        dealType: 'Sell',
        stage: 'Registry',
        health: 'Delayed',
        dealDate: '2024-09-20',
        customer: {
            seller: {
                name: 'Sunita Gupta',
                mobile: '7766554433',
                avatar: 'SG'
            },
            buyer: {
                name: 'Vikram Singh',
                mobile: '6655443322',
                avatar: 'VS'
            }
        },
        property: {
            project: 'Sector 8 Villas',
            unit: 'Villa-800',
            location: 'Sector 8, Kurukshetra',
            block: 'A-Block'
        },
        stakeholders: {
            executive: 'Vikram Singh',
            partner: 'Metro Homes',
            developer: 'Ansals'
        },
        financials: {
            dealValue: 7200000,
            dealPaid: 7000000,
            dealPending: 200000,
            commissionTotal: 144000,
            commissionReceived: 100000,
            commissionPending: 44000,
            paymentPlan: 'Down Payment'
        },
        legal: {
            status: 'Verified',
            advocate: 'Adv. R.K. Gupta',
            documents: {
                agreement: 'Verified',
                idProof: 'Verified',
                propertyPapers: 'Verified',
                noc: 'Verified'
            }
        },
        timeline: {
            daysInStage: 15, // Delayed
            expectedAgreement: '2024-09-25',
            actualAgreement: '2024-09-26',
            expectedRegistry: '2024-10-20',
            actualRegistry: null,
            nextAction: {
                type: 'Complete Registry',
                dueDate: '2024-10-20', // Past due
                assignedTo: 'Vikram Singh'
            }
        },
        source: 'Referral'
    },
    {
        id: 'BK-2024-004',
        dealType: 'Lease',
        stage: 'Agreement',
        health: 'On Track',
        dealDate: '2024-08-12',
        customer: {
            seller: {
                name: 'Kavita Reddy',
                mobile: '5544332211',
                avatar: 'KR'
            },
            buyer: {
                name: 'Arun Kumar',
                mobile: '4433221100',
                avatar: 'AK'
            }
        },
        property: {
            project: 'Tech Park',
            unit: 'Office-304',
            location: 'Sector 30, Chandigarh',
            block: 'Floor 3'
        },
        stakeholders: {
            executive: 'Arun Mehta',
            partner: 'Royal Builders',
            developer: 'Embassy'
        },
        financials: {
            dealValue: 5000000, // Lease value
            dealPaid: 500000,
            dealPending: 0,
            commissionTotal: 100000,
            commissionReceived: 100000,
            commissionPending: 0,
            paymentPlan: 'Annual'
        },
        legal: {
            status: 'Partial',
            advocate: '-',
            documents: {
                agreement: 'Drafted',
                idProof: 'Verified',
                propertyPapers: 'Received',
                noc: 'Pending'
            }
        },
        timeline: {
            daysInStage: 3,
            expectedAgreement: '2024-08-20',
            actualAgreement: null,
            expectedRegistry: null,
            nextAction: {
                type: 'Sign Lease',
                dueDate: '2024-08-20',
                assignedTo: 'Arun Mehta'
            }
        },
        source: 'Website Inquiry'
    },
    {
        id: 'BK-2024-005',
        dealType: 'Sell',
        stage: 'Cancelled',
        health: 'On Track', // Archived
        dealDate: '2024-07-01',
        customer: {
            seller: {
                name: 'Neha Jain',
                mobile: '1122334455',
                avatar: 'NJ'
            },
            buyer: {
                name: 'Rahul Mehta',
                mobile: '5544332211',
                avatar: 'RM'
            }
        },
        property: {
            project: 'Green Valley',
            unit: 'Plot-99',
            location: 'Sector 5, Kurukshetra',
            block: 'C-Block'
        },
        stakeholders: {
            executive: 'Neha Gupta',
            partner: 'Direct',
            developer: 'Private'
        },
        financials: {
            dealValue: 4500000,
            dealPaid: 0,
            dealPending: 0,
            commissionTotal: 90000,
            commissionReceived: 0,
            commissionPending: 0,
            paymentPlan: 'N/A'
        },
        legal: {
            status: 'Pending',
            advocate: '-',
            documents: {
                agreement: 'Pending',
                idProof: 'Pending',
                propertyPapers: 'Pending',
                noc: 'Pending'
            }
        },
        timeline: {
            daysInStage: 0,
            expectedAgreement: null,
            actualAgreement: null,
            expectedRegistry: null,
            nextAction: {
                type: 'Process Refund',
                dueDate: '2024-07-05',
                assignedTo: 'Accounts'
            }
        },
        source: 'Cold Call'
    }
];
