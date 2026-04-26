import axios from 'axios';

const testApi = async () => {
    try {
        // Try hitting the local API directly
        const res = await axios.get('http://localhost:4000/api/leads?limit=5');
        console.log('✅ Leads API Status:', res.status);
        console.log('Leads Count in Response:', res.data.data?.length || res.data.leads?.length || 'Unknown');
        console.log('Sample Lead:', res.data.data?.[0]?.name || res.data.leads?.[0]?.name || 'No Name');
    } catch (err) {
        console.error('❌ API Test Failed:', err.message);
        if (err.response) {
            console.error('Response Status:', err.response.status);
            console.error('Response Data:', err.response.data);
        }
    }
};

testApi();
