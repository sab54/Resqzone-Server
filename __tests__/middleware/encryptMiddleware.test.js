/**
 * encryptMiddleware.test.js
 *
 * What This Test File Covers:
 *
 * 1. Response Encryption
 *    - Wraps res.json output into { payload: "<ivHex>:<cipherHex>" } and decrypts back to original JSON.
 *
 * 2. IV & Payload Format
 *    - Ensures IV hex length matches configured IV_LENGTH and payload format includes a colon delimiter.
 *
 * 3. Status Passthrough
 *    - Preserves HTTP status codes while encrypting the JSON body.
 *
 * 4. Error Handling
 *    - When crypto throws during encryption, returns a structured error object.
 *
 * Notes:
 * - This middleware is data-layer agnostic; DB schema from initSchema.js is not exercised here.
 * - initSchema.js remains the production schema reference elsewhere in the project.
 */

const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

// Mock the exact module id used inside the middleware and mark it virtual
jest.mock('../../config', () => ({
  domains: {
    resqzone_api: {
      ENCRYPTION_KEY: '12345678901234567890123456789012', // 32 chars for AES-256
      IV_LENGTH: 16, // default AES-CBC IV length used by the app
    },
  },
}), { virtual: true });

const encryptMiddleware = require('../../middleware/encryptMiddleware');

// Helper to decrypt "ivHex:cipherHex" produced by the middleware
function decryptPayload(payload) {
  const [ivHex, cipherHex] = String(payload).split(':');
  const key = Buffer.from('12345678901234567890123456789012');
  const iv = Buffer.from(ivHex, 'hex');
  const cipherBuf = Buffer.from(cipherHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(encryptMiddleware);

  // Echo route that returns whatever data is given to res.json
  app.post('/echo', (req, res) => {
    res.json({ ok: true, input: req.body, when: 'now' });
  });

  // Route for testing status passthrough
  app.post('/created', (req, res) => {
    res.status(201).json({ created: true, id: 42 });
  });

  // Route to simulate encryption failure via monkey-patching crypto
  app.post('/break', (req, res) => {
    // Will be patched inside the test
    res.json({ should: 'not matter' });
  });
});

test('encrypts response body and can be decrypted back to original JSON', async () => {
  const original = { ok: true, input: { a: 1 }, when: 'now' };

  const res = await request(app)
    .post('/echo')
    .set('Content-Type', 'application/json')
    .send({ a: 1 });

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('payload');
  const decrypted = decryptPayload(res.body.payload);
  expect(decrypted).toEqual(original);
});

test('payload has "<ivHex>:<cipherHex>" format and IV hex length matches IV_LENGTH', async () => {
  const res = await request(app)
    .post('/echo')
    .set('Content-Type', 'application/json')
    .send({ x: 'y' });

  expect(res.status).toBe(200);
  expect(typeof res.body.payload).toBe('string');
  expect(res.body.payload.includes(':')).toBe(true);

  const [ivHex, cipherHex] = res.body.payload.split(':');
  // IV hex length should be IV_LENGTH * 2 characters
  expect(ivHex.length).toBe(16 * 2);
  // Cipher should be non-empty hex
  expect(cipherHex.length).toBeGreaterThan(0);
  expect(/^[0-9a-f]+$/i.test(ivHex)).toBe(true);
  expect(/^[0-9a-f]+$/i.test(cipherHex)).toBe(true);
});

test('preserves HTTP status code while encrypting (201 Created)', async () => {
  const res = await request(app)
    .post('/created')
    .set('Content-Type', 'application/json')
    .send({});

  expect(res.status).toBe(201);
  expect(res.body).toHaveProperty('payload');
  const decrypted = decryptPayload(res.body.payload);
  expect(decrypted).toEqual({ created: true, id: 42 });
});

test('returns structured error when encryption fails', async () => {
  // Patch crypto.createCipheriv to throw
  const originalCreateCipheriv = crypto.createCipheriv;
  jest.spyOn(crypto, 'createCipheriv').mockImplementation(() => {
    throw new Error('boom');
  });

  const res = await request(app)
    .post('/break')
    .set('Content-Type', 'application/json')
    .send({});

  // Restore the original immediately to avoid side effects on other tests
  crypto.createCipheriv.mockRestore();

  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    success: false,
    error: 'Failed to encrypt response',
  });
});
