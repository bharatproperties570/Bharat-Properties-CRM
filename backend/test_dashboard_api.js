import axios from 'axios';

async function testApi() {
    try {
        const response = await axios.get('http://localhost:4000/api/dashboard/stats');
        console.log("API Response:", JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error("API Call Failed:", error.message);
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        }
    }
}

testApi();
