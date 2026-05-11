#!/usr/bin/env node
/**
 * TinyNote ESC/POS formatting test
 * Prints a decorative receipt demonstrating all formatting features.
 *
 * Usage: node test-format.js
 */

const BASE_URL = process.env.TINYNOTE_URL || 'http://localhost:4444';

async function testPrint() {
  const commands = [
    // Initialize
    { cmd: 'init' },

    // ── Header ──
    { cmd: 'align', value: 'center' },
    { cmd: 'lineSpacing', value: 40 },
    { cmd: 'bold', value: true },
    { cmd: 'doubleWidth', value: true },
    { cmd: 'doubleHeight', value: true },
    { cmd: 'text', value: 'TINYNOTE' },
    { cmd: 'doubleWidth', value: false },
    { cmd: 'doubleHeight', value: false },
    { cmd: 'bold', value: false },
    { cmd: 'text', value: 'ESC/POS FORMAT TEST' },
    { cmd: 'resetLineSpacing' },

    // ── Separator ──
    { cmd: 'align', value: 'left' },
    { cmd: 'text', value: '--------------------------------' },

    // ── Bold section ──
    { cmd: 'bold', value: true },
    { cmd: 'underline', value: 1 },
    { cmd: 'text', value: 'BOLD + UNDERLINE TITLE' },
    { cmd: 'underline', value: 0 },
    { cmd: 'bold', value: false },
    { cmd: 'text', value: '  Normal text follows here.' },
    { cmd: 'text', value: '  And another line for context.' },
    { cmd: 'text', value: '' },

    // ── Reverse highlight ──
    { cmd: 'bold', value: true },
    { cmd: 'reverse', value: true },
    { cmd: 'text', value: '  >>> URGENT: DO THIS NOW <<<  ' },
    { cmd: 'reverse', value: false },
    { cmd: 'bold', value: false },
    { cmd: 'text', value: '' },

    // ── Font B (compact) ──
    { cmd: 'bold', value: true },
    { cmd: 'text', value: 'Font B (compact):' },
    { cmd: 'bold', value: false },
    { cmd: 'fontB', value: true },
    { cmd: 'text', value: '  This is Font B - about 48 chars per line.' },
    { cmd: 'text', value: '  Good for detailed info and small print.' },
    { cmd: 'fontB', value: false },
    { cmd: 'text', value: '' },

    // ── Separator ──
    { cmd: 'text', value: '--------------------------------' },

    // ── Line spacing demo ──
    { cmd: 'bold', value: true },
    { cmd: 'text', value: 'Line spacing demo:' },
    { cmd: 'bold', value: false },
    { cmd: 'lineSpacing', value: 20 },
    { cmd: 'text', value: '  Tight spacing (20 dots)' },
    { cmd: 'text', value: '  Tight spacing (20 dots)' },
    { cmd: 'resetLineSpacing' },
    { cmd: 'text', value: '  Default spacing (30 dots)' },
    { cmd: 'text', value: '  Default spacing (30 dots)' },
    { cmd: 'lineSpacing', value: 50 },
    { cmd: 'text', value: '  Loose spacing (50 dots)' },
    { cmd: 'text', value: '  Loose spacing (50 dots)' },
    { cmd: 'resetLineSpacing' },
    { cmd: 'text', value: '' },

    // ── Separator ──
    { cmd: 'text', value: '--------------------------------' },

    // ── QR Code ──
    { cmd: 'align', value: 'center' },
    { cmd: 'bold', value: true },
    { cmd: 'text', value: 'QR Code:' },
    { cmd: 'bold', value: false },
    { cmd: 'qrcode', value: 'https://github.com/nousresearch/sprite', options: { cellSize: 5, errorLevel: 'M' } },
    { cmd: 'text', value: '' },

    // ── Barcode ──
    { cmd: 'bold', value: true },
    { cmd: 'text', value: 'Barcode (CODE128):' },
    { cmd: 'bold', value: false },
    { cmd: 'barcode', value: 'SPRITE2026', options: { type: 73, height: 80, width: 2, hri: 2 } },
    { cmd: 'text', value: '' },

    // ── Footer ──
    { cmd: 'text', value: '--------------------------------' },
    { cmd: 'fontB', value: true },
    { cmd: 'text', value: '  Printed by TinyNote ESC/POS v2' },
    { cmd: 'text', value: '  ' + new Date().toISOString().slice(0, 19) },
    { cmd: 'fontB', value: false },

    // ── Feed and cut ──
    { cmd: 'feed', value: 4 },
    { cmd: 'cut' },
  ];

  console.log(`Sending ${commands.length} commands to ${BASE_URL}/print ...`);

  const response = await fetch(`${BASE_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  });

  const result = await response.json();

  if (response.ok && result.success) {
    console.log('✅ Test print sent successfully!');
    console.log(`   ${result.message}`);
  } else {
    console.error('❌ Print failed:', response.status, result);
    process.exit(1);
  }
}

testPrint().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
