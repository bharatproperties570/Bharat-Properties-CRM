
import axios from 'axios';

async function testGetAllWithLimit() {
    try {
        console.log('Fetching all system settings with limit=100...');
        const response = await axios.get('http://localhost:4000/api/system-settings?limit=100');
        console.log('Response Status Code:', response.status);
        console.log('Response Data Status:', response.data.status);

        if (response.data.data && response.data.data.docs) {
            console.log('Docs Count:', response.data.data.docs.length);
            const propConfig = response.data.data.docs.find(d => d.key === 'property_config');
            if (propConfig) {
                console.log('\n✅ property_config found in response!');
                console.log('Category keys:', Object.keys(propConfig.value).join(', '));
            } else {
                console.log('\n❌ property_config NOT found in response!');
            }
        } else {
            console.log('❌ Unexpected data format:', response.data);
        }
    } catch (error) {
        if (error.response) {
            console.error('❌ Server Error:', error.response.status, error.response.data);
        } else if (error.request) {
            console.error('❌ No Response Received:', error.request);
        } else {
            console.error('❌ Error Message:', error.message);
        }
    }
}

testGetAllWithLimit();
