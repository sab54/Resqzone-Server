const express = require('express');
const bodyParser = require('body-parser');

module.exports = (db) => {
    const router = express.Router({ caseSensitive: true });
    router.use(bodyParser.urlencoded({ extended: false }));
    router.use(bodyParser.json());

    router.get('/', async (req, res) => {
        const { category = 'All', page = 1, pageSize = 6 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const size = parseInt(pageSize);

        try {
            let whereClause = '';
            const params = [];

            if (category !== 'All') {
                whereClause = 'WHERE category = ?';
                params.push(category);
            }

            const [totalCountResult] = await db.query(
                `SELECT COUNT(*) AS totalCount FROM system_alerts ${whereClause}`,
                params
            );
            const totalCount = totalCountResult[0].totalCount;

            const [alerts] = await db.query(
                `SELECT id, title, message, category, urgency, latitude, longitude, radius_km, created_by, created_at
             FROM system_alerts
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
                [...params, size, offset]
            );

            res.json({
                alerts,
                hasMore: offset + size < totalCount,
                totalCount,
            });
        } catch (err) {
            console.error('GET /alerts error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch alerts',
            });
        }
    });

    /**
     * 📌 GET /alerts/user/:userId - Fetch user alerts
     */
    router.get('/user/:userId', async (req, res) => {
        const userId = parseInt(req.params.userId);
        if (isNaN(userId)) {
            return res
                .status(400)
                .json({ success: false, message: 'Invalid user ID' });
        }
        try {
            const [alerts] = await db.query(
                `SELECT id, user_id, type, title, message, related_id, is_read, urgency, latitude, longitude, radius_km, source, created_at
                 FROM user_alerts
                 WHERE user_id = ?
                 ORDER BY created_at DESC`,
                [userId]
            );
            res.json({ success: true, alerts });
        } catch (err) {
            console.error('GET /alerts/user error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch alerts',
            });
        }
    });

    router.get('/system', async (req, res) => {
        const userId = parseInt(req.query.userId);

        try {
            let query = `
            SELECT sa.id, sa.title, sa.message, sa.category, sa.urgency, sa.latitude, sa.longitude, sa.radius_km,
                   sa.is_active, sa.created_by, sa.created_at, sa.updated_at,
                   CASE WHEN sar.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_read
            FROM system_alerts sa
            LEFT JOIN system_alert_reads sar
                ON sa.id = sar.system_alert_id AND sar.user_id = ?
            WHERE sa.is_active = TRUE
            ORDER BY sa.created_at DESC
        `;

            const [systemAlerts] = await db.query(query, [userId || 0]);

            res.json({ success: true, systemAlerts });
        } catch (err) {
            console.error('GET /alerts/system error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch system alerts',
            });
        }
    });

    /**
     * 📌 POST /alerts/system - Create system alert for users
     */
    router.post('/system', async (req, res) => {
        const {
            userIds,
            title,
            message,
            urgency,
            latitude,
            longitude,
            radius_km,
            source,
        } = req.body;
        if (!Array.isArray(userIds) || !title || !message) {
            return res.status(400).json({
                success: false,
                message: 'userIds[], title, message required',
            });
        }
        try {
            const promises = userIds.map((userId) =>
                db.query(
                    `INSERT INTO user_alerts (user_id, type, title, message, urgency, latitude, longitude, radius_km, source)
                     VALUES (?, 'system', ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        userId,
                        title,
                        message,
                        urgency || null,
                        latitude || null,
                        longitude || null,
                        radius_km || null,
                        source || 'system',
                    ]
                )
            );
            await Promise.all(promises);
            res.json({
                success: true,
                message: `Alerts sent to ${userIds.length} users`,
            });
        } catch (err) {
            console.error('POST /alerts/system error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to create alerts',
            });
        }
    });

    /**
     * 📌 POST /alerts/emergency - Create emergency alerts based on location proximity
     */
    router.post('/emergency', async (req, res) => {
        const {
            title,
            message,
            urgency,
            latitude,
            longitude,
            radius_km,
            created_by,
        } = req.body;
        if (
            !title ||
            !message ||
            latitude == null ||
            longitude == null ||
            radius_km == null
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'title, message, latitude, longitude, radius_km are required',
            });
        }
        try {
            // Insert into system_alerts
            const [alertResult] = await db.query(
                `INSERT INTO system_alerts (title, message, category, urgency, latitude, longitude, radius_km, created_by)
                 VALUES (?, ?, 'emergency', ?, ?, ?, ?, ?)`,
                [
                    title,
                    message,
                    urgency || 'advisory',
                    latitude,
                    longitude,
                    radius_km,
                    created_by || null,
                ]
            );
            const alertId = alertResult.insertId;

            // Find users within radius (Haversine formula in SQL)
            const [users] = await db.query(
                `SELECT id,
                        (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude)))) AS distance
                 FROM users
                 WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                 HAVING distance <= ?`,
                [latitude, longitude, latitude, radius_km]
            );

            const userPromises = users.map((user) =>
                db.query(
                    `INSERT INTO user_alerts (user_id, type, related_id, title, message, urgency, latitude, longitude, radius_km, source)
                     VALUES (?, 'emergency', ?, ?, ?, ?, ?, ?, ?, 'system')`,
                    [
                        user.id,
                        alertId,
                        title,
                        message,
                        urgency || 'advisory',
                        latitude,
                        longitude,
                        radius_km,
                    ]
                )
            );

            const logPromises = users.map((user) =>
                db.query(
                    `INSERT INTO emergency_logs (alert_id, user_id, delivery_status) VALUES (?, ?, 'sent')`,
                    [alertId, user.id]
                )
            );

            await Promise.all([...userPromises, ...logPromises]);

            res.json({
                success: true,
                message: `Emergency alert sent to ${users.length} users`,
                alert_id: alertId,
            });
        } catch (err) {
            console.error('POST /alerts/emergency error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to send emergency alert',
            });
        }
    });

    /**
     * 📌 PATCH /alerts/:alertId/read - Mark an alert as read
     */
    router.patch('/:alertId/read', async (req, res) => {
        const alertId = parseInt(req.params.alertId);
        const { type, userId } = req.body;

        if (isNaN(alertId) || !type || (type === 'system' && !userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid parameters',
            });
        }

        try {
            if (type === 'user') {
                await db.query(
                    `UPDATE user_alerts SET is_read = TRUE WHERE id = ?`,
                    [alertId]
                );
                return res.json({
                    success: true,
                    message: 'User alert marked as read',
                });
            } else if (type === 'system') {
                // Insert into system_alert_reads
                await db.query(
                    `INSERT IGNORE INTO system_alert_reads (user_id, system_alert_id) VALUES (?, ?)`,
                    [userId, alertId]
                );
                return res.json({
                    success: true,
                    message: 'System alert marked as read for user',
                });
            } else {
                return res
                    .status(400)
                    .json({ success: false, message: 'Invalid alert type' });
            }
        } catch (err) {
            console.error('PATCH /alerts/:alertId/read error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to mark alert as read',
            });
        }
    });

    /**
     * 📌 DELETE /alerts/:alertId - Delete an alert
     */
    router.delete('/:alertId', async (req, res) => {
        const alertId = parseInt(req.params.alertId);
        if (isNaN(alertId)) {
            return res
                .status(400)
                .json({ success: false, message: 'Invalid alert ID' });
        }
        try {
            await db.query(`DELETE FROM user_alerts WHERE id = ?`, [alertId]);
            res.json({ success: true, message: 'Alert deleted' });
        } catch (err) {
            console.error('DELETE /alerts/:id error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to delete alert',
            });
        }
    });

    return router;
};
