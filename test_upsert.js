
import axios from 'axios';

async function testUpsert() {
    const key = 'test_config_' + Date.now();
    const data = {
        category: 'test',
        value: { foo: 'bar' },
        description: 'Test upsert from script'
    };

    try {
        console.log(`Testing upsert for key: ${key}...`);
        const response = await axios.post('http://localhost:4000/api/system-settings/upsert', {
            key,
            ...data
        });
        console.log('Response:', response.data);

        if (response.data.status === 'success') {
            console.log('✅ Upsert successful!');
        } else {
            console.log('❌ Upsert failed!');
        }
    } catch (error) {
        console.error('❌ Error during upsert:', error.response ? error.response.data : error.message);
    }
}

testUpsert();
