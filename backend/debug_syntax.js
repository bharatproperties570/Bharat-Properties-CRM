
async function test() {
    try {
        await import('./app.js');
        console.log('app.js loaded');
        await import('./src/server.js');
        console.log('src/server.js loaded');
    } catch (e) {
        console.error('FAIL:', e);
    }
}
test();
