import { File, Blob } from 'node:buffer';

if (typeof global.File === 'undefined') {
    global.File = File;
}
if (typeof global.Blob === 'undefined') {
    global.Blob = Blob;
}

console.log('✅ Polyfills for File and Blob initialized');
