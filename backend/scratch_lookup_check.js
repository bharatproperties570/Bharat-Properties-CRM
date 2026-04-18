import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';

dotenv.config();

const checkLookups = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const types = await Lookup.distinct('lookup_type');
        console.log('Available Lookup Types:', types);
        
        const categories = await Lookup.find({ lookup_type: /Category/i });
        console.log('Categories Found:', categories.length);
        categories.forEach(c => console.log(` - ${c.lookup_value} (${c.lookup_type})`));

        const subCategories = await Lookup.find({ lookup_type: /SubCategory/i });
        console.log('SubCategories Found:', subCategories.length);
        
        const unitTypes = await Lookup.find({ lookup_type: /UnitType/i });
        console.log('UnitTypes Found:', unitTypes.length);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkLookups();
