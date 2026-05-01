import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const queue = (await import('./src/config/redis.js')).marketingQueue;
    if(queue) {
        await queue.add('blast', {
            channel: 'sms',
            name: 'Test Manual SMS Blast',
            subject: 'Test Subject',
            message: 'Hello Customer, noted on Deal as Pending. Reach out if plans change. Thanks.',
            html: '',
            templateName: undefined,
            templateLang: 'en_US',
            templateComponents: [],
            waMapping: {},
            smsData: { category: 'Transactional' },
            mobiles: ['9991000570'],
            emails: [],
            leads: [{ id: '6523abc123', name: 'Test User', mobile: '9991000570' }],
            isScheduled: false
        }, { removeOnComplete: true, attempts: 1 });
        console.log("Job added to Queue");
    } else {
        console.log("Redis queue not available");
    }
    
    setTimeout(() => process.exit(0), 3000);
});
