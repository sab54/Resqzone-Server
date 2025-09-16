/**
 * quizzes.test.js
 * (fixed: use a literal path for jest.mock to avoid hoisting error)
 */

// Mock node-fetch so requiring the router doesn’t explode
jest.mock('node-fetch', () => {
  const mockFetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
  }));
  mockFetch.Response = function () {};
  mockFetch.Headers = function () {};
  mockFetch.Request = function () {};
  return mockFetch;
}, { virtual: true });

const request = require('supertest');
const express = require('express');

// ✅ Mock the AI helper using a **literal** path that resolves to the same file as the router’s require
jest.mock('../../../../services/quizAI', () => ({
  generateQuizFromAI: jest.fn(),
}));
const { generateQuizFromAI } = require('../../../../services/quizAI');

// Import the router factory
const createQuizzesRouter = require('../../../../routes/v0.0/Games/quizzes');

function makeAppWithDb(db) {
  const app = express();
  app.use(express.json());
  app.use('/quizzes', createQuizzesRouter(db));
  return app;
}

describe('Quizzes routes', () => {
  test('GET /quizzes returns active quizzes with success:true', async () => {
    const rows = [
      { id: 1, title: 'First Aid Basics', description: 'Intro', category: 'Safety', xp_reward: 50 },
      { id: 2, title: 'Fire Safety', description: 'Extinguishers', category: 'Safety', xp_reward: 75 },
    ];
    const db = { query: jest.fn().mockResolvedValueOnce([rows]) };

    const app = makeAppWithDb(db);
    const res = await request(app).get('/quizzes');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, quizzes: rows });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [[sql]] = db.query.mock.calls;
    expect(sql).toMatch(/FROM\s+quizzes\s+WHERE\s+is_active\s=\s+TRUE/i);
    expect(sql).toMatch(/ORDER BY\s+created_at\s+DESC/i);
  });

  test('GET /quizzes/:id returns quiz with nested questions and options', async () => {
    const db = { query: jest.fn() };

    db.query.mockResolvedValueOnce([[{ id: 10, title: 'CPR', description: 'Basics', category: 'Health', xp_reward: 100 }]]);
    db.query.mockResolvedValueOnce([[
      { id: 101, question: 'Check responsiveness?', question_type: 'multiple_choice' },
    ]]);
    db.query.mockResolvedValueOnce([[
      { id: 1001, option_text: 'Tap and shout', is_correct: true },
      { id: 1002, option_text: 'Ignore', is_correct: false },
    ]]);

    const app = makeAppWithDb(db);
    const res = await request(app).get('/quizzes/10');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.quiz.id).toBe(10);
    expect(Array.isArray(res.body.quiz.questions)).toBe(true);
    expect(res.body.quiz.questions[0].options).toHaveLength(2);

    expect(db.query).toHaveBeenCalledTimes(3);
    const [call1, call2, call3] = db.query.mock.calls;
    expect(call1[0]).toMatch(/FROM\s+quizzes\s+WHERE\s+id\s=\s\?\s+AND\s+is_active\s=\s+TRUE/i);
    expect(call1[1]).toEqual([10]);
    expect(call2[0]).toMatch(/FROM\s+quiz_questions\s+WHERE\s+quiz_id\s=\s\?/i);
    expect(call2[1]).toEqual([10]);
    expect(call3[0]).toMatch(/FROM\s+quiz_options\s+WHERE\s+question_id\s=\s\?/i);
    expect(call3[1]).toEqual([101]);
  });

  test('POST /quizzes/:id/submit first-time perfect score awards XP and badge', async () => {
    const db = { query: jest.fn() };

    const payload = {
      user_id: 7,
      answers: [{ question_id: 101, selected_options: ['Tap and shout'] }],
    };

    db.query.mockResolvedValueOnce([[{ xp_reward: 100 }]]);
    db.query.mockResolvedValueOnce([[{ id: 101 }]]);
    db.query.mockResolvedValueOnce([[{ option_text: 'Tap and shout' }]]);
    db.query.mockResolvedValueOnce([[]]);
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ id: 9 }]]);
    db.query.mockResolvedValueOnce([{}]);

    const app = makeAppWithDb(db);
    const res = await request(app).post('/quizzes/10/submit').send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Quiz submitted',
      score: 1,
      total: 1,
      xp_earned: 100,
    });

    const calls = db.query.mock.calls.map(([s, p]) => [String(s), p]);
    expect(calls[0][0]).toMatch(/FROM\s+quizzes/i);
    expect(calls[0][1]).toEqual([10]);
    expect(calls[2][0]).toMatch(/FROM\s+quiz_options/i);
    expect(calls[2][1]).toEqual([101]);
    expect(calls[3][0]).toMatch(/FROM\s+quiz_submissions/i);
    expect(calls[3][1]).toEqual([7, 10]);
  });

  test('POST /quizzes/ai-generate creates quiz + checklist and assigns to chat members', async () => {
    generateQuizFromAI.mockResolvedValueOnce({
      title: 'Flood Safety',
      description: 'Staying safe during floods',
      category: 'Safety',
      xp_reward: 80,
      questions: [{
        question: 'Move to higher ground?',
        type: 'multiple_choice',
        options: [
          { text: 'Yes', is_correct: true },
          { text: 'No', is_correct: false },
        ],
      }],
      checklist: {
        title: 'Flood Tasks',
        description: 'Basics',
        xp_reward: 40,
        items: ['Pack emergency kit'],
      },
    });

    const db = { query: jest.fn() };

    db.query.mockResolvedValueOnce([{ insertId: 77 }]);
    db.query.mockResolvedValueOnce([{ insertId: 701 }]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ user_id: 1 }, { user_id: 2 }]]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([{ insertId: 900 }]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([{ insertId: 901 }]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([{}]);

    const app = makeAppWithDb(db);
    const res = await request(app).post('/quizzes/ai-generate').send({
      topic: 'Flood safety',
      difficulty: 'easy',
      chatId: 123,
      createdBy: 50,
      checklist: {
        title: 'Flood Prep',
        description: 'Do these now',
        xp_reward: 60,
        items: ['Check forecasts', 'Prepare go-bag'],
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.quiz.id).toBe(77);
    expect(res.body.quiz.title).toBe('Flood Safety');
    expect(res.body.assigned_to).toBe(2);
    expect(res.body.checklist).toEqual({
      title: 'Flood Prep',
      items: [
        { id: 900, title: 'Check forecasts' },
        { id: 901, title: 'Prepare go-bag' },
      ],
      xp_reward: 60,
    });

    expect(generateQuizFromAI).toHaveBeenCalledWith({ topic: 'Flood safety', difficulty: 'easy' });

    const [[insertQuizSql, insertQuizParams]] = db.query.mock.calls;
    expect(insertQuizSql).toMatch(/INSERT INTO quizzes/i);
    expect(insertQuizParams).toEqual([
      'Flood Safety',
      'Staying safe during floods',
      'Safety',
      80,
    ]);
  });
});
