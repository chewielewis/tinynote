import TinyNote from './printer.js';

const printer = new TinyNote();

// Test 1: Simple text without emoji
console.log('Test 1: Plain text...');
await printer.printAndCut('PLAIN TEXT TEST\n\nDid this print?', { align: 'center' });

console.log('Done!');
