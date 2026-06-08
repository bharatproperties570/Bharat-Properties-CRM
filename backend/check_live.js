import fetch from 'node-fetch';

async function run() {
    try {
        const requiredTypes = [
            'UnitType', 'Category', 'SubCategory', 'PropertyType', 'BuiltupType', 'Facing', 'RoadWidth', 
            'Direction', 'Relation', 'CompanyType', 'Industry', 'Size',
            'Status', 'State', 'City', 'Location', 'Area', 'Pincode', 'Tehsil', 'PostOffice', 'Country',
            'Source', 'Stage', 'Title', 'Requirement', 'SubRequirement', 'Budget', 'Campaign', 'SubSource',
            'TransactionType', 'FundingType', 'FurnishingStatus', 'Timeline', 'PossessionStatus',
            'DocumentCategory', 'Document-Category', 'DocumentType', 'Document-Type'
        ];
        const res = await fetch(`https://api.bharatproperties.co/api/lookups?lookup_type=${requiredTypes.join(',')}`);
        const data = await res.json();
        console.log("Success?", data.success || data.status);
        if (data.data) {
            const types = [...new Set(data.data.map(l => l.lookup_type))];
            console.log("Missing BuiltupType?", !types.includes('BuiltupType'));
            console.log("Missing PossessionStatus?", !types.includes('PossessionStatus'));
        }
    } catch (e) {
        console.error(e);
    }
}
run();
