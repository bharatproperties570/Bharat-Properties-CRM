
import fs from 'fs';

const csvPath = '/Users/bharatproperties/Downloads/inventory_template (1).csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r\n|\n/).filter(l => l.includes('A-1,'));

if (lines.length > 0) {
    const row = lines[0];
    const columns = row.split(',');

    // Column 11: Direction
    const direction = columns[10];
    console.log(`Direction Raw: [${direction}]`);
    console.log(`Direction Length: ${direction.length}`);
    console.log(`Direction Hex: ${Buffer.from(direction).toString('hex')}`);

    // Column 12: Facing
    const facing = columns[11];
    console.log(`Facing Raw: [${facing}]`);
    console.log(`Facing Length: ${facing.length}`);
    console.log(`Facing Hex: ${Buffer.from(facing).toString('hex')}`);

    // Column 13: Road Width
    const roadWidth = columns[12];
    console.log(`RoadWidth Raw: [${roadWidth}]`);
    console.log(`RoadWidth Length: ${roadWidth.length}`);
    console.log(`RoadWidth Hex: ${Buffer.from(roadWidth).toString('hex')}`);
} else {
    console.log('Row not found');
}
