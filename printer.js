import net from 'net';
import { createCanvas } from 'canvas';

/**
 * TinyNote Thermal Printer Utility
 * For Epson TM-T30 on network (80mm, ~576 dots, ESC/POS compatible)
 */

class TinyNote {
  constructor(ip = '10.1.1.30', port = 9100) {
    this.ip = ip;
    this.port = port;
    this._widthMultiplier = 0;
    this._heightMultiplier = 0;
    this.emojiRegex = /🚫DISABLED🚫/;
  }

  /**
   * Send raw commands to the printer with chunking and delays
   */
  async _send(data) {
    const client = new net.Socket();
    const CHUNK_SIZE = 4096;
    const CHUNK_DELAY = 50;

    return new Promise((resolve, reject) => {
      let offset = 0;
      let timeout = false;

      const timer = setTimeout(() => {
        timeout = true;
        client.destroy();
        reject(new Error('Connection timeout'));
      }, 30000);

      client.connect(this.port, this.ip, () => {
        const sendChunk = () => {
          if (timeout) return;

          if (offset >= data.length) {
            setTimeout(() => {
              client.end(() => {
                clearTimeout(timer);
                resolve();
              });
            }, 500);
            return;
          }

          const chunk = data.slice(offset, Math.min(offset + CHUNK_SIZE, data.length));
          offset += chunk.length;

          client.write(chunk, (err) => {
            if (err) {
              clearTimeout(timer);
              reject(err);
              return;
            }

            if (offset < data.length) {
              setTimeout(sendChunk, CHUNK_DELAY);
            } else {
              setTimeout(() => {
                client.end(() => {
                  clearTimeout(timer);
                  resolve();
                });
              }, 500);
            }
          });
        };

        sendChunk();
      });

      client.on('close', () => {
        clearTimeout(timer);
        if (!timeout) resolve();
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // ── ESC/POS Buffer Builders ─────────────────────────────────────────
  // These build Buffers without sending, for batch operations.

  _bufInit() {
    this._widthMultiplier = 0;
    this._heightMultiplier = 0;
    return Buffer.from([0x1B, 0x40]);
  }

  _bufBold(on = true) {
    return Buffer.from([0x1B, 0x45, on ? 0x01 : 0x00]);
  }

  _bufUnderline(style = 1) {
    return Buffer.from([0x1B, 0x2D, style & 0x03]);
  }

  _bufDoubleWidth(on = true) {
    this._widthMultiplier = on ? 1 : 0;
    return this._bufUpdateTextSize();
  }

  _bufDoubleHeight(on = true) {
    this._heightMultiplier = on ? 1 : 0;
    return this._bufUpdateTextSize();
  }

  _bufUpdateTextSize() {
    const n = (this._heightMultiplier << 4) | this._widthMultiplier;
    return Buffer.from([0x1D, 0x21, n]);
  }

  _bufReverse(on = true) {
    return Buffer.from([0x1D, 0x42, on ? 0x01 : 0x00]);
  }

  _bufFontB(on = true) {
    return Buffer.from([0x1B, 0x4D, on ? 0x01 : 0x00]);
  }

  _bufLineSpacing(dots = 30) {
    return Buffer.from([0x1B, 0x33, dots & 0xFF]);
  }

  _bufResetLineSpacing() {
    return Buffer.from([0x1B, 0x32]);
  }

  _bufAlign(align = 'left') {
    let n = 0;
    if (align === 'center') n = 1;
    else if (align === 'right') n = 2;
    return Buffer.from([0x1B, 0x61, n]);
  }

  _bufText(text) {
    return Buffer.from(text + '\n', 'utf-8');
  }

  _bufFeed(lines = 3) {
    return Buffer.from([0x1B, 0x64, lines]);
  }

  _bufCut(fullCut = false) {
    return Buffer.from([0x1D, 0x56, fullCut ? 0x00 : 0x01]);
  }

  _bufBarcode(type, data, options = {}) {
    const { height = 64, width = 2, hri = 2 } = options;
    const dataBuf = Buffer.from(data, 'ascii');
    return Buffer.concat([
      Buffer.from([0x1D, 0x48, hri]),              // HRI position
      Buffer.from([0x1D, 0x68, height & 0xFF]),     // height
      Buffer.from([0x1D, 0x77, width & 0x0F]),      // width
      Buffer.from([0x1D, 0x6B, type, dataBuf.length]), // GS k m n
      dataBuf,
    ]);
  }

  _bufQrcode(data, cellSize = 4, errorLevel = 'M') {
    const errorMap = { 'L': 48, 'M': 49, 'Q': 50, 'H': 51 };
    const errorVal = errorMap[errorLevel] || 49;
    const dataBuf = Buffer.from(data, 'utf-8');
    const dataLen = dataBuf.length + 3;

    return Buffer.concat([
      // 1. Select QR model 2
      Buffer.from([0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
      // 2. Set module size
      Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, cellSize & 0xFF]),
      // 3. Set error correction
      Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, errorVal]),
      // 4. Store data
      Buffer.from([
        0x1D, 0x28, 0x6B,
        dataLen & 0xFF, (dataLen >> 8) & 0xFF,
        0x31, 0x50, 0x31,
      ]),
      dataBuf,
      // 5. Print
      Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x31]),
    ]);
  }

  /**
   * Build a single Buffer from a command array (no sending)
   */
  buildCommands(commands) {
    const parts = [this._bufInit()];

    for (const item of commands) {
      const { cmd, value } = item;
      switch (cmd) {
        case 'text':
          parts.push(this._bufText(String(value)));
          break;
        case 'align':
          parts.push(this._bufAlign(value || 'left'));
          break;
        case 'bold':
          parts.push(this._bufBold(!!value));
          break;
        case 'underline':
          parts.push(this._bufUnderline(value === false ? 0 : (value || 1)));
          break;
        case 'doubleWidth':
          parts.push(this._bufDoubleWidth(!!value));
          break;
        case 'doubleHeight':
          parts.push(this._bufDoubleHeight(!!value));
          break;
        case 'reverse':
          parts.push(this._bufReverse(!!value));
          break;
        case 'fontB':
          parts.push(this._bufFontB(!!value));
          break;
        case 'lineSpacing':
          parts.push(this._bufLineSpacing(parseInt(value) || 30));
          break;
        case 'resetLineSpacing':
          parts.push(this._bufResetLineSpacing());
          break;
        case 'feed':
          parts.push(this._bufFeed(parseInt(value) || 3));
          break;
        case 'cut':
          parts.push(this._bufCut(value === 'full'));
          break;
        case 'init':
          parts.push(this._bufInit());
          break;
        case 'barcode': {
          const opts = item.options || {};
          parts.push(this._bufBarcode(
            opts.type || 73,
            String(value),
            { height: opts.height || 64, width: opts.width || 2, hri: opts.hri !== undefined ? opts.hri : 2 }
          ));
          break;
        }
        case 'qrcode': {
          const opts = item.options || {};
          parts.push(this._bufQrcode(
            String(value),
            opts.cellSize || 4,
            opts.errorLevel || 'M'
          ));
          break;
        }
        default:
          console.warn(`⚠️  Unknown print command: ${cmd}`);
      }
    }

    return Buffer.concat(parts);
  }

  // ── Async API methods (each opens its own TCP connection) ───────────

  async init() {
    this._widthMultiplier = 0;
    this._heightMultiplier = 0;
    return this._send(this._bufInit());
  }

  async bold(on = true) {
    return this._send(this._bufBold(on));
  }

  async underline(style = 1) {
    return this._send(this._bufUnderline(style));
  }

  async doubleWidth(on = true) {
    this._widthMultiplier = on ? 1 : 0;
    return this._send(this._bufUpdateTextSize());
  }

  async doubleHeight(on = true) {
    this._heightMultiplier = on ? 1 : 0;
    return this._send(this._bufUpdateTextSize());
  }

  async reverse(on = true) {
    return this._send(this._bufReverse(on));
  }

  async fontB(on = true) {
    return this._send(this._bufFontB(on));
  }

  async setLineSpacing(dots = 30) {
    return this._send(this._bufLineSpacing(dots));
  }

  async resetLineSpacing() {
    return this._send(this._bufResetLineSpacing());
  }

  async align(align = 'left') {
    return this._send(this._bufAlign(align));
  }

  async rawText(text) {
    return this._send(Buffer.from(text, 'utf-8'));
  }

  async feed(lines = 3) {
    return this._send(this._bufFeed(lines));
  }

  async cut(fullCut = false) {
    return this._send(this._bufCut(fullCut));
  }

  async barcode(type, data, options = {}) {
    return this._send(this._bufBarcode(type, data, options));
  }

  async qrcode(data, cellSize = 4, errorLevel = 'M') {
    return this._send(this._bufQrcode(data, cellSize, errorLevel));
  }

  // ── High-level methods (preserved for backward compat) ──────────────

  async _renderEmoji(emoji, size = 24) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2);
    return canvas;
  }

  async _imageToEscPos(canvas, density = 32) {
    const size = density;
    const tempCanvas = createCanvas(size, size);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0, size, size);

    const imageData = tempCtx.getImageData(0, 0, size, size);
    const pixels = imageData.data;
    const width = size;
    const height = size;
    const bitmap = [];

    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width; x++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelY = y + bit;
          if (pixelY < height) {
            const i = (pixelY * width + x) * 4;
            const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
            if (gray < 128) byte |= (1 << bit);
          }
        }
        bitmap.push(byte);
      }
    }

    return Buffer.concat([
      Buffer.from([0x1D, 0x76, 0x30, 0x00, width & 0xFF, (width >> 8) & 0xFF, height & 0xFF, (height >> 8) & 0xFF]),
      Buffer.from(bitmap),
    ]);
  }

  _hasEmoji(text) {
    return this.emojiRegex.test(text);
  }

  async print(text, options = {}) {
    const { align = 'left', bold = false, feed = 0 } = options;

    let data = Buffer.from([]);

    if (align === 'center') data = Buffer.concat([data, Buffer.from([0x1B, 0x61, 0x01])]);
    else if (align === 'right') data = Buffer.concat([data, Buffer.from([0x1B, 0x61, 0x02])]);
    else data = Buffer.concat([data, Buffer.from([0x1B, 0x61, 0x00])]);

    data = Buffer.concat([data, Buffer.from([0x1B, 0x45, bold ? 0x01 : 0x00])]);

    if (this._hasEmoji(text)) {
      const parts = [];
      let currentText = '';
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (this.emojiRegex.test(char)) {
          if (currentText) { parts.push({ type: 'text', content: currentText }); currentText = ''; }
          parts.push({ type: 'emoji', content: char });
        } else {
          currentText += char;
        }
      }
      if (currentText) parts.push({ type: 'text', content: currentText });

      for (const part of parts) {
        if (part.type === 'text') {
          data = Buffer.concat([data, Buffer.from(part.content)]);
        } else {
          const emojiCanvas = await this._renderEmoji(part.content, 48);
          const escPosImage = await this._imageToEscPos(emojiCanvas, 48);
          data = Buffer.concat([data, escPosImage]);
        }
      }
    } else {
      data = Buffer.concat([data, Buffer.from(text)]);
    }

    if (feed > 0) {
      data = Buffer.concat([data, Buffer.from([0x1B, 0x64, feed])]);
    }

    return this._send(data);
  }

  async printLines(lines, options = {}) {
    for (const line of lines) {
      await this.print(line + '\n', options);
    }
  }

  async printAndCut(text, options = {}) {
    const { feedLines = 4 } = options;
    await this.print(text + '\n', options);
    await this.feed(feedLines);
    await this.cut(false);
  }

  async printReceipt(header, items, footer) {
    await this._send(Buffer.from([0x1B, 0x40]));
    await this.printLines(['', header, ''], { align: 'center', bold: true });
    for (const item of items) {
      await this.print(item + '\n');
    }
    await this.feed(1);
    await this.printLines([footer, ''], { align: 'center' });
    await this.feed(3);
    await this.cut();
  }
}

export default TinyNote;
