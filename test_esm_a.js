
let x = { name: 'initial' };
setTimeout(() => {
    x = { name: 'reassigned' };
    console.log('Internal x reassigned');
}, 100);

export default x;
