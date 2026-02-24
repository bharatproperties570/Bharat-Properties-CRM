
import axios from 'axios';

async function testGetAll() {
    try {
        console.log('Fetching all system settings...');
        const response = await axios.get('http://localhost:4000/api/system-settings');
        console.log('Response Status:', response.data.status);
        console.log('Docs Count:', response.data.data.docs ? response.data.data.docs.length : 'N/A');

        if (response.data.data.docs) {
            response.data.data.docs.forEach(d => {
                console.log(`- Key: ${d.key}, Category: ${d.category}`);
            });

            const propConfig = response.data.data.docs.find(d => d.key === 'property_config');
            if (propConfig) {
                console.log('\n✅ property_config found in getAll response!');
                // console.log(JSON.stringify(propConfig.value).substring(0, 100));
            } else {
                console.log('\n❌ property_config NOT found in getAll response!');
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testGetAll();
