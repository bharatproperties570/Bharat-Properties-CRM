import axios from 'axios';
async function run() {
    try {
        const res = await axios.get('http://localhost:4000/api/contacts?limit=1');
        console.log("Response:", JSON.stringify(res.data).substring(0, 500));
    } catch (e) {
        console.error(e.message);
    }
}
run();
