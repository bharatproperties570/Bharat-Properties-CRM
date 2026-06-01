import axios from 'axios';

async function run() {
    try {
        const requiredTypes = [
            'UnitType', 'Category', 'SubCategory', 'PropertyType', 'BuiltupType', 'Facing', 'RoadWidth', 
            'Direction', 'Relation', 'CompanyType', 'Industry', 'Size',
            'Status', 'State', 'City', 'Location', 'Area', 'Pincode', 'Tehsil', 'PostOffice', 'Country',
            'Source', 'Stage', 'Title', 'Requirement', 'SubRequirement', 'Budget', 'Campaign', 'SubSource',
            'TransactionType', 'FundingType', 'FurnishingStatus', 'Timeline',
            'DocumentCategory', 'Document-Category', 'DocumentType', 'Document-Type'
        ];
        
        // We query local backend
        const url = `http://localhost:4000/api/lookups?lookup_type=${requiredTypes.join(',')}`;
        console.log("Querying url:", url);
        
        const response = await axios.get(url);
        const data = response.data.data || [];
        console.log(`Received ${data.length} lookups.`);
        
        const types = {};
        data.forEach(l => {
            types[l.lookup_type] = (types[l.lookup_type] || 0) + 1;
        });
        console.log("Lookup types count in response:", types);
        
        const targetIds = ['69a96e243a56674b285e0100', '69d5f061f6f81d802814426c', '699beeb0ee5159cfdb8f3ed2'];
        const found = data.filter(l => targetIds.includes(String(l._id)));
        console.log("Found target IDs in API response:", found);
        
    } catch (err) {
        console.error(err);
    }
}

run();
