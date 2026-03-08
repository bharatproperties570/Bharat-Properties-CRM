
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

// Simplified MODULE_CONFIG for test
const MODULE_CONFIG = {
    inventory: {
        fields: [
            { key: 'projectName', label: 'Project Name', required: true },
            { key: 'projectId', label: 'Project ID' },
            { key: 'unitNo', label: 'Unit Number', required: true },
            { key: 'unitType', label: 'Unit Type' },
            { key: 'category', label: 'Category' },
            { key: 'subCategory', label: 'Sub Category' },
            { key: 'sizeLabel', label: 'Size Label *', required: true },
            { key: 'builtupType', label: 'Builtup Type' },
            { key: 'block', label: 'Block' },
            { key: 'size', label: 'Size' },
            { key: 'direction', label: 'Direction / Orientation' },
            { key: 'facing', label: 'Facing' },
            { key: 'roadWidth', label: 'Road Width' },
            { key: 'ownership', label: 'Ownership' },
            { key: 'status', label: 'Status' }
        ]
    }
};

const resolveLookup = async (Lookup, type, value) => {
    console.log(`[RESOLVE] type=${type}, value=[${value}]`);
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) {
        console.log(`[RESOLVE] ${value} is valid ObjectId`);
        return value;
    }
    return null;
};

const runFullDiagnostic = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');

        // 1. Raw Row from CSV (A-1)
        const rawRow = "Sector 32 (Kohinoor City) Kurukshetra,PRJ-69a59ea44461aa877531dad2,A-1,69a96e383a56674b285e010f,6995e15f74ec320348f2319c,6995e16074ec320348f231ab,69a808d54461aa87753223f5,69999d8331d19e8a9538ee1e,Part I,,69956b4275e0967fae08d182,699bc99fee5159cfdb8f2e2c,699beeb0ee5159cfdb8f3ed2,Freehold,,,,,29.95957216,76.91140638,6987463d65182095c854bdd9,69877a05e933d7d456c6d1ef,69877a0fe933d7d456c6d1f5,69a98d393a56674b285e0d27,69a98e203a56674b285e0d2c,69a98e293a56674b285e0d30,,,,,,,,,Suraj Keshwar,Kurukshetra Team,,Everyone";
        const headersStr = "Project Name,Project ID,Unit Number,Unit Type,Category,Sub Category,Size Label *,Builtup Type,Block,Size,Direction,Facing,Road Width,Ownership,Occupation Date,Possession Status,Furnish Type,Furnished Items,Latitude,Longitude,Country,State,City,Tehsil,Post Office,Zip/Pin Code,House No,Street,Locality,Area,Owner Name,Owner Mobile,Owner Email,Owner Address,Assigned To,Team,Status,Visible To";
        const headers = headersStr.split(',').map(h => h.trim());
        const values = rawRow.split(',');

        const rowObject = {};
        headers.forEach((h, i) => rowObject[h] = values[i]);

        // 2. Frontend Mapping Simulation
        const mapping = {};
        const config = MODULE_CONFIG.inventory.fields;

        headers.forEach(header => {
            const match = config.find(f =>
                f.key.toLowerCase() === header.toLowerCase() ||
                f.label.toLowerCase() === header.toLowerCase() ||
                (f.key === 'direction' && header.toLowerCase() === 'orientation')
            );
            if (match) mapping[match.key] = header;
        });

        console.log('Mapping Generated:', JSON.stringify(mapping, null, 2));

        const item = {};
        Object.entries(mapping).forEach(([key, header]) => {
            item[key] = rowObject[header];
        });

        console.log('Item Sent to Backend:', JSON.stringify(item, null, 2));

        // 3. Backend Logic Simulation (Relevant parts only)
        const result = {};
        // Note: Backend code uses: item.facing || item['Facing'] || item['Orientation']
        result.facing = await resolveLookup(Lookup, 'Facing', item.facing || item['Facing'] || item['Orientation']);
        result.direction = await resolveLookup(Lookup, 'Direction', item.direction || item['Direction'] || item['Orientation']);
        result.roadWidth = await resolveLookup(Lookup, 'RoadWidth', item.roadWidth || item['Road Width'] || item['RoadWidth']);

        console.log('Final Restructured Data (Relevant Fields):');
        console.log(`Facing: [${result.facing}]`);
        console.log(`Direction: [${result.direction}]`);
        console.log(`Road Width: [${result.roadWidth}]`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Diagnostic error:', error);
    }
};

runFullDiagnostic();
