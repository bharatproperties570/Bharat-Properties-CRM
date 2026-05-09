const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testKeys() {
    console.log("Testing OpenAI Key...");
    try {
        const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'say hi' }],
            max_tokens: 5
        }, {
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
        });
        console.log("OpenAI OK:", resp.data.choices[0].message.content);
    } catch (err) {
        console.error("OpenAI Failed:", err.response?.data?.error?.message || err.message);
    }

    console.log("\nTesting Gemini Key...");
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;
        const resp = await axios.post(url, {
            contents: [{ parts: [{ text: 'say hi' }] }]
        });
        console.log("Gemini OK:", resp.data.candidates[0].content.parts[0].text);
    } catch (err) {
        console.error("Gemini Failed:", err.response?.data?.error?.message || err.message);
    }
}

testKeys();
