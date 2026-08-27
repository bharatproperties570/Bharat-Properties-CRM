import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/bharat-properties-crm/backend/.env' });

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const lookupsArray = await mongoose.connection.db.collection('lookups').find({
        lookup_type: { $in: ['Category', 'SubCategory', 'PropertyType', 'BuiltupType'] }
    }).toArray();

    const lookups = {};
    lookupsArray.forEach(l => {
        if (!lookups[l.lookup_type]) lookups[l.lookup_type] = [];
        lookups[l.lookup_type].push(l);
    });

    const newConfig = {};
    const categories = lookups.Category || [];
    const subCategories = lookups.SubCategory || [];
    const propertyTypes = lookups.PropertyType || [];
    
    categories.forEach(cat => {
        if (!cat.lookup_value) return;
        const catName = cat.lookup_value;
        newConfig[catName] = { subCategories: [] };
        
        const subs = subCategories.filter(s => {
            const pid = s.parent_lookup_id ? s.parent_lookup_id.toString() : null;
            return pid === cat._id?.toString() || pid === cat.id?.toString();
        });
        
        subs.forEach(sub => {
            if (!sub.lookup_value) return;
            const subObj = { name: sub.lookup_value, types: [] };
            
            const types = propertyTypes.filter(t => {
                const pid = t.parent_lookup_id ? t.parent_lookup_id.toString() : null;
                return pid === sub._id?.toString() || pid === sub.id?.toString();
            });
            
            types.forEach(t => {
                if (t.lookup_value) subObj.types.push({ name: t.lookup_value });
            });
            
            newConfig[catName].subCategories.push(subObj);
        });
    });

    console.log(JSON.stringify(newConfig, null, 2));
    process.exit(0);
});
