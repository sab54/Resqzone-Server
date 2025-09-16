// Server/Games/leaderboard.js
/**
 * leaderboard.js
 *
 * Router exposing the leaderboard API.
 *
 * Endpoint:
 * - GET "/"
 *   → Returns the top 20 active users ranked by XP (descending), then by level.
 *
 * Query Parameters:
 * - city (optional): If provided, restricts leaderboard to users in that city.
 * - role (optional): If provided, restricts leaderboard to users with that role.
 *
 * SQL & Flow:
 * 1) Selects from `user_levels` joined with `users` for profile data:
 *    - id, first_name, last_name, profile_picture_url, city, role
 *    - xp, level
 * 2) Filters:
 *    - u.is_active = TRUE
 *    - City filter only applied if query param provided (otherwise `? IS NULL`).
 *    - Role filter only applied if query param provided.
 * 3) Orders by xp DESC, then level DESC.
 * 4) Limits results to 20.
 *
 * Responses:
 * - 200: { success:true, leaderboard:[...] } with user stats.
 * - 500: { success:false, error:"Failed to load leaderboard" } on DB errors.
 *
 * Notes:
 * - Uses conditional `? IS NULL OR column = ?` pattern to handle optional filters safely.
 * - Always enforces u.is_active = TRUE to exclude inactive users.
 *
 * Author: Sunidhi Abhange
 */

const express = require('express');

module.exports = (db) => {
    const router = express.Router();

    router.get('/', async (req, res) => {
        const { city = null, role = null } = req.query;

        try {
            const [leaders] = await db.query(
                `SELECT
                    u.id,
                    u.first_name,
                    u.last_name,
                    u.profile_picture_url,
                    u.city,
                    u.role,
                    l.xp,
                    l.level
                 FROM user_levels l
                 JOIN users u ON u.id = l.user_id
                 WHERE u.is_active = TRUE
                   AND (? IS NULL OR u.city = ?)
                   AND (? IS NULL OR u.role = ?)
                 ORDER BY l.xp DESC, l.level DESC
                 LIMIT 20`,
                [city, city, role, role]
            );

            res.json({ success: true, leaderboard: leaders });
        } catch (err) {
            console.error('GET /leaderboard error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to load leaderboard',
            });
        }
    });

    return router;
};
