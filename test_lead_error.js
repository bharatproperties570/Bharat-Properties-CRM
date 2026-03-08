import axios from 'axios';

async function reproduceLeadError() {
    try {
        const formData = {
            title: "Mr.",
            name: "Fail",
            surname: "Test",
            phones: [{ number: "9998887779", type: "Personal" }],
            emails: [],
            requirement: "Buy",
            source: "Direct",
            stage: "New",
            status: "Active",
            owner: "677d2a58b0f4f728c31cb1d9",
            team: "677d33fc9b596205cf373d32",
            visibleTo: "Everyone",
            contactDetails: "69a8f6698cbd801bd430359c" // Mock valid ObjectId
        };

        // Exact transformed logic from AddLeadModal
        const transformedData = {
            ...formData,
            propertyType: [],
            subType: [],
            unitType: [],
            facing: [],
            roadWidth: [],
            direction: []
        };

        // Final cleanup logic from modal
        const normalizeRefs = (obj, parentKey = null) => {
            if (!obj || typeof obj !== 'object') return obj;
            const result = Array.isArray(obj) ? [...obj] : { ...obj };
            const embeddedFields = ["phones", "emails", "personalAddress", "correspondenceAddress", "educations", "loans", "socialMedia", "incomes", "documents"];

            if (Array.isArray(result)) {
                if (embeddedFields.includes(parentKey)) {
                    return result.map(item => normalizeRefs(item));
                }
                return result.map(item => (item && typeof item === 'object' && item._id) ? item._id : item);
            }

            for (const key in result) {
                if (result[key] && typeof result[key] === 'object') {
                    if (embeddedFields.includes(key)) {
                        result[key] = normalizeRefs(result[key], key);
                    } else if (result[key]._id) {
                        result[key] = result[key]._id;
                    } else if (Array.isArray(result[key])) {
                        result[key] = result[key].map(item =>
                            (item && typeof item === 'object' && item._id) ? item._id : item
                        );
                    }
                }
            }
            return result;
        };

        const finalLeadPayload = normalizeRefs(transformedData);
        // also add required lead fields
        finalLeadPayload.firstName = formData.name;
        finalLeadPayload.lastName = formData.surname;
        finalLeadPayload.salutation = formData.title;
        finalLeadPayload.mobile = formData.phones[0].number;

        console.log("Sending payload:", JSON.stringify(finalLeadPayload, null, 2));

        const res = await axios.post('http://localhost:4000/api/leads', finalLeadPayload);
        console.log("Success:", res.data);
    } catch (err) {
        console.error("Error:", err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
    }
}
reproduceLeadError();
