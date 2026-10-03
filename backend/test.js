import mongoose from 'mongoose';

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || (() => { throw new Error('CRITICAL: MONGODB_URI required.') })());
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
