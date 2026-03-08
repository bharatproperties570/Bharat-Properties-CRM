import axios from 'axios';

async function testContactSave() {
    try {
        const payload = {
            name: "Test Contact",
            phones: [{ number: "9876543210", type: "Personal" }],
            emails: [{ address: "test@example.com", type: "Personal" }],
            stage: "New",
            owner: "677d2a58b0f4f728c31cb1d9", // A typical internal owner ObjectId, or omit if optional
            team: "677d33fc9b596205cf373d32", // Internal team ObjectId
            visibleTo: "Public"
        };
        const res = await axios.post('http://localhost:4000/api/contacts', payload);
        console.log("Success:", res.data);
    } catch (err) {
        console.error("Error:", err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
    }
}
testContactSave();
