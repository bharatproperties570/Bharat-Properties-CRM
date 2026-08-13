import puppeteer from 'puppeteer';

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type().toUpperCase(), msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
    page.on('requestfailed', request => {
        console.log('BROWSER REQUEST FAILED:', request.url(), request.failure().errorText);
    });

    console.log('Navigating to http://localhost:5173...');
    try {
        await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 15000 });
        console.log('Page loaded successfully.');
    } catch (e) {
        console.log('Error navigating:', e.message);
    }
    
    // Wait a bit to ensure any async errors are caught
    await new Promise(r => setTimeout(r, 2000));
    
    await browser.close();
})();
