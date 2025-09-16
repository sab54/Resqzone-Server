/**
 * documents.test.js
 *
 * Covers:
 * 1) GET /documents/:userId — validates ID and returns rows with proper SQL & params.
 * 2) POST /documents — 400 on missing fields; 201 on success with defaults/trim.
 * 3) POST /documents/read — upserts read state (ON DUPLICATE KEY UPDATE).
 * 4) DELETE /documents/read — 404 when not marked; DELETE /documents/all — clears all.
 */

const request = require('supertest');
const express = require('express');

// Update this path to where your router file actually lives:
const buildRouter = require('../../../routes/v0.0/documents'); // <-- adjust if needed

describe('Documents Router', () => {
  let app;
  let db;

  beforeEach(() => {
    db = { query: jest.fn() };
    app = express();
    app.use(express.json());
    app.use('/documents', buildRouter(db));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('GET /documents/:userId validates ID and returns document list with read_at', async () => {
    // Invalid ID
    const bad = await request(app).get('/documents/not-a-number');
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({
      success: false,
      message: 'Invalid or missing user ID',
    });

    // Happy path
    const rows = [
      {
        id: 10,
        user_id: 7,
        title: 'Policy',
        description: 'Company policy',
        file_url: 'https://files/policy.pdf',
        file_type: 'pdf',
        category: 'General',
        uploaded_by: null,
        uploaded_at: '2024-06-02 12:00:00',
        deleted_at: null,
        read_at: '2024-06-03 09:00:00',
      },
    ];
    db.query
      .mockResolvedValueOnce([rows]); // for SELECT

    const ok = await request(app).get('/documents/7');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ success: true, data: rows });

    // SQL & params check
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(
      /SELECT d\.\*,\s*\(SELECT read_at FROM document_reads r WHERE r\.user_id = \? AND r\.document_id = d\.id\) AS read_at\s+FROM documents d\s+WHERE \(d\.user_id = \? OR d\.user_id IS NULL\) AND d\.deleted_at IS NULL\s+ORDER BY d\.uploaded_at DESC/i
    );
    expect(params).toEqual([7, 7]);
  });

  test('POST /documents returns 400 on missing fields, then 201 on success with defaults and trimming', async () => {
    // Missing required
    const bad = await request(app).post('/documents').send({
      // user_id missing
      title: 'Doc',
      url: 'https://f/x',
    });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({
      success: false,
      message: 'Missing required fields (user_id, title, url)',
    });

    // Success insert
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).post('/documents').send({
      user_id: 5,
      title: '  Handbook  ',
      description: null,
      url: '  https://cdn/handbook.pdf  ',
      // file_type omitted -> null
      // category omitted -> 'General'
      // uploadedBy omitted -> null
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      message: 'Document added successfully',
    });

    // SQL & params
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO documents/i);
    expect(params).toEqual([
      5,                          // user_id
      'Handbook',                 // title.trim()
      null,                       // description
      'https://cdn/handbook.pdf', // file_url.trim()
      null,                       // file_type default
      'General',                  // category default
      null,                       // uploadedBy default
    ]);
  });

  test('POST /documents/read upserts read state and returns success', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).post('/documents/read').send({
      user_id: 7,
      document_id: 10,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Document marked as read',
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(
      /INSERT INTO document_reads \(user_id, document_id\)\s+VALUES \(\?, \?\)\s+ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP/i
    );
    expect(params).toEqual([7, 10]);
  });

  test('DELETE /documents/read returns 404 when not marked; DELETE /documents/all clears for user', async () => {
    // Unread (no rows deleted)
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const notMarked = await request(app)
      .delete('/documents/read')
      .query({ user_id: 9, document_id: 123 });

    expect(notMarked.status).toBe(404);
    expect(notMarked.body).toEqual({
      success: false,
      message: 'Document was not marked as read',
    });

    // Clear all documents for user
    db.query.mockResolvedValueOnce([{ affectedRows: 5 }]); // count not used by route

    const cleared = await request(app)
      .delete('/documents/all')
      .send({ user_id: 9 });

    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({
      success: true,
      message: 'All documents cleared for user',
    });

    // SQL checks for both queries
    const [sql1, params1] = db.query.mock.calls[0];
    expect(sql1).toMatch(/DELETE FROM document_reads WHERE user_id = \? AND document_id = \?/i);
    expect(params1).toEqual(['9', '123']);

    const [sql2, params2] = db.query.mock.calls[1];
    expect(sql2).toMatch(/UPDATE documents\s+SET deleted_at = CURRENT_TIMESTAMP\s+WHERE user_id = \?/i);
    expect(params2).toEqual([9]);
  });
});
