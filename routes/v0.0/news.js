const express = require('express');
const bodyParser = require('body-parser');
const pretty = require('express-prettify');

module.exports = (db) => {
    const router = express.Router({ caseSensitive: true });

    router.use(pretty({ query: 'pretty' }));
    router.use(bodyParser.urlencoded({ extended: false }));
    router.use(bodyParser.json());

    const formatDateForMySQL = (isoDate) => {
        if (!isoDate) return null;
        return new Date(isoDate).toISOString().slice(0, 19).replace('T', ' ');
    };

    /**
     * 📌 GET /bookmarks - Get all bookmarks for a user
     */
    router.get('/bookmarks', async (req, res) => {
        const userId = req.query.user_id;

        if (!userId) return res.status(400).json({ error: 'Missing user_id' });

        try {
            const [rows] = await db.query(
                `SELECT
                    id,
                    user_id,
                    url,
                    title,
                    description,
                    author,
                    source_id AS 'source.id',
                    source_name AS 'source.name',
                    urlToImage,
                    content,
                    DATE_FORMAT(publishedAt, '%Y-%m-%dT%H:%i:%sZ') AS publishedAt,
                    category,
                    DATE_FORMAT(bookmarkedAt, '%Y-%m-%dT%H:%i:%sZ') AS bookmarkedAt
                FROM news_bookmarks
                WHERE user_id = ?
                ORDER BY bookmarkedAt DESC`,
                [userId]
            );
            res.json(rows);
        } catch (err) {
            console.error('GET /bookmarks error:', err);
            res.status(500).json({ error: 'Failed to fetch bookmarks' });
        }
    });

    /**
     * 📌 POST /bookmarks - Add a new bookmark
     */
    router.post('/bookmarks', async (req, res) => {
        const {
            user_id,
            url,
            title,
            description,
            author,
            source,
            urlToImage,
            content,
            publishedAt,
            category,
            bookmarkedAt,
        } = req.body;

        if (!user_id || !url) {
            return res.status(400).json({ error: 'Missing user_id or url' });
        }

        try {
            await db.query(
                `INSERT INTO news_bookmarks
                (user_id, url, title, description, author, source_id, source_name, urlToImage, content, publishedAt, category, bookmarkedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    user_id,
                    url,
                    title,
                    description,
                    author || null,
                    source?.id || null,
                    source?.name || null,
                    urlToImage || null,
                    content || null,
                    formatDateForMySQL(publishedAt),
                    category || 'General',
                    formatDateForMySQL(
                        bookmarkedAt || new Date().toISOString()
                    ),
                ]
            );

            res.json({ status: 'added' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res
                    .status(409)
                    .json({ error: 'Bookmark already exists' });
            }
            console.error('POST /bookmarks error:', err);
            return res.status(500).json({
                error: 'Failed to add bookmark',
                detail: err.message,
            });
        }
    });

    /**
     * 📌 DELETE /bookmarks - Delete a single bookmark
     */
    router.delete('/bookmarks', async (req, res) => {
        const { user_id, url } = req.query;

        if (!user_id || !url) {
            return res.status(400).json({ error: 'Missing user_id or url' });
        }

        try {
            const [result] = await db.query(
                'DELETE FROM news_bookmarks WHERE user_id = ? AND url = ?',
                [user_id, url]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Bookmark not found' });
            }

            res.json({ status: 'deleted' });
        } catch (err) {
            console.error('DELETE /bookmarks error:', err);
            res.status(500).json({ error: 'Failed to delete bookmark' });
        }
    });

    /**
     * 📌 DELETE /bookmarks/all - Delete all bookmarks for a user
     */
    router.delete('/bookmarks/all', async (req, res) => {
        const { user_id } = req.query;

        if (!user_id) {
            return res.status(400).json({ error: 'Missing user_id' });
        }

        try {
            const [result] = await db.query(
                'DELETE FROM news_bookmarks WHERE user_id = ?',
                [user_id]
            );

            res.json({
                status: 'cleared',
                deleted: result.affectedRows,
            });
        } catch (err) {
            console.error('DELETE /bookmarks/all error:', err);
            res.status(500).json({ error: 'Failed to delete all bookmarks' });
        }
    });

    return router;
};
