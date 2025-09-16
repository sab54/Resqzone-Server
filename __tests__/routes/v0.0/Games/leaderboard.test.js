/**
 * leaderboard.test.js
 *
 * What This Test File Covers:
 *
 * 1. GET /leaderboard returns top users with success:true.
 * 2. Filters by city and role when query params are present.
 * 3. Propagates DB errors into 500 responses.
 */

const request = require('supertest');
const express = require('express');

// Import the router factory
const createLeaderboardRouter = require('../../../../routes/v0.0/Games/leaderboard'); // adjust if needed

function makeAppWithDb(db) {
  const app = express();
  app.use('/leaderboard', createLeaderboardRouter(db));
  return app;
}

describe('GET /leaderboard', () => {
  test('returns leaderboard results with success:true', async () => {
    const mockLeaders = [
      {
        id: 1,
        first_name: 'Liam',
        last_name: 'Nguyen',
        profile_picture_url: '/img/liam.png',
        city: 'London',
        role: 'volunteer',
        xp: 200,
        level: 5,
      },
      {
        id: 2,
        first_name: 'Zara',
        last_name: 'Patel',
        profile_picture_url: '/img/zara.png',
        city: 'London',
        role: 'admin',
        xp: 150,
        level: 4,
      },
    ];

    const db = {
      query: jest.fn().mockResolvedValueOnce([mockLeaders]),
    };

    const app = makeAppWithDb(db);
    const res = await request(app).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      leaderboard: mockLeaders,
    });

    // Assert SQL shape
    expect(db.query).toHaveBeenCalledTimes(1);
    const [[sql, params]] = db.query.mock.calls;
    expect(sql).toMatch(/FROM\s+user_levels\s+l\s+JOIN\s+users\s+u/i);
    expect(sql).toMatch(/ORDER BY\s+l\.xp\s+DESC,\s+l\.level\s+DESC/i);
    expect(sql).toMatch(/LIMIT\s+20/i);
    // With no filters, params are [null, null, null, null]
    expect(params).toEqual([null, null, null, null]);
  });

  test('applies city and role filters when provided', async () => {
    const db = {
      query: jest.fn().mockResolvedValueOnce([[]]),
    };
    const app = makeAppWithDb(db);

    await request(app).get('/leaderboard').query({ city: 'Paris', role: 'moderator' });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [[sql, params]] = db.query.mock.calls;

    expect(sql).toMatch(/u\.city\s=\s\?/i);
    expect(sql).toMatch(/u\.role\s=\s\?/i);
    expect(params).toEqual(['Paris', 'Paris', 'moderator', 'moderator']);
  });

  test('returns 500 when database query fails', async () => {
    const db = {
      query: jest.fn().mockRejectedValueOnce(new Error('boom')),
    };
    const app = makeAppWithDb(db);

    const res = await request(app).get('/leaderboard');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: 'Failed to load leaderboard',
    });
  });
});
