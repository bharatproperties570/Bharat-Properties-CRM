import axios from 'axios';

const test = async () => {
    const types = [
        "Title",
        "Source",
        "ProfessionalCategory",
        "Team",
        "Visibility",
        "Document-Category",
        "Education-Level"
    ];

    for (const type of types) {
        try {
            const res = await axios.get(`http://localhost:5002/lookups?lookup_type=${type}`);
            const data = res.data.data;
            const distinctTypesInResponse = [...new Set(data.map(item => item.lookup_type))];

            console.log(`Type: ${type}`);
            console.log(`  Count: ${data.length}`);
            console.log(`  Distinct types in response: ${distinctTypesInResponse}`);
            if (data.length > 0) {
                console.log(`  Sample: ${data[0].lookup_value}`);
            }

            // Check if any returned item has a different lookup_type
            const mismatched = data.filter(item => item.lookup_type !== type);
            if (mismatched.length > 0) {
                console.log(`  ALERT: Found ${mismatched.length} mismatching items!`);
            }
        } catch (error) {
            console.error(`Error for ${type}:`, error.message);
        }
    }
};

test();
