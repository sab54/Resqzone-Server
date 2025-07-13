const express = require('express');
const bodyParser = require('body-parser');
const pretty = require('express-prettify');

module.exports = (db) => {
    const router = express.Router({ caseSensitive: true });

    router.use(pretty({ query: 'pretty' }));
    router.use(bodyParser.urlencoded({ extended: false }));
    router.use(bodyParser.json());

    // ========================================
    // 📌 GET /documents?user_id=123 - List docs
    // ========================================
    router.get('/:userId', async (req, res) => {
        const user_id = parseInt(req.params.userId);

        if (!user_id || isNaN(user_id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or missing user ID',
            });
        }

        try {
            const [rows] = await db.query(
                `SELECT * FROM documents
                 WHERE (user_id = ? OR user_id IS NULL) AND deleted_at IS NULL
                 ORDER BY uploaded_at DESC`,
                [user_id]
            );

            res.json({ success: true, data: rows });
        } catch (err) {
            console.error('GET /documents error:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch documents',
            });
        }
    });

    // ========================================
    // 📌 POST /documents - Add new document
    // ========================================
    router.post('/', async (req, res) => {
        const {
            user_id,
            title,
            description,
            url: file_url,
            file_type,
            category = 'General',
            uploadedBy = null,
        } = req.body;

        if (!user_id || !title || !file_url) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields (user_id, title, url)',
            });
        }

        try {
            await db.query(
                `INSERT INTO documents
                 (user_id, title, description, file_url, file_type, category, uploaded_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    user_id,
                    title.trim(),
                    description || null,
                    file_url.trim(),
                    file_type || null,
                    category,
                    uploadedBy,
                ]
            );

            res.status(201).json({
                success: true,
                message: 'Document added successfully',
            });
        } catch (err) {
            console.error('POST /documents error:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to add document',
            });
        }
    });

    // ===================================================
    // 📌 DELETE /documents - Soft delete a document by URL
    // ===================================================
    router.delete('/', async (req, res) => {
        const { user_id, url } = req.body;

        if (!user_id || !url) {
            return res.status(400).json({
                success: false,
                message: 'User ID and document URL required',
            });
        }

        try {
            const [result] = await db.query(
                `UPDATE documents
                 SET deleted_at = CURRENT_TIMESTAMP
                 WHERE user_id = ? AND file_url = ?`,
                [user_id, url.trim()]
            );

            if (result.affectedRows === 0) {
                return res
                    .status(404)
                    .json({ success: false, message: 'Document not found' });
            }

            res.json({ success: true, message: 'Document removed' });
        } catch (err) {
            console.error('DELETE /documents error:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to remove document',
            });
        }
    });

    // ===================================================
    // 📌 DELETE /documents/all - Soft delete all user docs
    // ===================================================
    router.delete('/all', async (req, res) => {
        const { user_id } = req.body;

        if (!user_id) {
            return res
                .status(400)
                .json({ success: false, message: 'User ID required' });
        }

        try {
            await db.query(
                `UPDATE documents
                 SET deleted_at = CURRENT_TIMESTAMP
                 WHERE user_id = ?`,
                [user_id]
            );

            res.json({
                success: true,
                message: 'All documents cleared for user',
            });
        } catch (err) {
            console.error('DELETE /documents/all error:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to clear documents',
            });
        }
    });

    return router;
};
