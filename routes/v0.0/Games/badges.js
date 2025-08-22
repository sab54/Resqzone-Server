const express = require('express');
const bodyParser = require('body-parser');

module.exports = (db) => {
    const router = express.Router({ caseSensitive: true });

    router.use(bodyParser.urlencoded({ extended: false }));
    router.use(bodyParser.json());

    // GET /badges - List all available badges
    router.get('/', async (req, res) => {
        try {
            const [badges] = await db.query(`
                SELECT id, name, description, icon_url, \`condition\`
                FROM badges
                ORDER BY id ASC
            `);
            res.json({ success: true, badges });
        } catch (err) {
            console.error('GET /badges error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch badges',
            });
        }
    });

    // GET /badges/user/:user_id - Get user's earned badges
    router.get('/user/:user_id', async (req, res) => {
        const userId = parseInt(req.params.user_id);
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID',
            });
        }

        try {
            const [rows] = await db.query(
                `
                SELECT b.id, b.name, b.description, b.icon_url, ub.earned_at
                FROM user_badges ub
                JOIN badges b ON ub.badge_id = b.id
                WHERE ub.user_id = ?
                ORDER BY ub.earned_at DESC
            `,
                [userId]
            );

            res.json({ success: true, earned: rows });
        } catch (err) {
            console.error('GET /badges/user/:user_id error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch user badges',
            });
        }
    });

    // POST /badges/award - Assign badge to user
    router.post('/award', async (req, res) => {
        const userId = parseInt(req.body.user_id);
        const badgeId = parseInt(req.body.badge_id);

        if (isNaN(userId) || isNaN(badgeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user_id or badge_id',
            });
        }

        try {
            const [result] = await db.query(
                `
                INSERT IGNORE INTO user_badges (user_id, badge_id)
                VALUES (?, ?)`,
                [userId, badgeId]
            );

            const message =
                result.affectedRows === 0
                    ? 'Badge already awarded'
                    : 'Badge awarded successfully';

            res.json({ success: true, message });
        } catch (err) {
            console.error('POST /badges/award error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to assign badge',
            });
        }
    });

    return router;
};
