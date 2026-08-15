import mongoose from 'mongoose';

async function test() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/bharat_crm');
        const FeedbackForm = mongoose.model('FeedbackForm', new mongoose.Schema({}, { strict: false }));
        const forms = await FeedbackForm.find({}, { name: 1, slug: 1, isActive: 1 }).lean();
        console.log("ALL FEEDBACK FORMS:", JSON.stringify(forms, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
    process.exit(0);
}

test();
