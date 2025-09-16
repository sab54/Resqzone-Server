/**
 * chat.test.js
 *
 * Covers:
 * 1) GET /chat/list/:user_id — happy path mapping + is_nearby and socket emit.
 * 2) POST /chat/create — returns existing direct chat when found (no new chat).
 * 3) POST /chat/:chat_id/add-members — inserts members & alerts, emits per-user update.
 * 4) DELETE /chat/:chat_id/remove-member — owner cannot remove themselves (400).
 */
// Mock node-fetch (ESM-only) with a virtual CJS stub so the router can be required.
jest.mock('node-fetch', () => {
  const mockFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
  }));
  // node-fetch v3 also exposes { Response, Headers, Request }; stub minimally if needed
  mockFetch.Response = function() {};
  mockFetch.Headers = function() {};
  mockFetch.Request = function() {};
  return mockFetch;
}, { virtual: true });


const request = require('supertest');
const express = require('express');

// Update this path to the actual location of your router file:
const buildRouter = require('../../../routes/v0.0/chat'); // <-- adjust if needed

const makeIoMock = () => {
  const room = { emit: jest.fn() };
  return {
    to: jest.fn(() => room),
    __room: room, // exposed for assertions
  };
};

describe('Chat Router', () => {
  let app;
  let db;
  let io;

  beforeEach(() => {
    db = { query: jest.fn() };
    io = makeIoMock();

    app = express();
    app.use(express.json());
    app.use('/chat', buildRouter(db, io));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('GET /chat/list/:user_id returns enriched chats and emits list update', async () => {
    // 1) current user postal
    db.query
      .mockResolvedValueOnce([[{ postal_code: 'AB1 2CD' }]]) // users WHERE id=?
      // 2) chats for the user
      .mockResolvedValueOnce([[
        {
          chat_id: 10,
          is_group: 0,
          name: null,
          created_by: 5,
          latitude: null,
          longitude: null,
          radius_km: null,
          updated_at: '2024-07-01 12:00:00',
          last_message: 'hey',
          last_sender_id: 6,
          last_message_at: '2024-07-01 12:00:00',
          created_at: '2024-06-30 10:00:00',
        }
      ]])
      // 3) members across chats
      .mockResolvedValueOnce([[
        // current user
        {
          chat_id: 10,
          id: 5,
          first_name: 'Alice',
          last_name: 'Anderson',
          profile_picture_url: 'http://img/a.png',
          email: 'a@example.com',
          postal_code: 'AB1 2CD',
          role: 'member',
        },
        // other user (postal matches -> is_nearby true)
        {
          chat_id: 10,
          id: 6,
          first_name: 'Bob',
          last_name: 'Brown',
          profile_picture_url: 'http://img/b.png',
          email: 'b@example.com',
          postal_code: 'AB1 2CD',
          role: 'member',
        },
      ]]);

    const res = await request(app).get('/chat/list/5');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);

    const chat = res.body.data[0];
    expect(chat).toMatchObject({
      id: 10,
      is_group: false,
      name: 'Bob Brown', // derived for direct chat
      lastMessage: 'hey',
      lastMessageAt: '2024-07-01 12:00:00',
      is_nearby: true, // postal codes match
      updated_at: '2024-07-01 12:00:00',
    });

    // socket emission
    expect(io.to).toHaveBeenCalledWith('user_5');
    expect(io.__room.emit).toHaveBeenCalledWith('chat:list_update', expect.any(Array));

    // SQL sanity checks
    const [sql1, params1] = db.query.mock.calls[0];
    expect(sql1).toMatch(/SELECT postal_code FROM users WHERE id = \? LIMIT 1/i);
    expect(params1).toEqual([5]);

    const [sql2, params2] = db.query.mock.calls[1];
    expect(sql2).toMatch(/FROM chats c[\s\S]*JOIN chat_members cm ON cm.chat_id = c.id/i);
    expect(params2).toEqual([5]);

    const [sql3, params3] = db.query.mock.calls[2];
    expect(sql3).toMatch(/FROM chat_members cm[\s\S]*JOIN users u ON u.id = cm.user_id[\s\S]*WHERE cm.chat_id IN \(\?\)/i);
    expect(params3).toEqual([[10]]);
  });

  test('POST /chat/create returns existing direct chat if already present', async () => {
    // Direct chat check finds existing id=77
    db.query
      .mockResolvedValueOnce([[{ id: 77 }]]); // existing direct chat

    const res = await request(app).post('/chat/create').send({
      user_id: 5,
      participant_ids: [6],
      is_group: false,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Chat already exists',
      chat_id: 77,
    });

    // Only the existence query should have run
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/WHERE c\.is_group = 0/i);
    expect(params).toEqual([5, 6]);
  });

  test('POST /chat/:chat_id/add-members inserts and alerts, emitting update per user', async () => {
    // INSERT IGNORE members
    db.query
      .mockResolvedValueOnce([{ affectedRows: 2 }]) // insert members
      .mockResolvedValueOnce([{ affectedRows: 2 }]); // insert alerts

    const res = await request(app)
      .post('/chat/123/add-members')
      .send({ user_id: 5, user_ids: [7, 8] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Members added to chat successfully',
      added_user_ids: [7, 8],
    });

    // Two DB calls
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[0][0]).toMatch(/INSERT IGNORE INTO chat_members/i);
    expect(db.query.mock.calls[1][0]).toMatch(/INSERT INTO user_alerts/i);

    // Emits once per user to their rooms
    expect(io.to).toHaveBeenCalledWith('user_7');
    expect(io.to).toHaveBeenCalledWith('user_8');
    expect(io.__room.emit).toHaveBeenCalledWith('chat:list_update:trigger');
  });

  test('DELETE /chat/:chat_id/remove-member rejects owner removing themselves (400)', async () => {
    // Requester is owner
    db.query
      .mockResolvedValueOnce([[{ role: 'owner' }]]); // roleRow for requested_by

    const res = await request(app)
      .delete('/chat/55/remove-member')
      .query({ user_id: '9', requested_by: '9' }); // same -> trying to remove self

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: 'Group owner cannot remove themselves',
    });

    // Only role check executed
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/SELECT role FROM chat_members WHERE chat_id = \? AND user_id = \? LIMIT 1/i);
    expect(params).toEqual([55, 9]);
  });
});
