/**
 * tasks.test.js
 *
 * What This Test File Covers:
 *
 * 1) GET /tasks/:user_id
 *    - Validates integer param and returns assigned tasks.
 *
 * 2) POST /tasks/complete
 *    - First-time completion grants XP and awards "Starter" when completedCount === 1.
 *
 * 3) POST /tasks/uncomplete
 *    - Deducts XP, removes badges per rules, and writes an admin action log.
 *
 * 4) Validation path
 *    - GET /tasks/:user_id rejects non-integer with 400.
 */

const request = require('supertest');
const express = require('express');

// Import the router factory (align with your repo layout)
const createTasksRouter = require('../../../../routes/v0.0/Games/tasks');

function makeAppWithDb(db) {
  const app = express();
  app.use(express.json());
  app.use('/tasks', createTasksRouter(db));
  return app;
}

describe('Tasks routes', () => {
  test('GET /tasks/:user_id returns assigned tasks (happy path)', async () => {
    const db = { query: jest.fn() };

    const tasks = [
      { id: 11, title: 'Assemble kit', description: '3-day kit', due_date: '2025-09-30', xp_reward: 30 },
      { id: 12, title: 'Check smoke alarms', description: 'Test monthly', due_date: '2025-10-05', xp_reward: 20 },
    ];

    db.query.mockResolvedValueOnce([tasks]); // main SELECT

    const app = makeAppWithDb(db);
    const res = await request(app).get('/tasks/7');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, tasks });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [[sql, params]] = db.query.mock.calls;
    expect(sql).toMatch(/FROM\s+checklist_tasks\s+t\s+INNER JOIN\s+user_assigned_tasks\s+uat/i);
    expect(sql).toMatch(/t\.is_active\s=\s+TRUE/i);
    expect(sql).toMatch(/ORDER BY\s+t\.due_date\s+ASC/i);
    expect(params).toEqual([7]);
  });

  test('GET /tasks/:user_id rejects non-integer param with 400', async () => {
    const db = { query: jest.fn() };
    const app = makeAppWithDb(db);

    const res = await request(app).get('/tasks/not-a-number');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Invalid user ID' });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('POST /tasks/complete awards XP and "Starter" on first completion', async () => {
    const db = { query: jest.fn() };

    // Request body
    const body = { user_id: 5, task_id: 11 };

    // 1) existing completion? → none
    db.query.mockResolvedValueOnce([[]]);

    // 2) task exists & active with xp_reward
    db.query.mockResolvedValueOnce([ [ { xp_reward: 30 } ] ]);

    // 3) insert user_tasks
    db.query.mockResolvedValueOnce([{}]);

    // 4) upsert/increment user_levels
    db.query.mockResolvedValueOnce([{}]);

    // 5) completedCount for this user (after insert) → 1
    db.query.mockResolvedValueOnce([ [ { count: 1 } ] ]);

    // 6) total active tasks
    db.query.mockResolvedValueOnce([ [ { count: 10 } ] ]);

    // 7) select "Starter" badge id
    db.query.mockResolvedValueOnce([ [ { id: 91 } ] ]);

    // 8) insert IGNORE user_badges
    db.query.mockResolvedValueOnce([{}]);

    const app = makeAppWithDb(db);
    const res = await request(app).post('/tasks/complete').send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Task marked as completed',
      xp_earned: 30,
    });

    // Assert pivotal SQL calls and parameters
    const calls = db.query.mock.calls;
    expect(calls[0][0]).toMatch(/FROM\s+user_tasks\s+WHERE\s+user_id\s=\s\?\s+AND\s+task_id\s=\s\?/i);
    expect(calls[0][1]).toEqual([5, 11]);

    expect(calls[1][0]).toMatch(/FROM\s+checklist_tasks\s+WHERE\s+id\s=\s\?\s+AND\s+is_active\s=\s+TRUE/i);
    expect(calls[1][1]).toEqual([11]);

    expect(calls[2][0]).toMatch(/INSERT\s+INTO\s+user_tasks/i);
    expect(calls[2][1]).toEqual([5, 11]);

    expect(calls[3][0]).toMatch(/INSERT\s+INTO\s+user_levels/i);
    // params: [user_id, xp, xp, xp]
    expect(calls[3][1]).toEqual([5, 30, 30, 30]);

    expect(calls[4][0]).toMatch(/FROM\s+user_tasks\s+WHERE\s+user_id\s=\s\?/i);
    expect(calls[4][1]).toEqual([5]);

    expect(calls[5][0]).toMatch(/FROM\s+checklist_tasks\s+WHERE\s+is_active\s=\s+TRUE/i);

    expect(calls[6][0]).toMatch(/SELECT\s+id\s+FROM\s+badges\s+WHERE\s+name\s=\s+'Starter'/i);
    expect(calls[7][0]).toMatch(/INSERT\s+IGNORE\s+INTO\s+user_badges/i);
    expect(calls[7][1]).toEqual([5, 91]);
  });

  test('POST /tasks/uncomplete deducts XP, removes badges as needed, logs admin action', async () => {
    const db = { query: jest.fn() };

    const body = { user_id: 5, task_id: 11 };

    // 1) fetch task xp_reward
    db.query.mockResolvedValueOnce([ [ { xp_reward: 20 } ] ]);

    // 2) delete from user_tasks
    db.query.mockResolvedValueOnce([{}]);

    // 3) update user_levels: subtract with GREATEST clamp
    db.query.mockResolvedValueOnce([{}]);

    // 4) completedCount after deletion
    db.query.mockResolvedValueOnce([ [ { count: 0 } ] ]);

    // 5) total active tasks
    db.query.mockResolvedValueOnce([ [ { count: 10 } ] ]);

    // 6) delete "Starter" when count === 0
    db.query.mockResolvedValueOnce([{}]);

    // 7) delete "Prep Pro" when count < 5
    db.query.mockResolvedValueOnce([{}]);

    // 8) delete "Checklist Champion" when count < total
    db.query.mockResolvedValueOnce([{}]);

    // 9) insert admin action log
    db.query.mockResolvedValueOnce([{}]);

    const app = makeAppWithDb(db);
    const res = await request(app).post('/tasks/uncomplete').send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Task uncompleted and XP/Badges adjusted',
    });

    const calls = db.query.mock.calls;

    expect(calls[0][0]).toMatch(/FROM\s+checklist_tasks\s+WHERE\s+id\s=\s\?/i);
    expect(calls[0][1]).toEqual([11]);

    expect(calls[1][0]).toMatch(/DELETE\s+FROM\s+user_tasks\s+WHERE\s+user_id\s=\s\?\s+AND\s+task_id\s=\s\?/i);
    expect(calls[1][1]).toEqual([5, 11]);

    expect(calls[2][0]).toMatch(/UPDATE\s+user_levels\s+SET\s+xp\s=\s+GREATEST\(/i);
    expect(calls[2][1]).toEqual([20, 20, 5]);

    expect(calls[3][0]).toMatch(/FROM\s+user_tasks\s+WHERE\s+user_id\s=\s\?/i);
    expect(calls[3][1]).toEqual([5]);

    expect(calls[4][0]).toMatch(/FROM\s+checklist_tasks\s+WHERE\s+is_active\s=\s+TRUE/i);

    expect(calls[5][0]).toMatch(/DELETE\s+FROM\s+user_badges.*'Starter'/i);
    expect(calls[5][1]).toEqual([5]);

    expect(calls[6][0]).toMatch(/DELETE\s+FROM\s+user_badges.*'Prep Pro'/i);
    expect(calls[6][1]).toEqual([5]);

    expect(calls[7][0]).toMatch(/DELETE\s+FROM\s+user_badges.*'Checklist Champion'/i);
    expect(calls[7][1]).toEqual([5]);

    expect(calls[8][0]).toMatch(/INSERT\s+INTO\s+admin_action_logs/i);
    expect(calls[8][1]).toEqual([
      5,
      'uncomplete_task',
      5,
      11,
      'User uncompleted a checklist task',
    ]);
  });
});
