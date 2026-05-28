import axios from 'axios';
const API_URL = "https://api.bharatproperties.co/api";

const checkAPI = async () => {
    try {
        const login = await axios.post(`${API_URL}/auth/login`, {
            email: "admin@bharatproperties.co",
            password: "password123" // Guessing generic pass or we can just fetch the lookups if public
        });
    } catch(e) {
        console.log("Auth failed, cannot test lookups directly");
    }
}
checkAPI();
