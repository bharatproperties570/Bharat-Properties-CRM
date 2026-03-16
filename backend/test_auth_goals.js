import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:4001/api';

async function testAuthAndGoals() {
    try {
        console.log("Attempting login...");
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@bharatproperties.com',
            password: 'admin123'
        });

        if (!loginRes.data.success) {
            console.error("Login failed:", loginRes.data);
            return;
        }

        const token = loginRes.data.token;
        console.log("✅ Login successful. Token obtained.");

        console.log("\nAttempting to fetch sales goals users...");
        try {
            const usersRes = await axios.get(`${API_URL}/sales-goals/users`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log("✅ Fetch users successful:", usersRes.data.success);
            console.log("Data count:", usersRes.data.data.length);
        } catch (err) {
            console.error("❌ Fetch users failed:", err.response?.status, err.response?.data || err.message);
        }

        console.log("\nAttempting to fetch sales goals...");
        try {
            const goalsRes = await axios.get(`${API_URL}/sales-goals`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log("✅ Fetch goals successful:", goalsRes.data.success);
            console.log("Data count:", goalsRes.data.data.length);
        } catch (err) {
            console.error("❌ Fetch goals failed:", err.response?.status, err.response?.data || err.message);
        }

    } catch (error) {
        console.error("CRITICAL ERROR:", error.response?.status, error.response?.data || error.message);
    }
}

testAuthAndGoals();
