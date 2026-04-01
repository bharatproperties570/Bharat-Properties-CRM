import jwt from 'jsonwebtoken';

const token = jwt.sign({ id: '69c36289974fbf7946ee99cd', role: 'admin' }, 'supersecretkey123', { expiresIn: '1h' });

async function testLead() {
    console.log('Testing Lead Creation...');
    try {
        const response = await fetch('http://localhost:4000/api/leads', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                salutation: 'Mr.',
                firstName: 'Tester2',
                mobile: '8888888887',
                team: 'Kurukshetra Team'
            })
        });
        const text = await response.text();
        console.log('Status:', response.status);
        console.log('Response:', text);
    } catch (e) {
        console.error('Fetch Error:', e);
    }
}

testLead();
