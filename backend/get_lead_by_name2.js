import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const leads = await Lead.find({}).sort({createdAt: -1}).limit(3).lean();
    console.log(JSON.stringify(leads.map(l => ({ id: l._id, name: l.firstName, mobile: l.mobile, phone: l.phone, emails: l.emails, phones: l.phones })), null, 2));
    process.exit(0);
}
run();
