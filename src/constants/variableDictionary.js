/**
 * CRM Master Variable Dictionary
 * 
 * Enterprise-grade variable reference for all messaging templates.
 * Every variable key exactly matches the corresponding form field key used
 * in AddLeadModal, AddContactModal, AddInventoryModal, AddProjectModal,
 * AddBookingModal, and AddCompanyModal.
 * 
 * Usage in templates: {{variableKey}}
 * e.g. {{firstName}}, {{projectName}}, {{totalDealAmount}}
 */

export const variableDictionary = [

    // ─────────────────────────────────────────────
    // 👤 LEAD / CONTACT — Basic Details
    // ─────────────────────────────────────────────
    { id: 'title',            label: 'Title (Mr/Mrs/Dr)',     category: 'Lead – Basic',       type: 'dropdown' },
    { id: 'name',             label: 'Full Name',             category: 'Lead – Basic',       type: 'text' },
    { id: 'firstName',        label: 'First Name',            category: 'Lead – Basic',       type: 'computed' },
    { id: 'surname',          label: 'Last Name / Surname',   category: 'Lead – Basic',       type: 'text' },
    { id: 'mobile',           label: 'Mobile Number',         category: 'Lead – Basic',       type: 'text' },
    { id: 'email',            label: 'Email Address',         category: 'Lead – Basic',       type: 'text' },
    { id: 'description',      label: 'Description / Note',   category: 'Lead – Basic',       type: 'textarea' },
    { id: 'tags',             label: 'Tags',                  category: 'Lead – Basic',       type: 'multi-select' },

    // ─────────────────────────────────────────────
    // 📋 LEAD — System Details
    // ─────────────────────────────────────────────
    { id: 'source',           label: 'Lead Source',           category: 'Lead – System',      type: 'dropdown' },
    { id: 'subSource',        label: 'Sub Source',            category: 'Lead – System',      type: 'dropdown' },
    { id: 'campaign',         label: 'Campaign Name',         category: 'Lead – System',      type: 'dropdown' },
    { id: 'status',           label: 'Lead Status / Stage',   category: 'Lead – System',      type: 'dropdown' },
    { id: 'team',             label: 'Assigned Team',         category: 'Lead – System',      type: 'dropdown' },
    { id: 'assignedTo',       label: 'Assigned Agent',        category: 'Lead – System',      type: 'dropdown' },
    { id: 'visibleTo',        label: 'Visible To',            category: 'Lead – System',      type: 'dropdown' },

    // ─────────────────────────────────────────────
    // 🏠 LEAD — Requirement Details
    // ─────────────────────────────────────────────
    { id: 'requirement',      label: 'Requirement (Buy/Rent)',  category: 'Lead – Requirement', type: 'dropdown' },
    { id: 'propertyType',     label: 'Property Type',           category: 'Lead – Requirement', type: 'multi-select' },
    { id: 'subType',          label: 'Sub Type',                category: 'Lead – Requirement', type: 'multi-select' },
    { id: 'unitType',         label: 'Unit Type (2BHK/3BHK etc)',  category: 'Lead – Requirement', type: 'multi-select' },
    { id: 'purpose',          label: 'Purpose (End Use/Invest)', category: 'Lead – Requirement', type: 'dropdown' },
    { id: 'budgetMin',        label: 'Minimum Budget',           category: 'Lead – Requirement', type: 'number' },
    { id: 'budgetMax',        label: 'Maximum Budget',           category: 'Lead – Requirement', type: 'number' },
    { id: 'areaMin',          label: 'Minimum Area',             category: 'Lead – Requirement', type: 'number' },
    { id: 'areaMax',          label: 'Maximum Area',             category: 'Lead – Requirement', type: 'number' },
    { id: 'areaMetric',       label: 'Area Metric (Sq.Yd etc)', category: 'Lead – Requirement', type: 'dropdown' },
    { id: 'facing',           label: 'Preferred Facing',         category: 'Lead – Requirement', type: 'multi-select' },
    { id: 'roadWidth',        label: 'Road Width Preference',    category: 'Lead – Requirement', type: 'multi-select' },
    { id: 'direction',        label: 'Direction Preference',     category: 'Lead – Requirement', type: 'multi-select' },
    { id: 'funding',          label: 'Funding Type',             category: 'Lead – Requirement', type: 'dropdown' },
    { id: 'timeline',         label: 'Purchase Timeline',        category: 'Lead – Requirement', type: 'dropdown' },
    { id: 'furnishing',       label: 'Furnishing Preference',    category: 'Lead – Requirement', type: 'dropdown' },
    { id: 'transactionType',  label: 'Transaction Type',         category: 'Lead – Requirement', type: 'dropdown' },
    { id: 'nri',              label: 'NRI Customer (Yes/No)',    category: 'Lead – Requirement', type: 'boolean' },

    // ─────────────────────────────────────────────
    // 📍 LEAD — Location Preference
    // ─────────────────────────────────────────────
    { id: 'locCity',          label: 'Preferred City',           category: 'Lead – Location',    type: 'dropdown' },
    { id: 'locArea',          label: 'Preferred Area/Sector',    category: 'Lead – Location',    type: 'text' },
    { id: 'locBlock',         label: 'Preferred Block',          category: 'Lead – Location',    type: 'multi-select' },
    { id: 'locPinCode',       label: 'Preferred Pin Code',       category: 'Lead – Location',    type: 'text' },
    { id: 'locState',         label: 'Preferred State',          category: 'Lead – Location',    type: 'dropdown' },
    { id: 'range',            label: 'Search Range (km)',        category: 'Lead – Location',    type: 'dropdown' },
    { id: 'projectName',      label: 'Preferred Project Name',   category: 'Lead – Location',    type: 'multi-select' },

    // ─────────────────────────────────────────────
    // 👔 CONTACT — Professional Details
    // ─────────────────────────────────────────────
    { id: 'fatherName',           label: 'Father\'s Name',           category: 'Contact – Personal',   type: 'text' },
    { id: 'gender',               label: 'Gender',                   category: 'Contact – Personal',   type: 'dropdown' },
    { id: 'maritalStatus',        label: 'Marital Status',           category: 'Contact – Personal',   type: 'dropdown' },
    { id: 'birthDate',            label: 'Date of Birth',            category: 'Contact – Personal',   type: 'date' },
    { id: 'anniversaryDate',      label: 'Anniversary Date',         category: 'Contact – Personal',   type: 'date' },
    { id: 'professionCategory',   label: 'Profession Category',      category: 'Contact – Professional', type: 'dropdown' },
    { id: 'professionSubCategory',label: 'Profession Sub-Category',  category: 'Contact – Professional', type: 'dropdown' },
    { id: 'designation',          label: 'Designation / Job Title',  category: 'Contact – Professional', type: 'text' },
    { id: 'company',              label: 'Company Name',             category: 'Contact – Professional', type: 'text' },

    // ─────────────────────────────────────────────
    // 🏗️ INVENTORY — Unit Details
    // ─────────────────────────────────────────────
    { id: 'unitNo',           label: 'Unit Number',              category: 'Inventory – Unit',   type: 'text' },
    { id: 'block',            label: 'Block / Tower',            category: 'Inventory – Unit',   type: 'text' },
    { id: 'category',         label: 'Category (Residential)',   category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'subCategory',      label: 'Sub Category (Flat etc)',  category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'unitType',         label: 'Unit Type (Corner/Two Side Open etc)', category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'builtupType',      label: 'Built-up Type',            category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'size',             label: 'Unit Size',                category: 'Inventory – Unit',   type: 'text' },
    { id: 'sizeType',         label: 'Size Configuration Type',  category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'direction',        label: 'Unit Direction',           category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'facing',           label: 'Unit Facing',              category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'roadWidth',        label: 'Road Width',               category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'ownership',        label: 'Ownership Type',           category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'possessionStatus', label: 'Possession Status',        category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'furnishType',      label: 'Furnishing Type',          category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'occupationDate',   label: 'Occupation Date',          category: 'Inventory – Unit',   type: 'date' },
    { id: 'ageOfConstruction',label: 'Age of Construction',      category: 'Inventory – Unit',   type: 'number' },
    { id: 'intent',           label: 'Intent (Sell/Rent)',       category: 'Inventory – Unit',   type: 'dropdown' },
    { id: 'price',            label: 'Listed Price',             category: 'Inventory – Unit',   type: 'number' },

    // ─────────────────────────────────────────────
    // 📍 INVENTORY — Location / Address
    // ─────────────────────────────────────────────
    { id: 'location',         label: 'Locality / Sector',        category: 'Inventory – Location', type: 'dropdown' },
    { id: 'address.city',     label: 'City',                     category: 'Inventory – Location', type: 'dropdown' },
    { id: 'address.state',    label: 'State',                    category: 'Inventory – Location', type: 'dropdown' },
    { id: 'address.pincode',  label: 'Pin Code',                 category: 'Inventory – Location', type: 'text' },
    { id: 'address.area',     label: 'Area / Sub-Locality',      category: 'Inventory – Location', type: 'text' },
    { id: 'address.street',   label: 'Street / Road Name',       category: 'Inventory – Location', type: 'text' },

    // ─────────────────────────────────────────────
    // 🏢 PROJECT — Basic Info
    // ─────────────────────────────────────────────
    { id: 'name',                    label: 'Project Name',              category: 'Project – Basic',  type: 'text' },
    { id: 'developerName',           label: 'Developer Name',            category: 'Project – Basic',  type: 'text' },
    { id: 'secondaryDeveloper',      label: 'Secondary Developer',       category: 'Project – Basic',  type: 'text' },
    { id: 'reraNumber',              label: 'RERA Number',               category: 'Project – Basic',  type: 'text' },
    { id: 'description',             label: 'Project Description',       category: 'Project – Basic',  type: 'textarea' },
    { id: 'isJointVenture',          label: 'Is Joint Venture',          category: 'Project – Basic',  type: 'boolean' },

    // ─────────────────────────────────────────────
    // 📊 PROJECT — Stats & Dates
    // ─────────────────────────────────────────────
    { id: 'landArea',                label: 'Land Area',                 category: 'Project – Stats', type: 'number' },
    { id: 'totalBlocks',             label: 'Total Blocks / Towers',     category: 'Project – Stats', type: 'number' },
    { id: 'totalFloors',             label: 'Total Floors',              category: 'Project – Stats', type: 'number' },
    { id: 'totalUnits',              label: 'Total Units',               category: 'Project – Stats', type: 'number' },
    { id: 'launchDate',              label: 'Launch Date',               category: 'Project – Stats', type: 'date' },
    { id: 'expectedCompletionDate',  label: 'Expected Completion Date',  category: 'Project – Stats', type: 'date' },
    { id: 'possessionDate',          label: 'Possession Date',           category: 'Project – Stats', type: 'date' },
    { id: 'parkingType',             label: 'Parking Type',              category: 'Project – Stats', type: 'dropdown' },
    { id: 'approvedBank',            label: 'Approved Bank',             category: 'Project – Stats', type: 'text' },

    // ─────────────────────────────────────────────
    // 📑 BOOKING — Transaction Details
    // ─────────────────────────────────────────────
    { id: 'type',                    label: 'Booking Type (Sale/Rent)',  category: 'Booking',  type: 'dropdown' },
    { id: 'bookingDate',             label: 'Booking Date',             category: 'Booking',  type: 'date' },
    { id: 'applicationNo',           label: 'Application Number',       category: 'Booking',  type: 'text' },
    { id: 'unitNumber',              label: 'Booked Unit Number',       category: 'Booking',  type: 'text' },
    { id: 'totalDealAmount',         label: 'Total Deal Amount',        category: 'Booking',  type: 'number' },
    { id: 'tokenAmount',             label: 'Token Amount',             category: 'Booking',  type: 'number' },
    { id: 'agreementAmount',         label: 'Agreement Amount',         category: 'Booking',  type: 'number' },
    { id: 'agreementDate',           label: 'Agreement Date',           category: 'Booking',  type: 'date' },
    { id: 'finalPaymentDate',        label: 'Final Payment Date',       category: 'Booking',  type: 'date' },
    { id: 'salesAgent',              label: 'Sales Agent',              category: 'Booking',  type: 'dropdown' },
    { id: 'channelPartner',          label: 'Channel Partner Name',     category: 'Booking',  type: 'text' },
    { id: 'sellerBrokeragePercent',  label: 'Seller Brokerage %',       category: 'Booking',  type: 'number' },
    { id: 'buyerBrokeragePercent',   label: 'Buyer Brokerage %',        category: 'Booking',  type: 'number' },
    { id: 'remarks',                 label: 'Booking Remarks',          category: 'Booking',  type: 'textarea' },

    // ─────────────────────────────────────────────
    // 🏦 COMPANY
    // ─────────────────────────────────────────────
    { id: 'name',             label: 'Company Name',              category: 'Company',  type: 'text' },
    { id: 'companyType',      label: 'Company Type',              category: 'Company',  type: 'dropdown' },
    { id: 'industry',         label: 'Industry',                  category: 'Company',  type: 'dropdown' },
    { id: 'gstNumber',        label: 'GST Number',                category: 'Company',  type: 'text' },
    { id: 'description',      label: 'Company Description',       category: 'Company',  type: 'textarea' },
    { id: 'source',           label: 'Company Source',            category: 'Company',  type: 'dropdown' },

    // ─────────────────────────────────────────────
    // ⚙️ SYSTEM — Computed / Agent
    // ─────────────────────────────────────────────
    { id: 'ownerMobile',      label: 'Agent Mobile Number',       category: 'System',   type: 'computed' },
    { id: 'ownerEmail',       label: 'Agent Email Address',       category: 'System',   type: 'computed' },
    { id: 'propertyList',     label: 'Matched Properties List',   category: 'System',   type: 'computed' },
    { id: 'requirementSummary', label: 'Requirement Summary Text', category: 'System',  type: 'computed' },
    { id: 'propertiesCount',  label: 'Count of Matched Properties', category: 'System', type: 'computed' },
];

/**
 * Returns variables grouped by their category.
 * Used for rendering grouped sections in the dropdown UI.
 */
export const getVariablesByCategory = () => {
    return variableDictionary.reduce((acc, curr) => {
        if (!acc[curr.category]) acc[curr.category] = [];
        acc[curr.category].push(curr);
        return acc;
    }, {});
};
