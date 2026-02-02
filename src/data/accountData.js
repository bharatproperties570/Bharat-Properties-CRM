export const accountData = [
    {
        receiptId: 'R-2024-001',
        paymentDate: '2024-11-20',
        paymentMode: 'Online',
        paymentCategory: 'Booking',
        amount: 500000,
        liabilityType: 'Booking Amount',

        bookingSnapshot: {
            id: 'BK-2024-001',
            stage: 'Pending',
            property: 'Sector 4, Plot-1550',
            customer: 'Rajiv Kumar',
            customerMobile: '9876543210'
        },

        paidBy: 'Buyer',
        paidTo: 'Company',

        financials: {
            dealValue: 10350000,
            totalPaid: 500000,
            pending: 9850000
        },

        commission: {
            total: 207000,
            received: 0,
            pending: 207000,
            breakdown: {
                company: 103500,
                executive: 62100,
                partner: 41400
            }
        },

        health: {
            dueDate: '2024-11-20',
            daysOverdue: 0,
            status: 'On Track'
        },

        remarks: 'Initial Booking Amount'
    },
    {
        receiptId: 'R-2024-002',
        paymentDate: '2024-11-25',
        paymentMode: 'Cheque',
        paymentCategory: 'EMI',
        amount: 250000,
        liabilityType: 'Booking Amount',

        bookingSnapshot: {
            id: 'BK-2024-002',
            stage: 'Booked',
            property: 'Sector 3, Flat-402',
            customer: 'Priya Verma',
            customerMobile: '9988776655'
        },

        paidBy: 'Buyer',
        paidTo: 'Company',

        financials: {
            dealValue: 4500000,
            totalPaid: 450000, // Previous 2L + This 2.5L
            pending: 4050000
        },

        commission: {
            total: 90000,
            received: 45000,
            pending: 45000,
            breakdown: {
                company: 45000,
                executive: 27000,
                partner: 18000
            }
        },

        health: {
            dueDate: '2024-11-20',
            daysOverdue: 5,
            status: 'Warning' // Slightly overdue
        },

        remarks: '1st EMI Cleared (Late)'
    },
    {
        receiptId: 'R-2024-003',
        paymentDate: '2024-11-01', // Past date, still pending logic simulation
        paymentMode: 'Pending',
        paymentCategory: 'Commission',
        amount: 0, // Not received yet
        liabilityType: 'Commission',

        bookingSnapshot: {
            id: 'BK-2024-003',
            stage: 'Registry',
            property: 'Sector 8, Villa-800',
            customer: 'Sunita Gupta',
            customerMobile: '7766554433'
        },

        paidBy: 'Seller',
        paidTo: 'Broker',

        financials: {
            dealValue: 7200000,
            totalPaid: 7200000,
            pending: 0
        },

        commission: {
            total: 144000,
            received: 100000,
            pending: 44000, // Specific pending entry
            breakdown: {
                company: 72000,
                executive: 43200,
                partner: 28800
            }
        },

        health: {
            dueDate: '2024-10-25',
            daysOverdue: 35,
            status: 'Critical' // High risk
        },

        remarks: 'Balance Commission Pending'
    },
    {
        receiptId: 'R-2024-004',
        paymentDate: '2024-11-28',
        paymentMode: 'Cash',
        paymentCategory: 'Govt Charges',
        amount: 25000,
        liabilityType: 'Government Charges',

        bookingSnapshot: {
            id: 'BK-2024-004',
            stage: 'Agreement',
            property: 'Tech Park, Office-304',
            customer: 'Kavita Reddy',
            customerMobile: '5544332211'
        },

        paidBy: 'Buyer',
        paidTo: 'Authority',

        financials: {
            dealValue: 5000000,
            totalPaid: 500000,
            pending: 0
        },

        commission: {
            total: 100000,
            received: 100000,
            pending: 0,
            breakdown: {
                company: 50000,
                executive: 30000,
                partner: 20000
            }
        },

        health: {
            dueDate: '2024-11-28',
            daysOverdue: 0,
            status: 'On Track'
        },

        remarks: 'Stamp Duty Token'
    }
];

export const accountStats = {
    cashInflow: 775000, // Sum of received amounts
    totalOverdue: 44000, // Pending commission
    pendingLiability: 13900000, // Rough sum of deal pending
    highRiskDeals: 1 // Based on Critical status
};
