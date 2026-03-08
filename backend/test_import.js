
import http from 'http';

const data = {
    data: [
        {
            projectName: "Sector 32 (Kohinoor City) Kurukshetra",
            projectId: "699b4f17f4ce10801aad8a47",
            block: "Part I",
            unitNo: "TEST-001",
            category: "Residential",
            subCategory: "Plot",
            size: "10",
            sizeLabel: "10 Marla",
            status: "Available",
            intent: "For Sale"
        }
    ]
};

const payload = JSON.stringify(data);

const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/inventory/import',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

const req = http.request(options, (res) => {
    let body = '';

    res.on('data', (chunk) => {
        body += chunk;
    });

    res.on('end', () => {
        console.log('Status Code:', res.statusCode);
        try {
            console.log('Response:', JSON.stringify(JSON.parse(body), null, 2));
        } catch (e) {
            console.log('Raw Response:', body);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(payload);
req.end();
