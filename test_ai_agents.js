import axios from 'axios';

async function test() {
    try {
        const res = await axios.get('http://localhost:4000/api/settings/ai-agents');
        console.log("Success:", res.data);
    } catch (e) {
        console.error("Error:", e.response ? e.response.data : e.message);
    }
}
test();
