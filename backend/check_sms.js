import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Activity = (await import('./models/Activity.js')).default;
  const acts = await Activity.find({ type: 'Marketing', subject: { $regex: /SMS/i } }).sort({ createdAt: -1 }).limit(5);
  console.log("Recent SMS Activities:");
  acts.forEach(a => console.log(a.subject, a.status, a.description, a.details));
  
  const SmsLog = (await import('./src/modules/sms/smsLog.model.js')).default;
  const smsLogs = await SmsLog.find().sort({ createdAt: -1 }).limit(5);
  console.log("\nRecent SMSLogs:");
  smsLogs.forEach(s => console.log(s.to, s.status, s.error));
  process.exit(0);
});
