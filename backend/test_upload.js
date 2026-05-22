import jwt from 'jsonwebtoken';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const token = jwt.sign({ id: '69c36289974fbf7946ee99cd', role: 'admin' }, 'supersecretkey123', { expiresIn: '1h' });
const form = new FormData();
form.append('file', fs.createReadStream('/tmp/testimage.jpg'));
form.append('entityType', 'Deal');
form.append('entityName', 'Test Deal');

fetch('https://api.bharatproperties.co/api/upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    ...form.getHeaders()
  },
  body: form
}).then(res => res.text()).then(text => {
  console.log('Response:', text);
}).catch(console.error);
