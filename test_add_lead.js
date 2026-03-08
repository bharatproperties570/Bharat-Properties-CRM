import axios from 'axios';

async function testAddLead() {
    try {
        const payload = {
            firstName: "Test",
            lastName: "Lead",
            mobile: "9998887771",
            email: "testlead1@example.com",
            requirement: "Buy",
            source: "Direct",
            stage: "New",
            status: "Active",
            owner: "677d2a58b0f4f728c31cb1d9",
            assignment: {
                team: ["677d33fc9b596205cf373d32"],
                visibleTo: "Everyone"
            }
        };
        const res = await axios.post('http://localhost:4000/api/leads', payload);
        console.log("Success:", res.data);
    } catch (err) {
        console.error("Error:", err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
    }
}
testAddLead();
