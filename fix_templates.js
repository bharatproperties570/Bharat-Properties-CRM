const fs = require('fs');
let content = fs.readFileSync('src/constants/templates.js', 'utf8');

const map = {
    // Email templates
    'First name': 'first_name',
    'Company name': 'company_name',
    'Sender\\'s signature': 'agent_name',
    'Sender\\'s first name': 'agent_name',
    'PropertyList': 'property_list',
    'Address': 'property_location',
    'DealProject': 'project_name',
    'DealLocation': 'property_location',
    'DealPrice': 'property_price',
    'DealUnit': 'unit_number',
    'DealCategory': 'property_category',
    'DealSubCategory': 'property_subcategory',
    'DealBlock': 'block_name',
    'DealOwnership': 'property_subcategory', // close enough
    'DealSizeLabel': 'size_label',
    'DealStage': 'lead_stage',
    'DealBuiltupHTML': 'property_list_detailed',
    'DealOrientationStripHTML': 'property_list_detailed',
    'AgentMobile': 'agent_mobile',
    'Project_Name': 'project_name',
    
    // Feedback
    'unit': 'unit_number',
    'owner': 'full_name',
    'time': 'due_date',
    'reason': 'lead_status',
    
    // WhatsApp & SMS
    'ContactName': 'first_name',
    'PropertyType': 'property_category',
    'Location': 'property_location',
    'Size': 'property_size',
    'Price': 'property_price',
    'Highlights': 'property_list_default',
    'PropertyLink': 'property_list_detailed',
    'AgentName': 'agent_name',
    'AgentPhone': 'agent_mobile',
    'AgentEmail': 'agent_email',
    'PropertiesCount': 'properties_count',
    'MatchPercentage': 'match_percentage',
    'MatchReasons': 'requirement_summary',
    'CompetingBuyers': 'properties_count',
    'Slot1': 'due_date',
    'Slot2': 'due_date',
    'Slot3': 'due_date',
    'RequirementSummary': 'requirement_summary',
    'MatchCount': 'properties_count',
    'PositiveFeedback': 'lead_status',
    'Concerns': 'lead_requirement',
    'NextSteps': 'lead_stage',
    'OldPrice': 'property_price',
    'NewPrice': 'property_price',
    'Savings': 'property_price',
    'DocumentList': 'document_list',
    'Deadline': 'due_date',
    'PropertyName': 'project_name',
    'Amount': 'amount',
    'DueDate': 'due_date',
    'PaymentType': 'lead_status',
    'PaymentMethods': 'lead_status',
    
    // SMS numbers
    '1': 'first_name',
    '2': 'property_category',
    '3': 'property_location',
    '4': 'property_size',
    '5': 'property_price',
    '6': 'property_list_detailed',
    '7': 'agent_mobile',
    '8': 'due_date',
    
    // Deals tags
    'firstName': 'first_name',
    'size': 'property_size',
    'projectName': 'project_name',
    'location': 'property_location',
    'price': 'property_price',
};

// 1. Replace {{...}}
content = content.replace(/\{\{([^}]+)\}\}/g, (match, p1) => {
    let key = p1.trim();
    if (map[key]) return `{{${map[key]}}}`;
    return match;
});

// 2. Replace {...} (for the fb_ templates)
content = content.replace(/(?<!\{)\{([^}]+)\}(?!\})/g, (match, p1) => {
    let key = p1.trim();
    if (map[key]) return `{{${map[key]}}}`;
    return match;
});

fs.writeFileSync('src/constants/templates.js', content);
console.log('Templates updated!');
