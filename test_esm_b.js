
import val from './test_esm_a.js';

console.log('Initial import:', val);
setTimeout(() => {
    console.log('After 200ms:', val);
}, 200);
