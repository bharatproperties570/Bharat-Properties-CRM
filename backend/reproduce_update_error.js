import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

async function reproduce() {
    try {
        // First get a contact ID
        const getRes = await axios.get(`${API_URL}/contacts?limit=1`);
        if (!getRes.data.success || !getRes.data.records || getRes.data.records.length === 0) {
            console.log("No contacts found to update.");
            return;
        }

        const contact = getRes.data.records[0];
        console.log(`Updating contact: ${contact.name} (${contact._id})`);

        // Simulate the payload from FIXED AddContactModal
        const updatePayload = { ...contact };

        // --- MANUALLY NORMALIZE LIKE FIXED MODAL ---
        const embeddedFields = ["phones", "emails", "personalAddress", "correspondenceAddress", "educations", "loans", "socialMedia", "incomes", "documents"];

        for (const key in updatePayload) {
            if (updatePayload[key] && typeof updatePayload[key] === 'object') {
                if (embeddedFields.includes(key)) {
                    // Presever as is (embedded)
                    continue;
                }
                if (updatePayload[key]._id) {
                    updatePayload[key] = updatePayload[key]._id;
                }
            }
        }

        // Force some non-ID strings that should be resolved by the backend
        updatePayload.countryCode = "+91";
        updatePayload.designation = "Manager";
        updatePayload.source = "Web";

        // Strip internal fields
        const fieldsToStrip = ["_id", "id", "__v", "createdAt", "updatedAt", "fullName"];
        fieldsToStrip.forEach(field => delete updatePayload[field]);

        console.log("Sending update request...");
        try {
            const updateRes = await axios.put(`${API_URL}/contacts/${contact._id}`, updatePayload);
            console.log("Update Success:", updateRes.data.success);
            if (updateRes.data.success) {
                console.log("Fixed: resolved countryCode:", updateRes.data.data.countryCode);
                console.log("Fixed: phones preserved:", Array.isArray(updateRes.data.data.phones));
            }
        } catch (error) {
            console.error("Update Failed!");
            if (error.response) {
                console.error("Status:", error.response.status);
                console.error("Data:", JSON.stringify(error.response.data, null, 2));
            } else {
                console.error("Error:", error.message);
            }
        }

    } catch (error) {
        console.error("Reproduction failed:", error.message);
    }
}

reproduce();
