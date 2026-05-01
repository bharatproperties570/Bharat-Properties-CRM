import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const SmsTemplate = (await import('./src/modules/sms/smsTemplate.model.js')).default;
  const tpl = await SmsTemplate.findOne({ dltTemplateId: "1007654306507310081" });
  console.log("Template:", tpl.name, tpl.body);
  process.exit(0);
});
