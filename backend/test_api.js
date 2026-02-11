import axios from 'axios';
import util from 'util';

const test = async () => {
    try {
        const res = await axios.get('http://localhost:5002/lookups', {
            params: { lookup_type: 'CompanyType', limit: 1000 }
        });
        console.log('Success:', util.inspect(res.data, { depth: null }));
    } catch (error) {
        if (error.response) {
            console.log('Error Status:', error.response.status);
            console.log('Error Data:', util.inspect(error.response.data, { depth: null }));
        } else {
            console.log('Full Error:', util.inspect(error, { depth: null }));
        }
    }
};

test();
