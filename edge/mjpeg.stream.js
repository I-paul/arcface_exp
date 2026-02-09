const http = require('http');
const https = require('https');

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
const MAX_BUFFER = 5 * 1024 * 1024;

class MjpegStreamReader {
  constructor(url, options = {}) {
    this.url = url;
    this.onFrame = options.onFrame;
    this.onError = options.onError;
    this.reconnectBaseMs = options.reconnectBaseMs || 1000;
    this.stopped = false;
    this._retries = 0;
  }

  start() {
    this.stopped = false;
    this._connect();
  }

  stop() {
    this.stopped = true;
    if (this.req) {
      this.req.destroy();
    }
  }

  _connect() {
    if (this.stopped) return;

    const client = this.url.startsWith('https') ? https : http;

    this.req = client.get(this.url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        this._handleError(new Error(`Stream HTTP ${res.statusCode}`));
        res.resume();
        return;
      }

      this._retries = 0;
      let buffer = Buffer.alloc(0);

      res.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (true) {
          const soi = buffer.indexOf(JPEG_SOI);
          if (soi === -1) {
            if (buffer.length > MAX_BUFFER) {
              buffer = buffer.slice(-MAX_BUFFER);
            }
            break;
          }

          const eoi = buffer.indexOf(JPEG_EOI, soi + 2);
          if (eoi === -1) {
            if (soi > 0) {
              buffer = buffer.slice(soi);
            }
            break;
          }

          const frame = buffer.slice(soi, eoi + 2);
          buffer = buffer.slice(eoi + 2);

          if (this.onFrame) {
            this.onFrame(frame);
          }
        }
      });

      res.on('end', () => {
        this._handleError(new Error('Stream ended'));
      });

      res.on('error', (err) => {
        this._handleError(err);
      });
    });

    this.req.on('error', (err) => {
      this._handleError(err);
    });
  }

  _handleError(err) {
    if (this.stopped) return;
    if (this.onError) this.onError(err);

    const delay = Math.min(this.reconnectBaseMs * Math.pow(2, this._retries), 15000);
    this._retries += 1;

    setTimeout(() => this._connect(), delay);
  }
}

module.exports = {
  MjpegStreamReader
};
