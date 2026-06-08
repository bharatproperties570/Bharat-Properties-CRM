import fetch from 'node-fetch';

async function run() {
    const requiredTypes = ['BuiltupType', 'Category', 'SubCategory'];
    const res = await fetch(`http://localhost:4000/api/lookups?lookup_type=${requiredTypes.join(',')}`);
    const data = await res.json();
    console.log(data);
}
run();
