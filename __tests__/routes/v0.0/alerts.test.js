/**
 * alerts.test.js
 *
 * Covers:
 * 1) GET /alerts — pagination + optional category filter and SQL/params.
 * 2) POST /alerts/emergency — inserts system alert, selects users in radius, inserts alerts & logs.
 * 3) PATCH /alerts/:alertId/read — marks user alert vs system alert read.
 * 4) POST /alerts/system — sends user alerts to multiple users.
 */

const request = require('supertest');
const express = require('express');

// Update this path to your actual router location:
const buildRouter = require('../../../routes/v0.0/alerts'); // <-- adjust if needed

describe('Alerts Router', () => {
  let app;
  let db;

  beforeEach(() => {
    db = { query: jest.fn() };
    app = express();
    app.use(express.json());
    app.use('/alerts', buildRouter(db));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('GET /alerts paginates and optionally filters by category', async () => {
    // Simulate category filter "Weather", page=2, pageSize=3
    // 1) COUNT(*)
    db.query.mockResolvedValueOnce([[{ totalCount: 7 }]]);
    // 2) SELECT page rows
    const pageRows = [
      { id: 4, title: 'Storm', message: 'Severe storm', category: 'Weather', urgency: 'advisory', created_at: '2024-06-10' },
      { id: 3, title: 'Rain',  message: 'Heavy rain',   category: 'Weather', urgency: 'low',      created_at: '2024-06-09' },
      { id: 2, title: 'Wind',  message: 'Strong wind',  category: 'Weather', urgency: 'moderate', created_at: '2024-06-08' },
    ];
    db.query.mockResolvedValueOnce([pageRows]);

    const res = await request(app)
      .get('/alerts')
      .query({ category: 'Weather', page: '2', pageSize: '3' });

    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(3);
    expect(res.body.totalCount).toBe(7);
    // page 2 of size 3 => items 4..6 of 7; hasMore true (since 3* (2) = 6 < 7)
    expect(res.body.hasMore).toBe(true);

    // SQL checks
    const [countSql, countParams] = db.query.mock.calls[0];
    expect(countSql).toMatch(/SELECT COUNT\(\*\) AS totalCount FROM system_alerts WHERE category = \?/i);
    expect(countParams).toEqual(['Weather']);

    const [rowsSql, rowsParams] = db.query.mock.calls[1];
    expect(rowsSql).toMatch(/SELECT id, title, message, category, urgency/i);
    // last two params are LIMIT and OFFSET (size=3, offset=(2-1)*3=3)
    expect(rowsParams.slice(-2)).toEqual([3, 3]);
  });

  test('POST /alerts/emergency inserts system alert, targets users in radius, and logs deliveries', async () => {
    // 1) Insert system_alerts -> returns insertId
    db.query.mockResolvedValueOnce([{ insertId: 99 }]);
    // 2) Haversine users in range
    db.query.mockResolvedValueOnce([[{ id: 7 }, { id: 8 }]]);
    // 3) user_alerts (batch via Promise.all) - first user
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    // 4) user_alerts - second user
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    // 5) emergency_logs for user 7
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    // 6) emergency_logs for user 8
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const payload = {
      title: 'Flood Warning',
      message: 'Move to higher ground.',
      urgency: 'moderate',
      latitude: 51.5,
      longitude: -0.12,
      radius_km: 1.2,
      created_by: 5,
    };

    const res = await request(app).post('/alerts/emergency').send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Emergency alert sent to 2 users',
      alert_id: 99,
    });

    // Verify first INSERT (system_alerts)
    const [insertSql, insertParams] = db.query.mock.calls[0];
    expect(insertSql).toMatch(/INSERT INTO system_alerts/i);
    expect(insertParams).toEqual([
      'Flood Warning',
      'Move to higher ground.',
      'moderate',
      51.5,
      -0.12,
      1.2,
      5,
    ]);

    // Verify Haversine SELECT
    const [rangeSql, rangeParams] = db.query.mock.calls[1];
    expect(rangeSql).toMatch(/6371 \* acos\(cos\(radians\(\?\)\)/i);
    expect(rangeParams).toEqual([51.5, -0.12, 51.5, 1.2]);

    // There should be 6 total DB calls: 1 insert + 1 select + 2 alerts + 2 logs
    expect(db.query).toHaveBeenCalledTimes(6);
  });

  test('PATCH /alerts/:alertId/read updates user vs system read-state', async () => {
    // user alert read: UPDATE user_alerts SET is_read = TRUE WHERE id = ?
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const userRes = await request(app)
      .patch('/alerts/123/read')
      .send({ type: 'user' });

    expect(userRes.status).toBe(200);
    expect(userRes.body).toEqual({
      success: true,
      message: 'User alert marked as read',
    });
    const [userSql, userParams] = db.query.mock.calls[0];
    expect(userSql).toMatch(/UPDATE user_alerts SET is_read = TRUE WHERE id = \?/i);
    expect(userParams).toEqual([123]);

    // system alert read: INSERT IGNORE into system_alert_reads
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const sysRes = await request(app)
      .patch('/alerts/456/read')
      .send({ type: 'system', userId: 77 });

    expect(sysRes.status).toBe(200);
    expect(sysRes.body).toEqual({
      success: true,
      message: 'System alert marked as read for user',
    });
    const [sysSql, sysParams] = db.query.mock.calls[1];
    expect(sysSql).toMatch(/INSERT IGNORE INTO system_alert_reads \(user_id, system_alert_id\)/i);
    expect(sysParams).toEqual([77, 456]);
  });

  test('POST /alerts/system sends alerts to multiple users', async () => {
    // Promise.all of two INSERTs
    db.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).post('/alerts/system').send({
      userIds: [10, 11],
      title: 'Planned Maintenance',
      message: 'Service downtime at 02:00 UTC',
      urgency: 'low',
      source: 'ops',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Alerts sent to 2 users',
    });

    // Two calls, one per user
    expect(db.query).toHaveBeenCalledTimes(2);
    const [sql1, p1] = db.query.mock.calls[0];
    const [sql2, p2] = db.query.mock.calls[1];
    expect(sql1).toMatch(/INSERT INTO user_alerts/i);
    expect(sql2).toMatch(/INSERT INTO user_alerts/i);
    expect(p1[0]).toBe(10);
    expect(p2[0]).toBe(11);
  });
});
