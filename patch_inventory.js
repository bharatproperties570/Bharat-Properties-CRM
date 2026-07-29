import fs from 'fs';
const file = '/home/ubuntu/bharat-properties-crm/backend/models/Inventory.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Add to Schema
const schemaInjection = `    orientation: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },
    waterSource: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },
    waterLevel: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },
    waterPumpType: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },`;
content = content.replace(`    orientation: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },`, schemaInjection);

// 2. Add to pre('save')
const saveInjection = `        if (this.orientation !== undefined && !isObjectId(this.orientation)) {
            this.orientation = await resolveLookupLocal('Orientation', this.orientation);
        }
        if (this.waterSource !== undefined && !isObjectId(this.waterSource)) {
            this.waterSource = await resolveLookupLocal('WaterSource', this.waterSource);
        }
        if (this.waterLevel !== undefined && !isObjectId(this.waterLevel)) {
            this.waterLevel = await resolveLookupLocal('WaterLevel', this.waterLevel);
        }
        if (this.waterPumpType !== undefined && !isObjectId(this.waterPumpType)) {
            this.waterPumpType = await resolveLookupLocal('WaterPumpType', this.waterPumpType);
        }`;
content = content.replace(`        if (this.orientation !== undefined && !isObjectId(this.orientation)) {
            this.orientation = await resolveLookupLocal('Orientation', this.orientation);
        }`, saveInjection);

// 3. Add to pre('findOneAndUpdate')
const updateInjection = `                { field: 'orientation', type: 'Orientation' },
                { field: 'waterSource', type: 'WaterSource' },
                { field: 'waterLevel', type: 'WaterLevel' },
                { field: 'waterPumpType', type: 'WaterPumpType' },`;
content = content.replace(`                { field: 'orientation', type: 'Orientation' },`, updateInjection);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched Inventory.js successfully');
