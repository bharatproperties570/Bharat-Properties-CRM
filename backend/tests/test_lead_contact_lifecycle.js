import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lead from '../models/Lead.js';
import Contact from '../models/Contact.js';
import { addLead, updateLead } from '../controllers/lead.controller.js';
import { resolveContactIdentity } from '../services/contactIdentity.service.js';

dotenv.config();

// Create mock Request/Response for controllers
const mockReq = (body, params = {}) => ({ body, params, user: { id: new mongoose.Types.ObjectId() } });
const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    return res;
};

async function runTests() {
    console.log("Connecting to TEST DB...");
    await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/bharatproperties_test_phase46h');
    
    console.log("Clearing leads and contacts...");
    await Lead.deleteMany({});
    await Contact.deleteMany({});

    console.log("\n--- TEST A: Duplicate Lead Phone ---");
    let req1 = mockReq({ firstName: 'A1', mobile: '9999999991' });
    let res1 = mockRes();
    await addLead(req1, res1, () => {});
    
    let req2 = mockReq({ firstName: 'A2', mobile: '9999999991' });
    let res2 = mockRes();
    await addLead(req2, res2, () => {});

    const countA = await Lead.countDocuments({ mobile: '9999999991' });
    if (countA === 2) console.log("✅ TEST A PASSED (2 Leads created, no merge)");
    else console.error("❌ TEST A FAILED", countA);

    console.log("\n--- TEST B: Duplicate Lead Email ---");
    let req3 = mockReq({ firstName: 'B1', mobile: '9999999992', email: 'testb@test.com' });
    let res3 = mockRes();
    await addLead(req3, res3, () => {});

    let req4 = mockReq({ firstName: 'B2', mobile: '9999999993', email: 'testb@test.com' });
    let res4 = mockRes();
    await addLead(req4, res4, () => {});

    const countB = await Lead.countDocuments({ email: 'testb@test.com' });
    if (countB === 2) console.log("✅ TEST B PASSED");
    else console.error("❌ TEST B FAILED", countB);

    console.log("\n--- TEST C: Empty Email ---");
    let req5 = mockReq({ firstName: 'C1', mobile: '8888888881', email: '' });
    let res5 = mockRes();
    await addLead(req5, res5, () => {});

    let req6 = mockReq({ firstName: 'C2', mobile: '8888888882', email: '   ' });
    let res6 = mockRes();
    await addLead(req6, res6, () => {});
    
    const leadsC = await Lead.find({ firstName: { $in: ['C1', 'C2'] } });
    if (leadsC.length === 2 && leadsC[0].email === null && leadsC[1].email === null) console.log("✅ TEST C PASSED (empty email to null)");
    else console.error("❌ TEST C FAILED");

    console.log("\n--- TEST D & E & F & G: Option C Lifecycle Removed ---");
    console.log("The architecture correction removed Opportunity based creation.");
    console.log("Testing Lead -> Contact Identity Creation directly at addLead...");
    
    let reqD = mockReq({ firstName: 'D1', mobile: '7777777771' });
    let resD = mockRes();
    await addLead(reqD, resD, () => {});
    const leadD = await Lead.findById(resD.data?.data?._id || resD.data?.lead?._id);
    
    if (leadD && leadD.contactDetails) {
        console.log("✅ TEST D/E PASSED (Contact created and linked at Lead creation)");
        const contactD = await Contact.findById(leadD.contactDetails);
        if (contactD.phones[0].number === '7777777771') console.log("   ✅ Contact phone correct.");
        
        let reqD2 = mockReq({ firstName: 'D2', mobile: '7777777771' });
        let resD2 = mockRes();
        await addLead(reqD2, resD2, () => {});
        const leadD2 = await Lead.findById(resD2.data?.data?._id || resD2.data?.lead?._id);
        
        if (leadD2 && String(leadD2.contactDetails) === String(contactD._id)) {
            console.log("   ✅ Second lead successfully linked to same contact.");
        } else {
            console.error("   ❌ Second lead did not link to same contact.", leadD2);
        }
    } else {
        console.error("❌ TEST D/E FAILED (Lead not linked to Contact)", resD.data, leadD);
    }

    console.log("\n--- TEST I: Identity Conflict ---");
    const contactI_A = await Contact.create({ name: 'I1', phones: [{ number: '6666666661' }]});
    const contactI_B = await Contact.create({ name: 'I2', emails: [{ address: 'testi@test.com' }]});

    let reqI = mockReq({ firstName: 'I3', mobile: '6666666661', email: 'testi@test.com' });
    let resI = mockRes();
    await addLead(reqI, resI, () => {});
    
    const leadI = await Lead.findById(resI.data?.data?._id || resI.data?.lead?._id);
    if (leadI) {
        console.log("✅ TEST I PASSED (Lead creation succeeded despite conflict)");
    } else {
        console.error("❌ TEST I FAILED");
    }

    console.log("\nTests Finished. Cleaning up...");
    await mongoose.disconnect();
}

// runTests();
