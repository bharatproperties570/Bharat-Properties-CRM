const relativeDate = new Date('2026-08-20T13:37:36.521Z');
const offsetMs = 10 * 60 * 1000;
const targetDate = new Date(relativeDate.getTime() + offsetMs);
const delayMs = targetDate.getTime() - Date.now();
console.log('relativeDate', relativeDate);
console.log('offsetMs', offsetMs);
console.log('targetDate', targetDate);
console.log('delayMs', delayMs);
