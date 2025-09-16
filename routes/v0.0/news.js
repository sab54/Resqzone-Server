// Server/src/routes/newsBookmarks.js
/**
 * newsBookmarks.js (News Bookmark Routes)
 *
 * Exposes REST endpoints to manage per-user news bookmarks.
 *
 * Middleware:
 * - express-prettify: pretty JSON output when `?pretty=true`.
 * - body-parser: urlencoded + JSON parsing.
 *
 * Helper:
 * - formatDateForMySQL(isoDate): Converts an ISO string to "YYYY-MM-DD HH:MM:SS" (MySQL DATETIME).
 *   Returns null if no date provided.
 *
 * Endpoints:
 * 1) GET /bookmarks?user_id=<id>
 *    - Lists all bookmarks for a user ordered by `bookmarkedAt` DESC.
 *    - 200: Array of bookmarks with normalized field names and ISO-like date strings.
 *    - 400: { error: 'Missing user_id' } if query param absent.
 *    - 500: { error: 'Failed to fetch bookmarks' } on DB error.
 *
 * 2) POST /bookmarks
 *    - Adds a bookmark. Body fields:
 *      { user_id, url, title, description, author?, source?: { id?, name? }, urlToImage?, content?, publishedAt?, category?, bookmarkedAt? }
 *    - Defaults: author=null, source fields=null, urlToImage=null, content=null, category='General',
 *      publishedAt -> formatted or null, bookmarkedAt -> provided or "now" (formatted).
 *    - 200: { status: 'added' } on success.
 *    - 400: { error: 'Missing user_id or url' } when required fields absent.
 *    - 409: { error: 'Bookmark already exists' } when MySQL ER_DUP_ENTRY thrown.
 *    - 500: { error: 'Failed to add bookmark', detail } on other DB errors.
 *
 * 3) DELETE /bookmarks?user_id=<id>&url=<url>
 *    - Deletes a single bookmark.
 *    - 200: { status: 'deleted' } on success.
 *    - 404: { message: 'Bookmark not found' } when no rows affected.
 *    - 400: { error: 'Missing user_id or url' } when parameters missing.
 *    - 500: { error: 'Failed to delete bookmark' } on DB error.
 *
 * 4) DELETE /bookmarks/all?user_id=<id>
 *    - Deletes all bookmarks for the given user.
 *    - 200: { status: 'cleared', deleted: <affectedRows> }.
 *    - 400: { error: 'Missing user_id' } when parameter missing.
 *    - 500: { error: 'Failed to delete all bookmarks' } on DB error.
 *
 * DB Contract:
 * - Expects `db.query(sql, params)` that resolves to `[rows]` or `[result]` with `affectedRows`.
 *
 * Author: Sunidhi Abhange
 */

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

    // GET /bookmarks - Get all bookmarks for a user
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

    // POST /bookmarks - Add a new bookmark
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

    // DELETE /bookmarks - Delete a single bookmark
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

    // DELETE /bookmarks/all - Delete all bookmarks for a user
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
