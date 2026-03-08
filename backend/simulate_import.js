
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const resolveLookup = async (Lookup, type, value) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    const escapedValue = escapeRegExp(value);
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};

const simulateImport = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');

        // Simulating data sent from frontend for A-1
        const item = {
            projectName: "Sector 32 (Kohinoor City) Kurukshetra",
            unitNo: "A-1-SIM-TEST",
            direction: "69956b4275e0967fae08d182", // West
            facing: "699bc99fee5159cfdb8f2e2c",    // L-Point
            roadWidth: "699beeb0ee5159cfdb8f3ed2"  // 12 Mtr
        };

        const result = {
            unitNo: item.unitNo,
            projectName: item.projectName
        };

        result.facing = await resolveLookup(Lookup, 'Facing', item.facing || item['Facing'] || item['Orientation']);
        result.direction = await resolveLookup(Lookup, 'Direction', item.direction || item['Direction'] || item['Orientation']);
        result.orientation = await resolveLookup(Lookup, 'Orientation', item.orientation || item['Orientation']);
        result.roadWidth = await resolveLookup(Lookup, 'RoadWidth', item.roadWidth || item['Road Width'] || item['RoadWidth']);

        console.log('Simulation Results:');
        console.log('Facing:', result.facing);
        console.log('Direction:', result.direction);
        console.log('Orientation:', result.orientation);
        console.log('Road Width:', result.roadWidth);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

simulateImport();
