import net from 'net';
import { createCanvas } from 'canvas';

/**
 * TinyNote Thermal Printer Utility
 * For Epson TM-T30 on network
 */

class TinyNote {
  constructor(ip = '10.1.1.30', port = 9100) {
    this.ip = ip;
    this.port = port;
    // Emoji processing disabled - regex was matching digits
    this.emojiRegex = /🚫DISABLED🚫/;
  }

  /**
   * Send raw commands to the printer with chunking and delays
   */
  async _send(data) {
    const client = new net.Socket();
    const CHUNK_SIZE = 4096; // 4KB chunks
    const CHUNK_DELAY = 50; // 50ms between chunks

    return new Promise((resolve, reject) => {
      let offset = 0;
      let timeout = false;

      const timer = setTimeout(() => {
        timeout = true;
        client.destroy();
        reject(new Error('Connection timeout'));
      }, 30000);

      client.connect(this.port, this.ip, () => {
        // Send data in chunks
        const sendChunk = () => {
          if (timeout) return;

          if (offset >= data.length) {
            // All data sent, wait and close
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

            // Delay before next chunk
            if (offset < data.length) {
              setTimeout(sendChunk, CHUNK_DELAY);
            } else {
              // Last chunk sent
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

  /**
   * Render emoji to monochrome bitmap
   */
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

  /**
   * Convert canvas to ESC/POS raster graphics
   */
  async _imageToEscPos(canvas, density = 32) {
    const size = density;
    const tempCanvas = createCanvas(size, size);
    const tempCtx = tempCanvas.getContext('2d');

    // Draw original canvas resized
    tempCtx.drawImage(canvas, 0, 0, size, size);

    const imageData = tempCtx.getImageData(0, 0, size, size);
    const pixels = imageData.data;
    const width = size;
    const height = size;
    const bitmap = [];

    // Convert to monochrome and pack into bytes (column by column)
    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width; x++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelY = y + bit;
          if (pixelY < height) {
            const i = (pixelY * width + x) * 4;
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const gray = (r + g + b) / 3;
            if (gray < 128) {
              byte |= (1 << bit);
            }
          }
        }
        bitmap.push(byte);
      }
    }

    // ESC/POS graphics command (GS v 0)
    const header = Buffer.from([
      0x1D, 0x76, 0x30, 0x00,  // GS v 0
      (width & 0xFF),           // xL
      (width >> 8) & 0xFF,      // xH
      (height & 0xFF),          // yL
      (height >> 8) & 0xFF      // yH
    ]);

    return Buffer.concat([header, Buffer.from(bitmap)]);
  }

  /**
   * Check if text contains emojis
   */
  _hasEmoji(text) {
    return this.emojiRegex.test(text);
  }

  /**
   * Print text with optional formatting
   * @param {string} text - The text to print
   * @param {object} options - Formatting options
   * @param {string} options.align - 'left', 'center', 'right'
   * @param {boolean} options.bold - Make text bold
   * @param {number} options.feed - Number of line feeds after
   */
  async print(text, options = {}) {
    const { align = 'left', bold = false, feed = 0 } = options;

    let data = Buffer.from([]);

    // Set alignment
    if (align === 'center') data = Buffer.concat([data, Buffer.from([0x1B, 0x61, 0x01])]);
    else if (align === 'right') data = Buffer.concat([data, Buffer.from([0x1B, 0x61, 0x02])]);
    else data = Buffer.concat([data, Buffer.from([0x1B, 0x61, 0x00])]);

    // Set bold
    data = Buffer.concat([data, Buffer.from([0x1B, 0x45, bold ? 0x01 : 0x00])]);

    // Check for emojis and handle them
    if (this._hasEmoji(text)) {
      // Split text into parts (text and emojis)
      const parts = [];
      let currentText = '';
      let i = 0;

      while (i < text.length) {
        const char = text[i];
        if (this.emojiRegex.test(char)) {
          if (currentText) {
            parts.push({ type: 'text', content: currentText });
            currentText = '';
          }
          parts.push({ type: 'emoji', content: char });
        } else {
          currentText += char;
        }
        i++;
      }
      if (currentText) {
        parts.push({ type: 'text', content: currentText });
      }

      // Print each part
      for (const part of parts) {
        if (part.type === 'text') {
          data = Buffer.concat([data, Buffer.from(part.content)]);
        } else if (part.type === 'emoji') {
          const emojiCanvas = await this._renderEmoji(part.content, 48);
          const escPosImage = await this._imageToEscPos(emojiCanvas, 48);
          data = Buffer.concat([data, escPosImage]);
        }
      }
    } else {
      // No emojis, just print text
      data = Buffer.concat([data, Buffer.from(text)]);
    }

    // Line feeds
    if (feed > 0) {
      data = Buffer.concat([data, Buffer.from([0x1B, 0x64, feed])]);
    }

    return this._send(data);
  }

  /**
   * Print multiple lines easily
   */
  async printLines(lines, options = {}) {
    for (const line of lines) {
      await this.print(line + '\n', options);
    }
  }

  /**
   * Feed n lines
   */
  async feed(lines = 3) {
    return this._send(Buffer.from([0x1B, 0x64, lines]));
  }

  /**
   * Cut the paper
   * @param {boolean} fullCut - true for full cut, false for partial
   */
  async cut(fullCut = false) {
    const cutCode = fullCut ? 0x00 : 0x01;
    return this._send(Buffer.from([0x1D, 0x56, cutCode]));
  }

  /**
   * Print and cut (complete a print job)
   */
  async printAndCut(text, options = {}) {
    const { feedLines = 4 } = options;
    await this.print(text + '\n', options);
    await this.feed(feedLines);
    await this.cut(false);
  }

  /**
   * Print a full receipt with header, items, and footer
   */
  async printReceipt(header, items, footer) {
    // Initialize printer
    await this._send(Buffer.from([0x1B, 0x40]));

    // Header (centered)
    await this.printLines(['', header, ''], { align: 'center', bold: true });

    // Items (left aligned)
    for (const item of items) {
      await this.print(item + '\n');
    }

    // Footer (centered)
    await this.feed(1);
    await this.printLines([footer, ''], { align: 'center' });

    // Feed and cut
    await this.feed(3);
    await this.cut();
  }
}

export default TinyNote;
