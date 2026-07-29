const msg = '> [Template: property_match_detailed] Payload: [{"type":"header",\n"parameters":[]}]';
const templateMatch = msg.match(/\[Template:\s*(.+?)\]\s*Payload:\s*([\s\S]*)/i);
console.log(templateMatch ? templateMatch[2] : "No Match");
