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
