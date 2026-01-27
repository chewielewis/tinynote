import TinyNote from './printer.js';

const printer = new TinyNote('10.1.1.30', 9100);

// Example 1: Simple print with cut
await printer.printAndCut('Hello TinyNote!', { align: 'center' });

// Example 2: Multiple lines
await printer.printLines([
  'Shopping List',
  '============',
  '',
  '[ ] Milk',
  '[ ] Coffee',
  '[ ] Eggs'
], { align: 'left' });
await printer.cut();

// Example 3: Full receipt
await printer.printReceipt(
  'TINYNOTE STORE',
  [
    'Coffee Beans    $12.99',
    'Honey            $5.50',
    'Bread            $3.00',
    '─────────────────────',
    'TOTAL           $21.49'
  ],
  'Thank you for shopping!\nCome back soon!'
);

console.log('Print jobs complete!');
