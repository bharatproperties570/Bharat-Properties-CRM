import 'dotenv/config';
import axios from 'axios';

async function run() {
    try {
        const res = await axios.get('http://localhost:4000/api/contacts?limit=1');
        const contact = res.data.records[0];

        const getId = (val) => (val && typeof val === "object" ? val._id || val.id : val);

        let formData = {
            ...contact,
            title: getId(contact.title),
            countryCode: getId(contact.countryCode),
            campaign: getId(contact.campaign),
            source: getId(contact.source),
            subSource: getId(contact.subSource),
            professionCategory: getId(contact.professionCategory),
            professionSubCategory: getId(contact.professionSubCategory),
            designation: getId(contact.designation),
            visibleTo: getId(contact.visibleTo),
            team: getId(contact.team),
            owner: getId(contact.owner),
            educations: contact.educations?.map(e => ({
                ...e,
                degree: getId(e.degree)
            })) || [],
            loans: contact.loans?.map(l => ({
                ...l,
                loanType: getId(l.loanType),
                bank: getId(l.bank)
            })) || [],
            socialMedia: contact.socialMedia?.map(s => ({
                ...s,
                platform: getId(s.platform)
            })) || [],
            incomes: contact.incomes?.map(i => ({
                ...i,
                incomeType: getId(i.incomeType)
            })) || [],
            documents: contact.documents?.map(doc => ({
                ...doc,
                documentName: getId(doc.documentName),
                documentType: getId(doc.documentType),
                unitNumber: doc.unitNumber || doc.unitNo || ""
            })) || [],
            personalAddress: {
                ...(contact.personalAddress || {}),
                country: getId(contact.personalAddress?.country),
                state: getId(contact.personalAddress?.state),
                city: getId(contact.personalAddress?.city),
                location: getId(contact.personalAddress?.location),
                tehsil: getId(contact.personalAddress?.tehsil),
                postOffice: getId(contact.personalAddress?.postOffice),
            },
            correspondenceAddress: {
                ...(contact.correspondenceAddress || {}),
                country: getId(contact.correspondenceAddress?.country),
                state: getId(contact.correspondenceAddress?.state),
                city: getId(contact.correspondenceAddress?.city),
                location: getId(contact.correspondenceAddress?.location),
                tehsil: getId(contact.correspondenceAddress?.tehsil),
                postOffice: getId(contact.correspondenceAddress?.postOffice),
            }
        };

        const finalFormData = { ...formData };
        if (finalFormData.personalAddress && Object.values(finalFormData.personalAddress).every(v => !v)) {
            delete finalFormData.personalAddress;
        }

        const updateRes = await axios.put(`http://localhost:4000/api/contacts/${contact._id}`, finalFormData);
        console.log("Update Success:", updateRes.data);
    } catch (e) {
        if (e.response) {
            console.error("Update Failed:", e.response.status, JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("Error:", e.message);
        }
    }
}
run();
