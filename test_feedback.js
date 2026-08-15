const mongoose = require('mongoose');

async function test() {
    await mongoose.connect('mongodb://127.0.0.1:27017/bharat_crm');
    const FeedbackForm = mongoose.model('FeedbackForm', new mongoose.Schema({}, { strict: false }));
    const forms = await FeedbackForm.find({}, { name: 1, slug: 1, isActive: 1 }).lean();
    console.log(forms);
    process.exit(0);
}

test();
