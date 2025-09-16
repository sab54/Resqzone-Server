// Server/src/routes/dashboard.js
/**
 * dashboard.js
 *
 * Router exposing a consolidated "dashboard" view for a user.
 *
 * Endpoint:
 * - GET "/:user_id"
 *   → Returns a summary with profile, XP/level, and counts for tasks, quizzes, and badges.
 *
 * Request validation & flow:
 * 1) Validate `:user_id` is an integer; otherwise respond 400 { success:false, message:"Invalid user ID" }.
 * 2) Query basic profile from `users` (first_name, last_name, email, profile_picture_url).
 *    - If not found, respond 404 { success:false, message:"User not found" }.
 * 3) Query XP/level from `user_levels` (optional). If missing, defaults are xp=0 and level=1.
 * 4) Query aggregated counts:
 *    - Completed tasks from `user_tasks` (COUNT(*)).
 *    - Completed quizzes from `quiz_submissions` (COUNT(*)).
 *    - Badges earned from `user_badges` (COUNT(*)).
 * 5) On success, respond 200 with:
 *    {
 *      success: true,
 *      profile,
 *      stats: { xp, level, completed_tasks, completed_quizzes, badges_earned }
 *    }
 *
 * Error handling:
 * - Any database error yields 500 { success:false, error:"Failed to load dashboard data" }.
 *
 * Notes:
 * - Uses optional chaining to safely default xp/level when no record exists in `user_levels`.
 * - SQL param binding is used (`?`) to prevent injection.
 *
 * Author: Sunidhi Abhange
 */

const express = require('express');

module.exports = (db) => {
    const router = express.Router();

    // GET /dashboard/:user_id - Summary of user profile, XP, tasks, quizzes, badges
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
