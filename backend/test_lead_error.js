import jwt from 'jsonwebtoken';

const token = jwt.sign({ id: '69c36289974fbf7946ee99cd', role: 'admin' }, 'supersecretkey123', { expiresIn: '1h' });

async function testComplexLead() {
    console.log('Testing Complex Lead Creation...');
    try {
        const response = await fetch('http://localhost:4000/api/leads', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                salutation: 'Mr.',
                firstName: 'Complex',
                lastName: 'Tester',
                mobile: '8888888801',
                budget: 'Random Budget 123',
                location: 'Secret Base',
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

testComplexLead();
