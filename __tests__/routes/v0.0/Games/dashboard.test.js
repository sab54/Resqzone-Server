/**
 * dashboard.test.js
 *
 * What This Test File Covers:
 *
 * 1. Parameter Validation
 *    - Non-integer :user_id returns 400 with a clear message.
 *
 * 2. 404: User Not Found
 *    - When profile query returns no rows, responds 404 { success:false, message:"User not found" }.
 *
 * 3. Happy Path
 *    - Returns merged profile + stats.
 *    - Defaults xp to 0 and level to 1 if `user_levels` has no row.
 *
 * 4. Database Error Path
 *    - Any thrown/rejected db error yields 500 with a consistent error message.
 */

const request = require('supertest');
const express = require('express');

// Import the router factory (update the relative path to your project layout)
const createDashboardRouter = require('../../../../routes/v0.0/Games/dashboard'); // ← adjust if needed

function makeAppWithDb(db) {
  const app = express();
  app.use('/dashboard', createDashboardRouter(db));
  return app;
}

describe('GET /dashboard/:user_id', () => {
  test('returns 400 for non-integer user_id', async () => {
    const db = { query: jest.fn() }; // should not be called
    const app = makeAppWithDb(db);

    const res = await request(app).get('/dashboard/not-a-number');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Invalid user ID' });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns 404 when user profile is not found', async () => {
    const db = {
      // 1) Profile query → no rows
      query: jest.fn().mockResolvedValueOnce([[]]),
    };
    const app = makeAppWithDb(db);

    const res = await request(app).get('/dashboard/42');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'User not found' });

    // Ensure only the first (profile) query ran
    expect(db.query).toHaveBeenCalledTimes(1);
    const [[profileSql, profileParams]] = db.query.mock.calls;
    expect(profileSql).toMatch(/FROM\s+users\s+WHERE\s+id\s=\s\?/i);
    expect(profileParams).toEqual([42]);
  });

  test('happy path: returns profile and stats; defaults xp=0, level=1 when user_levels missing', async () => {
    const profile = {
      first_name: 'Ava',
      last_name: 'Stone',
      email: 'ava@example.com',
      profile_picture_url: '/img/ava.png',
    };

    const db = { query: jest.fn() };

    // 1) Profile found
    db.query.mockResolvedValueOnce([[profile]]);
    // 2) user_levels: no row → defaults should kick in (xp 0, level 1)
    db.query.mockResolvedValueOnce([[]]);
    // 3) completed tasks count
    db.query.mockResolvedValueOnce([[{ count: 5 }]]);
    // 4) completed quizzes count
    db.query.mockResolvedValueOnce([[{ count: 2 }]]);
    // 5) badges count
    db.query.mockResolvedValueOnce([[{ badge_count: 3 }]]);

    const app = makeAppWithDb(db);
    const res = await request(app).get('/dashboard/7');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      profile,
      stats: {
        xp: 0,
        level: 1,
        completed_tasks: 5,
        completed_quizzes: 2,
        badges_earned: 3,
      },
    });

    // Verify the 5 expected queries were executed with proper bindings
    expect(db.query).toHaveBeenCalledTimes(5);

    const [call1, call2, call3, call4, call5] = db.query.mock.calls;

    // Profile
    expect(call1[0]).toMatch(/FROM\s+users\s+WHERE\s+id\s=\s\?/i);
    expect(call1[1]).toEqual([7]);

    // user_levels
    expect(call2[0]).toMatch(/FROM\s+user_levels\s+WHERE\s+user_id\s=\s\?/i);
    expect(call2[1]).toEqual([7]);

    // tasks count
    expect(call3[0]).toMatch(/FROM\s+user_tasks\s+WHERE\s+user_id\s=\s\?/i);
    expect(call3[1]).toEqual([7]);

    // quizzes count
    expect(call4[0]).toMatch(/FROM\s+quiz_submissions\s+WHERE\s+user_id\s=\s\?/i);
    expect(call4[1]).toEqual([7]);

    // badges count
    expect(call5[0]).toMatch(/FROM\s+user_badges\s+WHERE\s+user_id\s=\s\?/i);
    expect(call5[1]).toEqual([7]);
  });

  test('returns 500 when a database error occurs', async () => {
    const db = { query: jest.fn() };

    // Throw on the first query (profile) to simulate a DB error
    db.query.mockRejectedValueOnce(new Error('boom'));

    const app = makeAppWithDb(db);
    const res = await request(app).get('/dashboard/9');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: 'Failed to load dashboard data',
    });

    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
