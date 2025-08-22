const express = require('express');
const bodyParser = require('body-parser');

module.exports = (db) => {
    const router = express.Router({ caseSensitive: true });

    router.use(bodyParser.urlencoded({ extended: false }));
    router.use(bodyParser.json());

    // GET /tasks/:user_id - Fetch checklist tasks assigned to a user
    router.get('/:user_id', async (req, res) => {
        const userId = parseInt(req.params.user_id);
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID',
            });
        }

        try {
            const [tasks] = await db.query(
                `SELECT t.id, t.title, t.description, t.due_date, t.xp_reward
                 FROM checklist_tasks t
                 INNER JOIN user_assigned_tasks uat ON t.id = uat.task_id
                 WHERE t.is_active = TRUE AND uat.user_id = ?
                 ORDER BY t.due_date ASC`,
                [userId]
            );
            res.json({ success: true, tasks });
        } catch (err) {
            console.error('GET /tasks/:user_id error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch assigned tasks',
            });
        }
    });

    // GET /tasks/progress/:user_id - Get user's completed checklist tasks
    router.get('/progress/:user_id', async (req, res) => {
        const userId = parseInt(req.params.user_id);
        if (isNaN(userId)) {
            return res
                .status(400)
                .json({ success: false, message: 'Invalid user ID' });
        }

        try {
            const [completed] = await db.query(
                `SELECT task_id, completed_at
                 FROM user_tasks
                 WHERE user_id = ?`,
                [userId]
            );
            res.json({ success: true, completedTasks: completed });
        } catch (err) {
            console.error(err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch progress',
            });
        }
    });

    // POST /tasks/complete - Mark a task as completed by a user
    router.post('/complete', async (req, res) => {
        const { user_id, task_id } = req.body;

        if (!user_id || !task_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id and task_id required',
            });
        }

        try {
            const [existing] = await db.query(
                `SELECT * FROM user_tasks WHERE user_id = ? AND task_id = ?`,
                [user_id, task_id]
            );
            if (existing.length > 0) {
                return res.json({
                    success: true,
                    message: 'Task already completed',
                });
            }

            const [[task]] = await db.query(
                `SELECT xp_reward FROM checklist_tasks WHERE id = ? AND is_active = TRUE`,
                [task_id]
            );
            if (!task) {
                return res.status(404).json({
                    success: false,
                    message: 'Task not found or inactive',
                });
            }

            await db.query(
                `INSERT INTO user_tasks (user_id, task_id) VALUES (?, ?)`,
                [user_id, task_id]
            );

            await db.query(
                `INSERT INTO user_levels (user_id, xp, level)
                 VALUES (?, ?, 1)
                 ON DUPLICATE KEY UPDATE xp = xp + ?, level = FLOOR((xp + ?) / 100) + 1`,
                [user_id, task.xp_reward, task.xp_reward, task.xp_reward]
            );

            const [[{ count: completedCount }]] = await db.query(
                `SELECT COUNT(*) AS count FROM user_tasks WHERE user_id = ?`,
                [user_id]
            );
            const [[{ count: totalTasks }]] = await db.query(
                `SELECT COUNT(*) AS count FROM checklist_tasks WHERE is_active = TRUE`
            );

            if (completedCount === 1) {
                const [[badge]] = await db.query(
                    `SELECT id FROM badges WHERE name = 'Starter' LIMIT 1`
                );
                if (badge) {
                    await db.query(
                        `INSERT IGNORE INTO user_badges (user_id, badge_id)
                         VALUES (?, ?)`,
                        [user_id, badge.id]
                    );
                }
            }

            if (completedCount === 5) {
                const [[badge]] = await db.query(
                    `SELECT id FROM badges WHERE name = 'Prep Pro' LIMIT 1`
                );
                if (badge) {
                    await db.query(
                        `INSERT IGNORE INTO user_badges (user_id, badge_id)
                         VALUES (?, ?)`,
                        [user_id, badge.id]
                    );
                }
            }

            if (completedCount === totalTasks) {
                const [[badge]] = await db.query(
                    `SELECT id FROM badges WHERE name = 'Checklist Champion' LIMIT 1`
                );
                if (badge) {
                    await db.query(
                        `INSERT IGNORE INTO user_badges (user_id, badge_id)
                         VALUES (?, ?)`,
                        [user_id, badge.id]
                    );
                }
            }

            res.json({
                success: true,
                message: 'Task marked as completed',
                xp_earned: task.xp_reward,
            });
        } catch (err) {
            console.error('POST /tasks/complete error:', err);
            res.status(500).json({
                success: false,
                error: 'Task completion failed',
            });
        }
    });

    // POST /tasks/uncomplete - Unmark a task as completed by a user
    router.post('/uncomplete', async (req, res) => {
        const { user_id, task_id } = req.body;

        if (!user_id || !task_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id and task_id required',
            });
        }

        try {
            const [[task]] = await db.query(
                `SELECT xp_reward FROM checklist_tasks WHERE id = ?`,
                [task_id]
            );
            if (!task) {
                return res.status(404).json({
                    success: false,
                    message: 'Task not found',
                });
            }

            await db.query(
                `DELETE FROM user_tasks WHERE user_id = ? AND task_id = ?`,
                [user_id, task_id]
            );

            await db.query(
                `UPDATE user_levels
                 SET xp = GREATEST(0, xp - ?),
                     level = FLOOR(GREATEST(0, xp - ?) / 100) + 1
                 WHERE user_id = ?`,
                [task.xp_reward, task.xp_reward, user_id]
            );

            const [[{ count: completedCount }]] = await db.query(
                `SELECT COUNT(*) AS count FROM user_tasks WHERE user_id = ?`,
                [user_id]
            );
            const [[{ count: totalTasks }]] = await db.query(
                `SELECT COUNT(*) AS count FROM checklist_tasks WHERE is_active = TRUE`
            );

            if (completedCount === 0) {
                await db.query(
                    `DELETE FROM user_badges WHERE user_id = ? AND badge_id = (SELECT id FROM badges WHERE name = 'Starter')`,
                    [user_id]
                );
            }

            if (completedCount < 5) {
                await db.query(
                    `DELETE FROM user_badges WHERE user_id = ? AND badge_id = (SELECT id FROM badges WHERE name = 'Prep Pro')`,
                    [user_id]
                );
            }

            if (completedCount < totalTasks) {
                await db.query(
                    `DELETE FROM user_badges WHERE user_id = ? AND badge_id = (SELECT id FROM badges WHERE name = 'Checklist Champion')`,
                    [user_id]
                );
            }

            await db.query(
                `INSERT INTO admin_action_logs (admin_user_id, action, target_user_id, entity_type, entity_id, description)
                 VALUES (?, ?, ?, 'task', ?, ?)`,
                [
                    user_id,
                    'uncomplete_task',
                    user_id,
                    task_id,
                    'User uncompleted a checklist task',
                ]
            );

            res.json({
                success: true,
                message: 'Task uncompleted and XP/Badges adjusted',
            });
        } catch (err) {
            console.error('POST /tasks/uncomplete error:', err);
            res.status(500).json({
                success: false,
                error: 'Task uncompletion failed',
            });
        }
    });

    return router;
};
