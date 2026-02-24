
import axios from 'axios';

async function testUpdateExisting() {
    const key = 'property_config';
    const data = {
        category: 'property',
        value: { Residential: { subCategories: [] }, test: 'updated' },
        description: 'Test update of existing config'
    };

    try {
        console.log(`Testing update for existing key: ${key}...`);
        const response = await axios.post('http://localhost:4000/api/system-settings/upsert', {
            key,
            ...data
        });
        console.log('Response status:', response.data.status);
        console.log('Updated At:', response.data.data.updatedAt);

        if (response.data.status === 'success') {
            console.log('✅ Update successful!');
        }
    } catch (error) {
        console.error('❌ Error:', error.response ? error.response.data : error.message);
    }
}

testUpdateExisting();
