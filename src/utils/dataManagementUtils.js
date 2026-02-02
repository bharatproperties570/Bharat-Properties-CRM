
import { leadData, contactData, inventoryData, users } from '../data/mockData';
import { companyData } from '../data/companyData';
import { PROJECTS_LIST } from '../data/projectData';
import { sizeData } from '../data/sizeData';

// --- Configuration ---

export const MODULE_CONFIG = {
    contacts: {
        id: 'contacts',
        label: 'Contacts',
        icon: 'fa-address-book',
        description: 'Import client contact details',
        data: contactData,
        fields: [
            { key: 'name', label: 'Full Name', required: true },
            { key: 'mobile', label: 'Mobile Number', required: true },
            { key: 'email', label: 'Email Address' },
            { key: 'address', label: 'Address' },
            { key: 'designation', label: 'Designation' },
            { key: 'company', label: 'Company' },
            { key: 'project', label: 'Project Interest' },
            { key: 'budget', label: 'Budget/Size' },
            { key: 'source', label: 'Source' }
        ]
    },
    leads: {
        id: 'leads',
        label: 'Leads',
        icon: 'fa-filter',
        description: 'Import sales leads and prospects',
        data: leadData,
        fields: [
            { key: 'name', label: 'Lead Name', required: true },
            { key: 'mobile', label: 'Mobile Number', required: true },
            { key: 'budget', label: 'Budget Range' },
            { key: 'location', label: 'Preferred Location' },
            { key: 'source', label: 'Source' },
            { key: 'status', label: 'Status' }
        ]
    },
    inventory: {
        id: 'inventory',
        label: 'Inventory',
        icon: 'fa-home',
        description: 'Import property units/inventory',
        data: inventoryData,
        fields: [
            { key: 'unitNo', label: 'Unit Number', required: true },
            { key: 'type', label: 'Property Type' },
            { key: 'size', label: 'Size' },
            { key: 'location', label: 'Location/Block' },
            { key: 'area', label: 'Area/City' },
            { key: 'price', label: 'Price' },
            { key: 'status', label: 'Status' },
            { key: 'ownerName', label: 'Owner Name' },
            { key: 'ownerFatherName', label: 'Owner Father Name' },
            { key: 'ownerPhone', label: 'Owner Mobile' },
            { key: 'ownerEmail', label: 'Owner Email' },
            { key: 'ownerAddress', label: 'Owner Address' },
            { key: 'associatedContact', label: 'Associate Name' },
            { key: 'associatedPhone', label: 'Associate Mobile' },
            { key: 'associatedEmail', label: 'Associate Email' }
        ]
    },
    users: {
        id: 'users',
        label: 'Users',
        icon: 'fa-users',
        description: 'System users and agents',
        data: users,
        fields: [
            { key: 'name', label: 'Name', required: true },
            { key: 'role', label: 'Role', required: true },
            { key: 'email', label: 'Email' }
        ]
    },
    companies: {
        id: 'companies',
        label: 'Companies',
        icon: 'fa-building',
        description: 'Import partner and client companies',
        data: companyData,
        fields: [
            { key: 'name', label: 'Company Name', required: true },
            { key: 'type', label: 'Type' },
            { key: 'category', label: 'Category' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' },
            { key: 'website', label: 'Website' },
            { key: 'ownership', label: 'Owner' },
            { key: 'status', label: 'Status' }
        ]
    },
    projects: {
        id: 'projects',
        label: 'Projects',
        icon: 'fa-project-diagram',
        description: 'Import real estate projects',
        data: PROJECTS_LIST,
        fields: [
            { key: 'name', label: 'Project Name', required: true },
            { key: 'location', label: 'Location', required: true },
            { key: 'date', label: 'Launch Date' },
            { key: 'user', label: 'Manager' },
            { key: 'lat', label: 'Latitude' },
            { key: 'lng', label: 'Longitude' }
        ]
    },
    sizes: {
        id: 'sizes',
        label: 'Sizes',
        icon: 'fa-ruler-combined',
        description: 'Manage standard property sizes',
        data: sizeData,
        fields: [
            { key: 'label', label: 'Size Label', required: true },
            { key: 'value', label: 'Area/Value' },
            { key: 'category', label: 'Category' },
            { key: 'dimension', label: 'Dimensions' },
            { key: 'status', label: 'Status' }
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

            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            const data = [];

            for (let i = 1; i < lines.length; i++) {
                const row = lines[i].split(',');
                // Handle basic CSV escaping (this is a simple parser, comprehensive CSV parsing might utilize a library like PapaParse in a real app)
                // For now, we assume simple comma separation

                if (row.length === headers.length) {
                    const rowData = {};
                    row.forEach((value, index) => {
                        rowData[headers[index]] = value.trim().replace(/^"|"$/g, '');
                    });
                    data.push(rowData);
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
            const escaped = ('' + (row[header] || '')).replace(/"/g, '\\"');
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
