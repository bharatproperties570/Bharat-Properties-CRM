import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import SystemSetting from './src/modules/systemSettings/system.model.js';

async function restoreCampaigns() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const doc = await SystemSetting.findOne({ key: 'leadMasterFields' });
        
        if (!doc) {
            console.log('leadMasterFields not found');
            process.exit(0);
        }

        let campaigns = doc.value.campaigns || [];
        
        const organic = {
            "name": "Organic Campaign",
            "sources": [
                {
                    "name": "Walk-in",
                    "mediums": ["Office Visit"]
                },
                {
                    "name": "Referral",
                    "mediums": ["Client Referral", "Employee Referral", "Partner Referral"]
                },
                {
                    "name": "Website",
                    "mediums": ["Contact Form", "Chatbot", "Direct Call"]
                },
                {
                    "name": "Old Client",
                    "mediums": ["Call", "SMS", "Whatsapp"]
                }
            ]
        };

        const online = {
            "name": "Online Campaign",
            "sources": [
                {
                    "name": "Facebook",
                    "mediums": ["Lead Form", "Messenger", "Comment", "Post", "Marketplace"]
                },
                {
                    "name": "Instagram",
                    "mediums": ["DM", "Story Reply", "Ad Click", "Bio Link"]
                },
                {
                    "name": "Google Ads",
                    "mediums": ["Search Ad", "Display Ad", "YouTube Ad"]
                },
                {
                    "name": "LinkedIn",
                    "mediums": ["InMail", "Post", "Lead Gen Form"]
                },
                {
                    "name": "X",
                    "mediums": []
                },
                {
                    "name": "Olx",
                    "mediums": []
                },
                {
                    "name": "99 Acre",
                    "mediums": ["Email", "99 Acre Panel"]
                },
                {
                    "name": "Real Estate India",
                    "mediums": []
                },
                {
                    "name": "Square Yard",
                    "mediums": []
                },
                {
                    "name": "Megicbricks",
                    "mediums": []
                },
                {
                    "name": "Common Floor",
                    "mediums": []
                },
                {
                    "name": "Housing",
                    "mediums": []
                }
            ]
        };

        // Filter out existing ones just in case to prevent duplicates
        campaigns = campaigns.filter(c => c.name !== 'Organic Campaign' && c.name !== 'Online Campaign');

        // Add them back at the top
        campaigns.unshift(online);
        campaigns.unshift(organic);

        doc.value.campaigns = campaigns;
        
        // Mongoose needs to know the Mixed object changed
        doc.markModified('value');
        
        await doc.save();
        console.log('Campaigns successfully restored!');
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

restoreCampaigns();
