import axios from "axios";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const runTest = async () => {
    try {
        const token = jwt.sign(
            { id: "69842a2283eb26f4f2de2d85", email: "bharatproperties570@gmail.com", role: "admin" }, // Replace ID if needed, but it should work for token validation
            process.env.JWT_SECRET || "supersecretkey123",
            { expiresIn: '1h' }
        );

        console.log("Fetching from AWS API...");
        const response = await axios.get("https://api.bharatproperties.co/api/inventory?page=1&limit=25", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log("Response Status:", response.status);
        console.log("Success:", response.data.success);
        console.log("Records Length:", response.data.records?.length);
    } catch (err) {
        console.error("Test Script Error:");
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", err.response.data);
        } else {
            console.error(err.message);
        }
        process.exit(1);
    }
};

runTest();
