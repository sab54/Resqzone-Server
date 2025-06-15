const express = require('express');

module.exports = (db) => {
    const router = express.Router();

    /**
     * 📌 GET /dashboard/:user_id - Summary of user profile, XP, tasks, quizzes, badges
     */
    router.get('/:user_id', async (req, res) => {
        const userId = parseInt(req.params.user_id);
        if (isNaN(userId)) {
            return res
                .status(400)
                .json({ success: false, message: 'Invalid user ID' });
        }

        try {
            // Basic profile info
            const [[profile]] = await db.query(
                `SELECT first_name, last_name, email, profile_picture_url FROM users WHERE id = ?`,
                [userId]
            );

            if (!profile) {
                return res
                    .status(404)
                    .json({ success: false, message: 'User not found' });
            }

            // XP & level
            const [[level]] = await db.query(
                `SELECT xp, level FROM user_levels WHERE user_id = ?`,
                [userId]
            );

            // Task completion count
            const [[completedTasks]] = await db.query(
                `SELECT COUNT(*) AS count FROM user_tasks WHERE user_id = ?`,
                [userId]
            );

            // Quiz submission count
            const [[completedQuizzes]] = await db.query(
                `SELECT COUNT(*) AS count FROM quiz_submissions WHERE user_id = ?`,
                [userId]
            );

            // Badge count
            const [[badgeStats]] = await db.query(
                `SELECT COUNT(*) AS badge_count FROM user_badges WHERE user_id = ?`,
                [userId]
            );

            res.json({
                success: true,
                profile,
                stats: {
                    xp: level?.xp || 0,
                    level: level?.level || 1,
                    completed_tasks: completedTasks.count,
                    completed_quizzes: completedQuizzes.count,
                    badges_earned: badgeStats.badge_count,
                },
            });
        } catch (err) {
            console.error('GET /dashboard/:user_id error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to load dashboard data',
            });
        }
    });

    return router;
};
