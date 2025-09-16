// Server/src/routes/badges.js
/**
 * badges.js
 *
 * Router exposing CRUD-lite endpoints for the badges feature.
 *
 * Endpoints:
 * - GET "/"                → List all available badges (id, name, description, icon_url, condition).
 * - GET "/user/:user_id"   → List badges earned by a specific user (with earned_at), most recent first.
 * - POST "/award"          → Assign a badge to a user (idempotent via INSERT IGNORE).
 *
 * Key behaviors & flow:
 * 1) Parsing:
 *    - Uses urlencoded and JSON body parsers for request payloads.
 *
 * 2) GET "/":
 *    - Executes a SELECT against the `badges` table ordered by id ASC.
 *    - Responds: { success: true, badges: [...] }.
 *    - On DB failure: 500 with { success: false, error: "Failed to fetch badges" }.
 *
 * 3) GET "/user/:user_id":
 *    - Validates :user_id as an integer; otherwise 400 with { success: false, message }.
 *    - Joins user_badges → badges, ordered by earned_at DESC.
 *    - Responds: { success: true, earned: [...] }.
 *    - On DB failure: 500 with { success: false, error: "Failed to fetch user badges" }.
 *
 * 4) POST "/award":
 *    - Validates body.user_id and body.badge_id as integers; otherwise 400 with { success: false, message }.
 *    - INSERT IGNORE into user_badges(user_id, badge_id) for idempotency.
 *    - affectedRows === 0 → already awarded; otherwise success.
 *    - Responds: { success: true, message: "Badge awarded successfully" | "Badge already awarded" }.
 *    - On DB failure: 500 with { success: false, error: "Failed to assign badge" }.
 *
 * Notes:
 * - SQL uses a backticked `condition` column to avoid keyword conflicts.
 * - The router is case-sensitive: new express.Router({ caseSensitive: true }).
 *
 * Author: Sunidhi Abhange
 */

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
