
// Mock data removed
const leadData = [];
const contactData = [];
const inventoryData = [];
const users = [];
import { companyData } from '../constants/companyConstants';
import { PROJECTS_LIST } from '../constants/projectConstants';
import { sizeData } from '../constants/sizeConstants';

// --- Configuration ---

export const MODULE_CONFIG = {
    contacts: {
        id: 'contacts',
        label: 'Contacts',
        icon: 'fa-address-book',
        description: 'Import client contact details',
        data: contactData,
        fields: [
            // Basic Details
            { key: 'title', label: 'Title' },
            { key: 'name', label: 'First Name', required: true },
            { key: 'surname', label: 'Last Name' },
            { key: 'fatherName', label: 'Father Name' },
            { key: 'mobile', label: 'Mobile Number', required: true },
            { key: 'email', label: 'Email Address' },

            // Professional Details
            { key: 'professionCategory', label: 'Profession Category' },
            { key: 'professionSubCategory', label: 'Profession Sub Category' },
            { key: 'designation', label: 'Designation' },
            { key: 'company', label: 'Company' },
            { key: 'workOffice', label: 'Work Office' },

            // System Details
            { key: 'campaign', label: 'Campaign' },
            { key: 'source', label: 'Source' },
            { key: 'subSource', label: 'Sub Source' },
            { key: 'team', label: 'Team' },
            { key: 'owner', label: 'Owner' },

            // Address Details (Personal)
            { key: 'hNo', label: 'House No' },
            { key: 'street', label: 'Street' },
            { key: 'area', label: 'Area' },
            { key: 'city', label: 'City' },
            { key: 'tehsil', label: 'Tehsil' },
            { key: 'postOffice', label: 'Post Office' },
            { key: 'state', label: 'State' },
            { key: 'country', label: 'Country' },
            { key: 'pinCode', label: 'Pin Code' },

            // Other Details
            { key: 'gender', label: 'Gender' },
            { key: 'maritalStatus', label: 'Marital Status' },
            { key: 'birthDate', label: 'Birth Date' },
            { key: 'anniversaryDate', label: 'Anniversary Date' }
        ]
    },
    leads: {
        id: 'leads',
        label: 'Leads',
        icon: 'fa-filter',
        description: 'Import sales leads and prospects',
        data: leadData,
        fields: [
            // Basic Details
            { key: 'title', label: 'Title' },
            { key: 'name', label: 'First Name', required: true },
            { key: 'surname', label: 'Last Name' },
            { key: 'mobile', label: 'Mobile Number', required: true },
            { key: 'email', label: 'Email Address' },
            { key: 'description', label: 'Description' },

            // System Details
            { key: 'campaign', label: 'Campaign' },
            { key: 'source', label: 'Source' },
            { key: 'subSource', label: 'Sub Source' },
            { key: 'team', label: 'Team' },
            { key: 'owner', label: 'Owner' },
            { key: 'visibleTo', label: 'Visible To' },

            // Requirement Details
            { key: 'requirement', label: 'Requirement (Buy/Rent)' },
            { key: 'propertyType', label: 'Property Type' },
            { key: 'purpose', label: 'Purpose' },
            { key: 'nri', label: 'NRI (Yes/No)' },
            { key: 'subType', label: 'Sub Type' },
            { key: 'unitType', label: 'Unit Type' },
            { key: 'budgetMin', label: 'Budget Min' },
            { key: 'budgetMax', label: 'Budget Max' },
            { key: 'areaMin', label: 'Area Min' },
            { key: 'areaMax', label: 'Area Max' },
            { key: 'areaMetric', label: 'Area Metric' },
            { key: 'facing', label: 'Facing' },
            { key: 'roadWidth', label: 'Road Width' },
            { key: 'direction', label: 'Direction / Orientation' },
            { key: 'funding', label: 'Funding' },
            { key: 'timeline', label: 'Timeline' },
            { key: 'furnishing', label: 'Furnishing' },
            { key: 'transactionType', label: 'Transaction Type' },
            { key: 'transactionFlexiblePercentage', label: 'Transaction Flexible %' }
        ]
    },
    deals: {
        id: 'deals',
        label: 'Deals',
        icon: 'fa-handshake',
        description: 'Import sales deals and transactions',
        data: [], // Deals data
        fields: [
            // Property & Intent
            { key: 'projectName', label: 'Project Name', required: true },
            { key: 'block', label: 'Block' },
            { key: 'unitNo', label: 'Unit Number', required: true },
            { key: 'unitType', label: 'Unit Type' },
            { key: 'propertyType', label: 'Property Type' },
            { key: 'category', label: 'Category' },
            { key: 'subCategory', label: 'Sub Category' },
            { key: 'size', label: 'Size' },
            { key: 'location', label: 'Location' },
            { key: 'intent', label: 'Intent (Sale/Rent)' },

            // Pricing
            { key: 'price', label: 'Final Price' },
            { key: 'quotePrice', label: 'Quote Price' },
            { key: 'pricingMode', label: 'Pricing Mode' },
            { key: 'ratePrice', label: 'Rate per Unit' },
            { key: 'quoteRatePrice', label: 'Quote Rate per Unit' },
            { key: 'negotiable', label: 'Negotiable (Yes/No)' },
            { key: 'fixed', label: 'Fixed (Yes/No)' },

            // Deal Details
            { key: 'status', label: 'Status' },
            { key: 'dealType', label: 'Deal Type' },
            { key: 'transactionType', label: 'Transaction Type' },
            { key: 'flexiblePercentage', label: 'Flexible %' },

            // Contacts
            { key: 'ownerName', label: 'Owner Name' },
            { key: 'ownerPhone', label: 'Owner Mobile' },
            { key: 'ownerEmail', label: 'Owner Email' },
            { key: 'associatedContactName', label: 'Associate Name' },
            { key: 'associatedContactPhone', label: 'Associate Mobile' },
            { key: 'associatedContactEmail', label: 'Associate Email' },

            // Assignment
            { key: 'team', label: 'Team' },
            { key: 'assignedTo', label: 'Assigned To' },
            { key: 'visibleTo', label: 'Visible To' },
            { key: 'latitude', label: 'Latitude' },
            { key: 'longitude', label: 'Longitude' },
            { key: 'remarks', label: 'Remarks' },
            { key: 'date', label: 'Deal Date' }
        ]
    },
    inventory: {
        id: 'inventory',
        label: 'Inventory',
        icon: 'fa-home',
        description: 'Import property units/inventory',
        data: inventoryData,
        fields: [
            // Unit Details
            { key: 'projectName', label: 'Project Name', required: true },
            { key: 'projectId', label: 'Project ID' },
            { key: 'unitNo', label: 'Unit Number', required: true },
            { key: 'unitType', label: 'Unit Type' },
            { key: 'category', label: 'Category' },
            { key: 'category_id', label: 'Category ID (Backend)' },
            { key: 'subCategory', label: 'Sub Category' },
            { key: 'subCategory_id', label: 'Sub Category ID (Backend)' },
            { key: 'sizeLabel', label: 'Size Label *', required: true },
            { key: 'builtupType', label: 'Builtup Type' },
            { key: 'builtupType_id', label: 'Builtup Type ID (Backend)' },
            { key: 'block', label: 'Block' },
            { key: 'size', label: 'Size' },
            { key: 'direction', label: 'Direction / Orientation' },
            { key: 'facing', label: 'Facing' },
            { key: 'roadWidth', label: 'Road Width' },
            { key: 'ownership', label: 'Ownership' },

            // Construction Details
            { key: 'occupationDate', label: 'Occupation Date' },
            { key: 'possessionStatus', label: 'Possession Status' },
            { key: 'furnishType', label: 'Furnish Type' },
            { key: 'furnishedItems', label: 'Furnished Items' },

            // Location Details
            { key: 'lat', label: 'Latitude' },
            { key: 'lng', label: 'Longitude' },
            { key: 'country', label: 'Country' },
            { key: 'state', label: 'State' },
            { key: 'city', label: 'City' },
            { key: 'tehsil', label: 'Tehsil' },
            { key: 'postOffice', label: 'Post Office' },
            { key: 'pinCode', label: 'Zip/Pin Code' },
            { key: 'hNo', label: 'House No' },
            { key: 'street', label: 'Street' },
            { key: 'locality', label: 'Locality' },
            { key: 'area', label: 'Area' },

            // Owner Details
            { key: 'ownerName', label: 'Owner Name' },
            { key: 'ownerPhone', label: 'Owner Mobile' },
            { key: 'ownerEmail', label: 'Owner Email' },
            { key: 'ownerAddress', label: 'Owner Address' },

            // System Details
            { key: 'assignedTo', label: 'Assigned To' },
            { key: 'assignedTo_id', label: 'Assigned To ID (Backend)' },
            { key: 'team', label: 'Team' },
            { key: 'status', label: 'Status' },
            { key: 'status_id', label: 'Status ID (Backend)' },
            { key: 'visibleTo', label: 'Visible To' }
        ]
    },
    users: {
        id: 'users',
        label: 'Users',
        icon: 'fa-users',
        description: 'System users and agents',
        data: users,
        fields: [
            // Basic Details
            { key: 'name', label: 'Full Name', required: true },
            { key: 'email', label: 'Email Address', required: true },
            { key: 'mobile', label: 'Mobile Number' },
            { key: 'username', label: 'Username', required: true },
            { key: 'password', label: 'Password', required: true },

            // Organization Details
            { key: 'department', label: 'Department' },
            { key: 'role', label: 'Role', required: true },
            { key: 'reportingTo', label: 'Reporting To' },
            { key: 'dataScope', label: 'Data Scope' },

            // Permissions
            { key: 'canViewMargin', label: 'Can View Margin (Yes/No)' },
            { key: 'canEditCommission', label: 'Can Edit Commission (Yes/No)' },
            { key: 'canOverrideCommission', label: 'Can Override Commission (Yes/No)' },
            { key: 'canApproveDeal', label: 'Can Approve Deal (Yes/No)' },
            { key: 'canApprovePayment', label: 'Can Approve Payment (Yes/No)' },
            { key: 'canApprovePayout', label: 'Can Approve Payout (Yes/No)' }
        ]
    },
    companies: {
        id: 'companies',
        label: 'Companies',
        icon: 'fa-building',
        description: 'Import partner and client companies',
        data: companyData,
        fields: [
            // Basic Details
            { key: 'name', label: 'Company Name', required: true },
            { key: 'phone', label: 'Phone Number' },
            { key: 'email', label: 'Email Address' },
            { key: 'type', label: 'Company Type' },
            { key: 'industry', label: 'Industry' },
            { key: 'description', label: 'Description' },
            { key: 'gstNumber', label: 'GST Number' },

            // System Details
            { key: 'campaign', label: 'Campaign' },
            { key: 'source', label: 'Source' },
            { key: 'subSource', label: 'Sub Source' },
            { key: 'team', label: 'Team' },
            { key: 'owner', label: 'Owner' },
            { key: 'visibleTo', label: 'Visible To' },

            // Registered Office
            { key: 'reg_hNo', label: 'Reg Office House No' },
            { key: 'reg_street', label: 'Reg Office Street' },
            { key: 'reg_city', label: 'Reg Office City' },
            { key: 'reg_state', label: 'Reg Office State' },
            { key: 'reg_country', label: 'Reg Office Country' },
            { key: 'reg_pinCode', label: 'Reg Office Pin Code' }
        ]
    },
    projects: {
        id: 'projects',
        label: 'Projects',
        icon: 'fa-project-diagram',
        description: 'Import real estate projects',
        data: PROJECTS_LIST,
        fields: [
            // Basic Details
            { key: 'name', label: 'Project Name', required: true },
            { key: 'developerName', label: 'Developer Name' },
            { key: 'reraNumber', label: 'RERA Number' },
            { key: 'description', label: 'Description' },
            { key: 'category', label: 'Category' },
            { key: 'subCategory', label: 'Sub Category' },
            { key: 'landArea', label: 'Land Area' },
            { key: 'landAreaUnit', label: 'Land Area Unit' },
            { key: 'totalBlocks', label: 'Total Blocks' },
            { key: 'totalFloors', label: 'Total Floors' },
            { key: 'totalUnits', label: 'Total Units' },
            { key: 'status', label: 'Status' },

            // Timeline
            { key: 'launchDate', label: 'Launch Date' },
            { key: 'possessionDate', label: 'Possession Date' },

            // Location
            { key: 'lat', label: 'Latitude' },
            { key: 'lng', label: 'Longitude' },
            { key: 'hNo', label: 'House No' },
            { key: 'street', label: 'Street' },
            { key: 'locality', label: 'Locality' },
            { key: 'area', label: 'Area' },
            { key: 'city', label: 'City' },
            { key: 'state', label: 'State' },
            { key: 'pinCode', label: 'Pin Code' },

            // System
            { key: 'team', label: 'Team' },
            { key: 'visibleTo', label: 'Visible To' }
        ]
    },
    sizes: {
        id: 'sizes',
        label: 'Sizes',
        icon: 'fa-ruler-combined',
        description: 'Manage standard property sizes',
        data: sizeData,
        fields: [
            { key: 'category', label: 'Category', required: true },
            { key: 'subCategory', label: 'Sub Category' },
            { key: 'unitType', label: 'Unit Type', required: true },
            { key: 'label', label: 'Size Label', required: true },
            { key: 'width', label: 'Width' },
            { key: 'length', label: 'Length' },
            { key: 'lengthMetrics', label: 'Metrics (Length & Width)' },
            { key: 'area', label: 'Area' },
            { key: 'areaMetrics', label: 'Metrics (Area)' },
            { key: 'builtupArea', label: 'Builtup Area' },
            { key: 'carpetArea', label: 'Carpet Area' },
            { key: 'superArea', label: 'Super Area' },
            { key: 'description', label: 'Description' }
        ]
    },
    propertyOwners: {
        id: 'propertyOwners',
        label: 'Property Owner',
        icon: 'fa-user-shield',
        description: 'Bulk update owners and associates',
        data: [],
        fields: [
            // Inventory Match Keys
            { key: 'projectName', label: 'Project Name', required: true, sample: 'Green Valley' },
            { key: 'block', label: 'Block', required: true, sample: 'Phase 1' },
            { key: 'unitNo', label: 'Unit Number', required: true, sample: '101' },

            // Owner Details
            { key: 'ownerName', label: 'Owner Name', sample: 'John Doe' },
            { key: 'ownerMobile', label: 'Owner Mobile', sample: '9876543210' },
            { key: 'ownerEmail', label: 'Owner Email', sample: 'john@example.com' },

            // Associate Details
            { key: 'associateName', label: 'Associate Name', sample: 'Jane Doe' },
            { key: 'associateMobile', label: 'Associate Mobile', sample: '9876543211' },
            { key: 'associateEmail', label: 'Associate Email', sample: 'jane@example.com' },
            { key: 'relationship', label: 'Relationship', sample: 'Spouse' }
        ]
    }
};

// --- CSV Parsing ---

export const parseCSV = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');

            if (lines.length < 1) {
                return reject('File is empty');
            }

            // Robust CSV parser using regex to handle quoted fields with commas
            const splitCsvLine = (line) => {
                const result = [];
                let startValueIndex = 0;
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        let value = line.substring(startValueIndex, i).trim();
                        // Remove surrounding quotes
                        if (value.startsWith('"') && value.endsWith('"')) {
                            value = value.substring(1, value.length - 1).replace(/""/g, '"');
                        }
                        result.push(value);
                        startValueIndex = i + 1;
                    }
                }
                
                // Add the last field
                let lastValue = line.substring(startValueIndex).trim();
                if (lastValue.startsWith('"') && lastValue.endsWith('"')) {
                    lastValue = lastValue.substring(1, lastValue.length - 1).replace(/""/g, '"');
                }
                result.push(lastValue);
                return result;
            };

            const headers = splitCsvLine(lines[0]);
            const data = [];

            for (let i = 1; i < lines.length; i++) {
                const row = splitCsvLine(lines[i]);

                if (row.length === headers.length) {
                    const rowData = {};
                    row.forEach((value, index) => {
                        rowData[headers[index]] = value;
                    });
                    data.push(rowData);
                } else if (row.length > 0) {
                    console.warn(`Row ${i} has ${row.length} columns, expected ${headers.length}. Skipping.`);
                }
            }

            resolve({ headers, data });
        };

        reader.onerror = () => {
            reject('Error reading file');
        };

        reader.readAsText(file);
    });
};


// --- CSV Generation ---

export const generateCSV = (data, columns) => {
    if (!data || !data.length) return '';

    // If no specific columns requested, use all keys from the first object
    const headers = columns && columns.length > 0 ? columns : Object.keys(data[0]);

    const csvRows = [];

    // Add Header Row
    csvRows.push(headers.join(','));

    // Add Data Rows
    data.forEach(row => {
        const values = headers.map(header => {
            let rawValue = row[header];
            
            // Professional ID Mapping: If header is *_id but data is missing exactly that key,
            // try to extract _id from the base object (e.g. category_id -> row.category._id)
            if (header.endsWith('_id') && (rawValue === undefined || rawValue === null)) {
                const baseKey = header.replace('_id', '');
                const baseObj = row[baseKey];
                if (baseObj && typeof baseObj === 'object') {
                    rawValue = baseObj._id || baseObj.id;
                }
            }

            let displayValue = '';

            if (rawValue === null || rawValue === undefined) {
                displayValue = '';
            } else if (typeof rawValue === 'object' && rawValue !== null) {
                // Intelligently handle populated MongoDB objects / Lookups
                // If it's an ID column, prioritize ID
                if (header.endsWith('_id')) {
                    displayValue = rawValue._id || rawValue.id || JSON.stringify(rawValue);
                } else {
                    displayValue = rawValue.lookup_value || 
                                   rawValue.name || 
                                   rawValue.fullName || 
                                   rawValue.username || 
                                   (rawValue._id ? rawValue._id.toString() : JSON.stringify(rawValue));
                }
            } else {
                displayValue = String(rawValue);
            }

            // CSV standard: escape double quotes by doubling them
            const escaped = displayValue.replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
};

// --- Download Helper ---

export const downloadFile = (content, fileName, mimeType = 'text/csv;charset=utf-8;') => {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

// --- Error Report Generation ---

export const generateErrorReportCSV = (errors) => {
    if (!errors || !errors.length) return '';

    const headers = ['Row', 'Item/Name', 'Reason'];
    const csvRows = [headers.join(',')];

    errors.forEach(err => {
        const values = [
            err.row || 'N/A',
            `"${(err.name || 'Unknown').replace(/"/g, '""')}"`,
            `"${(err.reason || 'Unknown Error').replace(/"/g, '""')}"`
        ];
        csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
};
