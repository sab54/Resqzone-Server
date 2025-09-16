/**
 * badges.test.js
 *
 * What This Test File Covers:
 *
 * 1. GET /badges
 *    - Returns a success payload with an array of badges.
 *
 * 2. GET /badges/user/:user_id (validation)
 *    - Non-integer user_id yields 400 with a helpful message.
 *
 * 3. GET /badges/user/:user_id (happy path)
 *    - Returns earned badges ordered by earned_at DESC (we assert passthrough shape).
 *
 * 4. POST /badges/award
 *    - When INSERT affects 1 row → "Badge awarded successfully".
 *    - When INSERT affects 0 rows (INSERT IGNORE) → "Badge already awarded".
 *
 * Notes:
 * - No source changes required; tests mock db.query per-route expectations.
 */

const request = require('supertest');
const express = require('express');

// Import the router factory (adjust the relative path if your structure differs)
const createBadgesRouter = require('../../../../routes/v0.0/Games/badges'); // ← update if needed

function makeAppWithDb(db) {
  const app = express();
  // The router internally attaches its own body parsers; no need to add here.
  app.use('/badges', createBadgesRouter(db));
  return app;
}

describe('Badges routes', () => {
  test('GET /badges returns list of badges with success: true', async () => {
    const db = {
      // The router expects db.query to resolve to [rows]
      query: jest.fn().mockResolvedValueOnce([
        [
          { id: 1, name: 'Starter', description: 'Joined the app', icon_url: '/i/1.png', condition: 'signup' },
          { id: 2, name: 'Helper', description: 'First answer', icon_url: '/i/2.png', condition: 'answer_1' },
        ],
      ]),
    };

    const app = makeAppWithDb(db);
    const res = await request(app).get('/badges');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      badges: [
        { id: 1, name: 'Starter', description: 'Joined the app', icon_url: '/i/1.png', condition: 'signup' },
        { id: 2, name: 'Helper', description: 'First answer', icon_url: '/i/2.png', condition: 'answer_1' },
      ],
    });

    // Verify the SQL shape was called once
    expect(db.query).toHaveBeenCalledTimes(1);
    const [[sql]] = db.query.mock.calls;
    expect(sql).toMatch(/FROM\s+badges/i);
    expect(sql).toMatch(/ORDER BY\s+id\s+ASC/i);
  });

  test('GET /badges/user/:user_id rejects non-integer user_id with 400', async () => {
    const db = { query: jest.fn() }; // Should not be called for invalid param
    const app = makeAppWithDb(db);

    const res = await request(app).get('/badges/user/not-a-number');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Invalid user ID',
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('GET /badges/user/:user_id returns earned badges (success path)', async () => {
    const earnedRows = [
      {
        id: 3,
        name: 'Contributor',
        description: 'Posted 10 answers',
        icon_url: '/i/3.png',
        earned_at: '2025-09-01T12:00:00Z',
      },
      {
        id: 2,
        name: 'Helper',
        description: 'First answer',
        icon_url: '/i/2.png',
        earned_at: '2025-08-20T10:00:00Z',
      },
    ];

    const db = {
      query: jest.fn().mockResolvedValueOnce([earnedRows]),
    };
    const app = makeAppWithDb(db);

    const res = await request(app).get('/badges/user/42');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, earned: earnedRows });

    // Assert correct SQL and parameter binding
    const [[sql, params]] = db.query.mock.calls;
    expect(sql).toMatch(/FROM\s+user_badges\s+ub\s+JOIN\s+badges\s+b/i);
    expect(sql).toMatch(/WHERE\s+ub\.user_id\s*=\s*\?/i);
    expect(sql).toMatch(/ORDER BY\s+ub\.earned_at\s+DESC/i);
    expect(params).toEqual([42]);
  });

  test('POST /badges/award handles success and duplicate via affectedRows', async () => {
    const db = { query: jest.fn() };
    // First call: affectedRows = 1 (awarded)
    db.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      // Second call: affectedRows = 0 (already awarded via INSERT IGNORE)
      .mockResolvedValueOnce([{ affectedRows: 0 }]);

    const app = makeAppWithDb(db);

    // Success case
    let res = await request(app)
      .post('/badges/award')
      .set('Content-Type', 'application/json')
      .send({ user_id: 7, badge_id: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Badge awarded successfully' });

    // Duplicate (idempotent) case
    res = await request(app)
      .post('/badges/award')
      .set('Content-Type', 'application/json')
      .send({ user_id: 7, badge_id: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Badge already awarded' });

    // Verify INSERT IGNORE SQL pattern and params
    const [[sql1, params1], [sql2, params2]] = db.query.mock.calls;
    expect(sql1).toMatch(/INSERT\s+IGNORE\s+INTO\s+user_badges/i);
    expect(sql2).toMatch(/INSERT\s+IGNORE\s+INTO\s+user_badges/i);
    expect(params1).toEqual([7, 3]);
    expect(params2).toEqual([7, 3]);
  });
});
