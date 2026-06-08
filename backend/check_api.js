import fetch from 'node-fetch';

async function run() {
    const requiredTypes = ['BuiltupType', 'Category', 'SubCategory'];
    const res = await fetch(`http://localhost:4000/api/lookups?lookup_type=${requiredTypes.join(',')}`);
    const data = await res.json();
    console.log("Success?", data.success);
    if (data.data) {
        console.log("Returned types:", [...new Set(data.data.map(l => l.lookup_type))]);
        const builtup = data.data.filter(l => l.lookup_type === 'BuiltupType');
        console.log("First builtup:", builtup[0]);
    }
}
run();
