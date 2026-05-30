import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SystemSetting from './src/modules/systemSettings/system.model.js';

dotenv.config({ path: 'backend/.env' });

const mongoUri = process.env.MONGODB_URI;

async function run() {
    console.log("Connecting to MongoDB at:", mongoUri);
    await mongoose.connect(mongoUri);
    console.log("Connected successfully!");

    // 1. Fetch current master_fields
    const setting = await SystemSetting.findOne({ key: 'master_fields' });
    if (!setting) {
        console.error("❌ master_fields config not found in DB!");
        process.exit(1);
    }

    console.log("Current templates found. Updating to optimized Utility category templates...");

    const updatedTemplates = {
        ...setting.value.responseTemplates,
        "Interested / Hot": {
            "whatsapp": "Dear {owner}, this is an automated confirmation of your scheduled appointment regarding Unit {unit}. Your meeting is confirmed for {time}. Please ensure all original property documents are kept ready for verification. Thank you, Bharat Properties.",
            "sms": "Appt Confirmed - Unit {unit}: Dear {owner}, meeting scheduled for {time}. Keep original documents ready. Regards, Bharat Properties.",
            "email": "Subject: Appointment Confirmation: Unit {unit}\n\nDear {owner},\n\nThis is an automated confirmation of your scheduled appointment regarding Unit {unit}.\n\nYour meeting is confirmed for {time}. Please ensure all original property documents are kept ready for verification.\n\nBest regards,\nBharat Properties"
        },
        "Interested / Warm": {
            "whatsapp": "Dear {owner}, we have updated your account status regarding Unit {unit}. Your interest for {reason} has been registered successfully. A detailed local market report will be generated and shared with you shortly. Thank you, Bharat Properties.",
            "sms": "Account Update - Unit {unit}: Dear {owner}, interest for {reason} registered. Local market report will follow. Regards, Bharat Properties.",
            "email": "Subject: Account Update: Unit {unit}\n\nDear {owner},\n\nWe have updated your account status regarding Unit {unit}.\n\nYour interest for {reason} has been registered successfully. A detailed local market report will be generated and shared with you shortly.\n\nBest regards,\nBharat Properties"
        },
        "Request Call Back": {
            "whatsapp": "Dear {owner}, your callback request regarding Unit {unit} has been registered in our system. A representative is scheduled to contact you at {time}. Thank you, Bharat Properties.",
            "sms": "Call Back Update - Unit {unit}: Dear {owner}, callback registered for {time}. A rep will call you. Regards, Bharat Properties.",
            "email": "Subject: Callback Request Registered: Unit {unit}\n\nDear {owner},\n\nYour callback request regarding Unit {unit} has been registered in our system.\n\nA representative is scheduled to contact you at {time}.\n\nBest regards,\nBharat Properties"
        },
        "Not Interested": {
            "whatsapp": "Dear {owner}, this is an automated status update confirming that your file regarding Unit {unit} has been marked as inactive due to: {reason}. All further outreach has been paused as per your request. Thank you, Bharat Properties.",
            "sms": "Status Update - Unit {unit}: Dear {owner}, file marked as inactive due to: {reason}. All outreach paused. Regards, Bharat Properties.",
            "email": "Subject: Status Update: Inactive File for Unit {unit}\n\nDear {owner},\n\nThis is an automated status update confirming that your file regarding Unit {unit} has been marked as inactive due to: {reason}.\n\nAll further outreach has been paused as per your request.\n\nBest regards,\nBharat Properties"
        },
        "Busy / Driving": {
            "whatsapp": "Dear {owner}, this is a service notification to inform you that we attempted to contact you regarding Unit {unit}. We will attempt to reconnect with you later today at a convenient time. Thank you, Bharat Properties.",
            "sms": "Service Notification - Unit {unit}: Dear {owner}, tried contacting you. Will try calling again later today. Regards, Bharat Properties.",
            "email": "Subject: Service Notification: Missed Call regarding Unit {unit}\n\nDear {owner},\n\nThis is a service notification to inform you that we attempted to contact you regarding Unit {unit}.\n\nWe will attempt to reconnect with you later today at a convenient time.\n\nBest regards,\nBharat Properties"
        },
        "Market Feedback": {
            "whatsapp": "Dear {owner}, thank you for providing your feedback regarding Unit {unit}. Your inputs have been recorded for our local market valuation report. We will notify you once the assessment is finalized. Thank you, Bharat Properties.",
            "sms": "Feedback Update - Unit {unit}: Dear {owner}, feedback recorded for valuation report. Notification to follow. Regards, Bharat Properties.",
            "email": "Subject: Valuation Report Update: Feedback Recorded for Unit {unit}\n\nDear {owner},\n\nThank you for providing your feedback regarding Unit {unit}.\n\nYour inputs have been recorded for our local market valuation report. We will notify you once the assessment is finalized.\n\nBest regards,\nBharat Properties"
        }
    };

    // 2. Perform DB update
    setting.value.responseTemplates = updatedTemplates;
    setting.markModified('value');
    await setting.save();

    console.log("✅ Successfully updated responseTemplates in master_fields!");
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
}

run().catch(console.error);
