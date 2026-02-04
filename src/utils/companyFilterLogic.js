
// ==================================================================================
// COMPANY FILTERING LOGIC
// ==================================================================================

export const applyCompanyFilters = (companies, filters) => {
    if (!companies) return [];

    return companies.filter(company => {
        // 1. Status Filter (Multi-Select)
        if (filters.status && filters.status.length > 0) {
            const companyStatus = company.status || 'Active';
            if (!filters.status.includes(companyStatus)) return false;
        }

        // 2. Source Filter (Multi-Select)
        if (filters.source && filters.source.length > 0) {
            if (!filters.source.includes(company.source)) return false;
        }

        // 3. Company Type (Multi-Select - e.g. Pvt Ltd, Govt)
        if (filters.type && filters.type.length > 0) {
            if (!filters.type.includes(company.type)) return false;
        }

        // 4. Industry/Category (Multi-Select)
        if (filters.category && filters.category.length > 0) {
            if (!filters.category.includes(company.category)) return false;
        }

        // 5. Location/City (Text Search)
        // Deep Check: company.address string OR company.addresses object
        if (filters.city) {
            const term = filters.city.toLowerCase();
            let hasMatch = false;

            // Check main address string
            if (company.address && company.address.toLowerCase().includes(term)) hasMatch = true;

            // Check nested addresses object
            if (!hasMatch && company.addresses) {
                // Example structure: { 'Registered': {...}, 'Branch': [{...}] }
                const checkAddressObj = (addr) => {
                    return (addr.city && addr.city.toLowerCase().includes(term)) ||
                        (addr.state && addr.state.toLowerCase().includes(term));
                };

                Object.values(company.addresses).forEach(val => {
                    if (Array.isArray(val)) {
                        if (val.some(addr => checkAddressObj(addr))) hasMatch = true;
                    } else if (typeof val === 'object' && val !== null) {
                        if (checkAddressObj(val)) hasMatch = true;
                    }
                });
            }

            if (!hasMatch) return false;
        }

        // 6. Employees (Text match)
        if (filters.employees) {
            if (!company.employees || !company.employees.toLowerCase().includes(filters.employees.toLowerCase())) return false;
        }

        // 7. Team/Owner
        if (filters.owner) {
            const term = filters.owner.toLowerCase();
            const ownerMatch = company.ownership && company.ownership.toLowerCase().includes(term);
            const teamMatch = company.team && company.team.toLowerCase().includes(term);
            if (!ownerMatch && !teamMatch) return false;
        }

        return true;
    });
};
