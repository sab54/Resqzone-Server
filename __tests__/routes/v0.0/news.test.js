/**
 * newsBookmarks.test.js
 *
 * Covers:
 * 1) GET /bookmarks — requires user_id and returns rows ordered by bookmarkedAt DESC.
 * 2) POST /bookmarks — inserts with proper defaulting/formatting (happy path).
 * 3) POST /bookmarks — duplicate key -> 409 with "Bookmark already exists".
 * 4) DELETE /bookmarks — not found -> 404; and DELETE /bookmarks/all — clears and returns count.
 */

const request = require('supertest');
const express = require('express');

// Adjust the path below to where this router file lives:
const buildRouter = require('../../../routes/v0.0/news'); // <-- update if needed

describe('News Bookmarks Router', () => {
  let app;
  let db;

  beforeEach(() => {
    db = { query: jest.fn() };
    app = express();
    app.use(express.json());
    app.use('/', buildRouter(db));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('GET /bookmarks returns 400 without user_id and 200 with rows when provided', async () => {
    // Missing user_id
    const bad = await request(app).get('/bookmarks');
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'Missing user_id' });

    // With user_id
    const rows = [
      {
        id: 2,
        user_id: 7,
        url: 'https://b.example/article-b',
        title: 'B',
        description: 'desc',
        author: 'auth',
        'source.id': 'src2',
        'source.name': 'Source 2',
        urlToImage: 'https://img/b.jpg',
        content: 'content',
        publishedAt: '2024-06-01T10:00:00Z',
        category: 'Tech',
        bookmarkedAt: '2024-06-02T12:00:00Z',
      },
      {
        id: 1,
        user_id: 7,
        url: 'https://a.example/article-a',
        title: 'A',
        description: null,
        author: null,
        'source.id': null,
        'source.name': null,
        urlToImage: null,
        content: null,
        publishedAt: '2024-05-01T10:00:00Z',
        category: 'General',
        bookmarkedAt: '2024-05-01T12:00:00Z',
      },
    ];
    db.query.mockResolvedValueOnce([rows]);

    const ok = await request(app).get('/bookmarks').query({ user_id: '7' });

    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body)).toBe(true);
    expect(ok.body).toHaveLength(2);
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/FROM news_bookmarks\s+WHERE user_id = \?\s+ORDER BY bookmarkedAt DESC/i);
    expect(params).toEqual(['7']);
  });

  test('POST /bookmarks inserts with defaults and date formatting (happy path)', async () => {
    // Insert success
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const payload = {
      user_id: 9,
      url: 'https://news.example/item',
      title: 'Nice Read',
      description: 'Short summary',
      author: undefined, // should become null
      source: { id: 'nyt', name: 'NYTimes' },
      urlToImage: 'https://img/item.jpg',
      content: 'lorem ipsum',
      publishedAt: '2024-07-20T08:09:10.123Z', // should become "YYYY-MM-DD HH:MM:SS"
      // category omitted -> 'General'
      // bookmarkedAt omitted -> now (formatted)
    };

    const res = await request(app).post('/bookmarks').send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'added' });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO news_bookmarks/i);

    // Params order as defined in route
    expect(params[0]).toBe(9); // user_id
    expect(params[1]).toBe('https://news.example/item'); // url
    expect(params[2]).toBe('Nice Read'); // title
    expect(params[3]).toBe('Short summary'); // description
    expect(params[4]).toBeNull(); // author -> null
    expect(params[5]).toBe('nyt'); // source.id
    expect(params[6]).toBe('NYTimes'); // source.name
    expect(params[7]).toBe('https://img/item.jpg'); // urlToImage
    expect(params[8]).toBe('lorem ipsum'); // content

    // publishedAt formatted to "YYYY-MM-DD HH:MM:SS"
    expect(typeof params[9]).toBe('string');
    expect(params[9]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    // category default
    expect(params[10]).toBe('General');

    // bookmarkedAt formatted string
    expect(typeof params[11]).toBe('string');
    expect(params[11]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test('POST /bookmarks returns 409 on duplicate', async () => {
    const dupErr = new Error('Duplicate');
    dupErr.code = 'ER_DUP_ENTRY';
    db.query.mockRejectedValueOnce(dupErr);

    const res = await request(app).post('/bookmarks').send({
      user_id: 3,
      url: 'https://dup.example/x',
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Bookmark already exists' });
  });

  test('DELETE /bookmarks not found -> 404; DELETE /bookmarks/all returns cleared count', async () => {
    // DELETE single — no rows affected
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const notFound = await request(app)
      .delete('/bookmarks')
      .query({ user_id: 5, url: 'https://none.example' });

    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ message: 'Bookmark not found' });

    // DELETE all
    db.query.mockResolvedValueOnce([{ affectedRows: 12 }]);

    const cleared = await request(app)
      .delete('/bookmarks/all')
      .query({ user_id: 5 });

    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ status: 'cleared', deleted: 12 });

    // SQL checks
    const [sql1, params1] = db.query.mock.calls[0];
    expect(sql1).toMatch(/DELETE FROM news_bookmarks WHERE user_id = \? AND url = \?/i);
    expect(params1).toEqual([ '5', 'https://none.example' ]);

    const [sql2, params2] = db.query.mock.calls[1];
    expect(sql2).toMatch(/DELETE FROM news_bookmarks WHERE user_id = \?/i);
    expect(params2).toEqual([ '5' ]);
  });
});
