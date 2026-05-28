import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const { default: SystemSetting } = await import("./src/modules/systemSettings/system.model.js");
    const setting = await SystemSetting.findOne({ key: 'leadMasterFields' });
    if(setting) {
        const defaultCampaigns = [
            {
                name: 'Offline Campaign',
                sources: [
                    { name: 'Cold Call', mediums: ['Database 1', 'Database 2'] },
                    { name: 'Newspaper Ad', mediums: ['Times of India', 'Hindustan Times'] },
                    { name: 'Hoarding', mediums: ['Sector 18', 'Main Highway'] }
                ]
            },
            {
                name: 'Online Campaign',
                sources: [
                    { name: 'Facebook Ads', mediums: ['Lead Gen Form', 'Website Traffic'] },
                    { name: 'Google Ads', mediums: ['Search Network', 'Display Network'] },
                    { name: 'Instagram Ads', mediums: ['Story Ads', 'Feed Ads'] },
                    { name: 'Property Portals', mediums: ['MagicBricks', '99acres', 'Housing.com'] }
                ]
            },
            {
                name: 'Organic Campaign',
                sources: [
                    { name: 'Website SEO', mediums: ['Google Search', 'Bing Search'] },
                    { name: 'Social Media Organic', mediums: ['Facebook Page', 'Instagram Profile', 'LinkedIn'] },
                    { name: 'Referral', mediums: ['Existing Client', 'Channel Partner'] },
                    { name: 'Direct Walk-in', mediums: ['Office Visit', 'Site Visit'] }
                ]
            }
        ];
        
        // Merge offline with defaults (in case they added new sources to offline)
        // Actually, let's just make sure all three exist.
        const currentCampaigns = setting.value.campaigns || [];
        
        defaultCampaigns.forEach(dc => {
            if (!currentCampaigns.find(c => c.name === dc.name)) {
                currentCampaigns.push(dc);
            }
        });
        
        setting.value.campaigns = currentCampaigns;
        setting.markModified('value');
        await setting.save();
        console.log("Restored campaigns!");
    } else {
        console.log("No setting found");
    }
    process.exit();
});
