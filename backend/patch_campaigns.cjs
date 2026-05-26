const mongoose = require('mongoose');
const MONGO_URI = 'mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(MONGO_URI);

const schema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { collection: 'systemsettings' });

const SystemSetting = mongoose.model('SystemSetting', schema);

async function patch() {
    try {
        const doc = await SystemSetting.findOne({ key: 'leadMasterFields' });
        if (!doc) {
            console.log('No leadMasterFields found.');
            process.exit(0);
        }
        const data = doc.value;
        const online = { name: 'Online Campaign', sources: [ { name: 'Facebook Ads', mediums: ['Lead Gen Form', 'Website Traffic'] }, { name: 'Google Ads', mediums: ['Search Network'] }, { name: 'Property Portals', mediums: ['MagicBricks', '99acres'] } ] };
        const organic = { name: 'Organic Campaign', sources: [ { name: 'Website SEO', mediums: ['Google Search'] }, { name: 'Referral', mediums: ['Existing Client'] } ] };
        
        let updated = false;
        if (!data.campaigns) data.campaigns = [];
        if (!data.campaigns.some(c => c.name === 'Online Campaign')) { data.campaigns.push(online); updated = true; }
        if (!data.campaigns.some(c => c.name === 'Organic Campaign')) { data.campaigns.push(organic); updated = true; }
        
        if (updated) {
            await SystemSetting.updateOne({ key: 'leadMasterFields' }, { $set: { value: data } });
            console.log('Successfully patched live DB!');
        } else {
            console.log('Already has Online and Organic campaigns.');
        }
        process.exit(0);
    } catch(e) { console.error(e); process.exit(1); }
}
patch();
