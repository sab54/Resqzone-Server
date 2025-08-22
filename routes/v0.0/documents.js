const express = require('express');
const bodyParser = require('body-parser');
const pretty = require('express-prettify');

module.exports = (db) => {
    const router = express.Router({ caseSensitive: true });

    router.use(pretty({ query: 'pretty' }));
    router.use(bodyParser.urlencoded({ extended: false }));
    router.use(bodyParser.json());

    // GET /documents/:userId - List docs
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
                `SELECT d.*,
                        (SELECT read_at FROM document_reads r WHERE r.user_id = ? AND r.document_id = d.id) AS read_at
                 FROM documents d
                 WHERE (d.user_id = ? OR d.user_id IS NULL) AND d.deleted_at IS NULL
                 ORDER BY d.uploaded_at DESC`,
                [user_id, user_id]
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

    // POST /documents - Add new document
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

    // POST /documents/:id/read - Mark as read
    router.post('/read', async (req, res) => {
        const { user_id, document_id } = req.body;

        if (!user_id || !document_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing user_id or document_id',
            });
        }

        try {
            await db.query(
                `INSERT INTO document_reads (user_id, document_id)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
                [user_id, document_id]
            );

            res.json({ success: true, message: 'Document marked as read' });
        } catch (err) {
            console.error('POST /documents/:id/read error:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to mark as read',
            });
        }
    });

    // DELETE /documents/:id/read - Mark as unread
    router.delete('/read', async (req, res) => {
        const { user_id, document_id } = req.query;

        if (!user_id || !document_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing user_id or document_id',
            });
        }

        try {
            const [result] = await db.query(
                `DELETE FROM document_reads WHERE user_id = ? AND document_id = ?`,
                [user_id, document_id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Document was not marked as read',
                });
            }

            res.json({ success: true, message: 'Document marked as unread' });
        } catch (err) {
            console.error('DELETE /documents/:id/read error:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to mark as unread',
            });
        }
    });

    // DELETE /documents - Soft delete a document by URL
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

    // DELETE /documents/all - Soft delete all user docs
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
