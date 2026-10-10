import re

with open('src/pages/Booking/BookingPage.jsx', 'r') as f:
    content = f.read()

# Imports
content = re.sub(r'import { usePropertyConfig } from \'../../context/PropertyConfigContext\';', 'import { usePropertyConfig } from \'../../context/PropertyConfigContext\';\nimport { useBookings, useBookingDashboardStats } from \'../../utils/crmHooks\';', content)

# States
content = re.sub(r'const \[bookings, setBookings\] = useState\(\[\]\);\n', '', content)
content = re.sub(r'const \[isLoading, setIsLoading\] = useState\(false\);\n', '', content)
content = re.sub(r'const \[dashStats, setDashStats\] = useState\(null\);\n', '', content)
content = re.sub(r'const \[totalCount, setTotalCount\] = useState\(0\);\n', '', content)

# Inject hooks
hooks_code = """    const skip = (currentPage - 1) * recordsPerPage;
    const queryParams = {
        limit: recordsPerPage,
        skip,
        sortBy: sortConfig.by,
        sortOrder: sortConfig.order,
        status: activeFilters.status,
        health: activeFilters.health,
        salesAgent: activeFilters.salesAgent,
        channelPartner: activeFilters.channelPartner,
        project: activeFilters.project,
        dateFrom: activeFilters.dateFrom,
        dateTo: activeFilters.dateTo,
        minValue: activeFilters.minValue,
        maxValue: activeFilters.maxValue,
        search: searchTerm
    };

    const { data: bookingsRes, isLoading } = useBookings(queryParams);
    const { data: dashStats } = useBookingDashboardStats();
    
    const totalCount = bookingsRes?.count || 0;
    const bookingsData = bookingsRes?.data || [];
    
    const bookings = useMemo(() => {
        return bookingsData.map(b => ({
            id: b.applicationNo || b._id.substring(b._id.length - 8).toUpperCase(),
            _id: b._id,
            dealType: b.type,
            stage: b.status,
            health: b.health || 'On Track',
            healthReason: b.healthReason || null,
            dealDate: b.bookingDate,
            nextAction: b.nextAction || null,
            customer: {
                seller: {
                    name: b.seller?.name || 'N/A',
                    mobile: b.seller?.phones?.[0]?.number || b.seller?.mobile || '',
                    avatar: b.seller?.name?.substring(0, 2).toUpperCase() || 'S',
                    fatherName: b.seller?.fatherName || '',
                    address: b.seller?.personalAddress || {},
                    raw: b.seller || {}
                },
                buyer: {
                    name: b.lead?.name || 'N/A',
                    mobile: b.lead?.phones?.[0]?.number || '',
                    avatar: b.lead?.name?.substring(0, 2).toUpperCase() || 'NA',
                    raw: b.lead || {}
                }
            },
            propertyDetails: {
                name: b.property?.title || b.property?.unitNumber || 'Property Details Missing',
                location: b.property?.projectId?.name || 'Project Name Missing',
                type: b.property?.propertyCategory || b.property?.propertyType || '',
                size: b.property?.size || '',
                raw: b.property || {}
            },
            financials: {
                dealValue: b.totalDealAmount || 0,
                agreementAmount: b.agreementAmount || 0,
                paidAmount: b.totalPaidAmount || 0,
                commissionPercent: b.commissionPercent || 0,
                commissionAmount: b.totalCommissionAmount || 0,
                commissionReceived: b.commissionReceived || 0,
                commissionPending: (b.totalCommissionAmount || 0) - (b.commissionReceived || 0)
            },
            agents: {
                salesAgent: b.salesAgent?.name || b.salesAgent?.fullName || 'Unassigned',
                channelPartner: b.channelPartner?.name || 'Direct',
                cpCommissionPercent: b.channelPartnerCommissionPercent || 0,
                cpCommissionAmount: b.channelPartnerCommissionAmount || 0,
                cpCommissionReceived: b.channelPartnerCommissionReceived || 0,
                cpCommissionPending: (b.channelPartnerCommissionAmount || 0) - (b.channelPartnerCommissionReceived || 0)
            },
            docs: b.documents || [],
            paymentSchedule: b.paymentSchedule || [],
            closingDetails: b.closingDetails || {}
        }));
    }, [bookingsData]);
"""

# Replace fetchBookings and fetchDashStats and effects
pattern = r'const fetchBookings = useCallback\(async \(\) => \{.*?\n    \}, \[fetchDashStats\]\);\n'
content = re.sub(pattern, hooks_code, content, flags=re.DOTALL)

# Also replace onSave fetch calls with noops
content = content.replace("onSave={() => { fetchBookings(); fetchDashStats(); }}", "onSave={() => {}}")
content = content.replace("onUpdate={() => { fetchBookings(); fetchDashStats(); }}", "onUpdate={() => {}}")
content = content.replace("fetchDashStats();\n                }}", "                }}")
content = content.replace("onComplete={() => {\n                        fetchBookings();\n                        setSelectedIds([]);\n                    }}", "onComplete={() => {\n                        setSelectedIds([]);\n                    }}")

with open('src/pages/Booking/BookingPage.jsx', 'w') as f:
    f.write(content)
