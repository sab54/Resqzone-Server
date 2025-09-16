/**
 * user.test.js
 *
 * What This Test File Covers:
 *
 * 1) GET /user (no token)
 *    - Returns caller IP and geo info.
 *
 * 2) GET /user?token=... (not found)
 *    - Returns 401 with the exact error shape.
 *
 * 3) POST /user/register (happy path)
 *    - Creates a user when not existing, logs OTP, and returns insertId.
 *
 * 4) GET /user/suggestions (search mapping)
 *    - Respects active filter, maps DB rows to response shape (name, flags, etc.).
 *
 * Notes:
 * - DB is mocked via a simple `db.query` Jest mock with sequential `mockResolvedValueOnce`.
 * - `geoip-lite` is mocked and controlled per-test.
 * - This suite avoids any schema or migration side-effects.
 */

const request = require('supertest');
const express = require('express');

// IMPORTANT: Set this to the correct relative path for your project.
const buildUserRouter = require('../../../routes/v0.0/users'); // <-- adjust if needed

jest.mock('geoip-lite', () => ({
  lookup: jest.fn(),
}));
const geoip = require('geoip-lite');

// We don't need to mock express-prettify or body-parser; they are no-ops for tests.

describe('User & Contacts Router', () => {
  let app;
  let db;

  beforeEach(() => {
    db = { query: jest.fn() };
    app = express();
    app.use(express.json());
    app.use('/user', buildUserRouter(db));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('GET /user returns IP and geoData when no token is provided', async () => {
    geoip.lookup.mockReturnValue({
      city: 'London',
      region: 'ENG',
      country: 'GB',
      ll: [51.5074, -0.1278],
    });

    const res = await request(app)
      .get('/user?pretty=true')
      .set('x-forwarded-for', '1.2.3.4');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ip', '1.2.3.4');
    expect(res.body).toHaveProperty('geoData');
    expect(res.body.geoData).toMatchObject({
      city: 'London',
      region: 'ENG',
      country: 'GB',
    });
    expect(geoip.lookup).toHaveBeenCalledWith('1.2.3.4');
  });

  test('GET /user?token=abc returns 401 when token does not match a user', async () => {
    // DB responds with empty rows for the token lookup
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/user').query({ token: 'abc' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Token is incorrect' });

    // Verify the SQL was executed with the provided token
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/FROM users WHERE token = \? LIMIT 1/);
    expect(params).toEqual(['abc']);
  });

  test('POST /user/register inserts new user, creates OTP, and returns insertId', async () => {
    // 1) Uniqueness check: no existing user
    db.query.mockResolvedValueOnce([[]]);

    // 2) Insert user -> insertId returned
    db.query.mockResolvedValueOnce([{ insertId: 42 }]);

    // 3) Insert OTP log
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    geoip.lookup.mockReturnValue({
      city: 'Manchester',
      region: 'ENG',
      country: 'GB',
      ll: [53.4808, -2.2426],
    });

    const payload = {
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone_number: '0700000000',
      // country_code omitted to use default '+44' from route
    };

    const res = await request(app)
      .post('/user/register')
      .set('x-forwarded-for', '8.8.8.8')
      .set('user-agent', 'jest-test')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'User registered successfully',
      user_id: 42,
    });

    // Assert the three DB interactions in order
    expect(db.query).toHaveBeenCalledTimes(3);

    // Uniqueness check
    const [sql1, params1] = db.query.mock.calls[0];
    expect(sql1).toMatch(/SELECT id FROM users WHERE phone_number = \? AND country_code = \? OR email = \?/);
    expect(params1).toEqual(['0700000000', '+44', 'jane@example.com']);

    // Insert user
    const [sql2, params2] = db.query.mock.calls[1];
    expect(sql2).toMatch(/INSERT INTO users/i);
    expect(params2[0]).toBe('Jane'); // first_name
    expect(params2[2]).toBe('jane@example.com'); // email lowercased

    // Insert OTP
    const [sql3, params3] = db.query.mock.calls[2];
    expect(sql3).toMatch(/INSERT INTO otp_logins/i);
    expect(params3[0]).toBe(42); // user_id
    expect(typeof params3[1]).toBe('string'); // otp_code (6-digit, but route doesn't enforce format here)
    expect(params3[2]).toBeInstanceOf(Date); // expires_at
    expect(typeof params3[3]).toBe('string'); // ip_address (derived)
    expect(typeof params3[4]).toBe('string'); // user_agent
  });

  test('GET /user/suggestions maps active users and limits to 5', async () => {
    // Provide 2 active rows with diverse fields
    db.query.mockResolvedValueOnce([[
      {
        id: 1,
        first_name: 'John',
        last_name: 'Smith',
        email: 'john@ex.com',
        phone_number: '0711111111',
        profile_picture_url: 'http://img/1.png',
        date_of_birth: '1990-01-01',
        gender: 'M',
        address_line1: 'Addr 1',
        address_line2: null,
        city: 'Leeds',
        state: 'West Yorkshire',
        postal_code: 'LS1',
        country: 'UK',
        latitude: 53.8,
        longitude: -1.5,
        role: 'user',
        is_phone_verified: 1,
        created_at: '2024-05-05',
        updated_at: '2024-05-06',
      },
      {
        id: 2,
        first_name: 'Joanna',
        last_name: '',
        email: 'jo@ex.com',
        phone_number: '0722222222',
        profile_picture_url: null,
        date_of_birth: null,
        gender: 'F',
        address_line1: null,
        address_line2: null,
        city: 'York',
        state: 'North Yorkshire',
        postal_code: 'YO1',
        country: 'UK',
        latitude: 53.96,
        longitude: -1.08,
        role: 'moderator',
        is_phone_verified: 0,
        created_at: '2024-06-01',
        updated_at: '2024-06-02',
      },
    ]]);

    const res = await request(app)
      .get('/user/suggestions')
      .query({ search: 'jo' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);

    const [u1, u2] = res.body.data;
    expect(u1).toMatchObject({
      id: 1,
      name: 'John Smith',
      email: 'john@ex.com',
      phone_number: '0711111111',
      profile_picture_url: 'http://img/1.png',
      city: 'Leeds',
      state: 'West Yorkshire',
      postal_code: 'LS1',
      country: 'UK',
      latitude: 53.8,
      longitude: -1.5,
      role: 'user',
      is_phone_verified: true,
      created_at: '2024-05-05',
      updated_at: '2024-05-06',
    });

    expect(u2).toMatchObject({
      id: 2,
      name: 'Joanna',
      email: 'jo@ex.com',
      role: 'moderator',
      is_phone_verified: false,
    });

    // Ensure SQL had LIMIT 5 and ORDER BY created_at DESC applied by the route
    const [sql] = db.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY created_at DESC LIMIT 5/);
  });
});
