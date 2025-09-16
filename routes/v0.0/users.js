// Server/src/routes/user.js
/**
 * user.js (User & Contact Routes)
 *
 * This Express router exposes user-facing endpoints for profile lookup, search suggestions,
 * registration and OTP login, basic geo-IP context, location updates, and CRUD-style
 * emergency contact management.
 *
 * Middlewares:
 * - express-prettify: optional pretty-printing when `?pretty=true` is supplied.
 * - body-parser: urlencoded + JSON body parsing for form and API clients.
 *
 * Endpoints:
 * 1) GET /user
 *    - If `?token=<string>` is provided: fetches a single user profile by token.
 *      • 200: { user, location } on success
 *      • 401: { error: 'Token is incorrect' } when no user matches
 *    - If no token: returns caller's IP + geo-lookup only.
 *      • 200: { ip, geoData }
 *    - Errors: 500 with { error: 'Failed to process request' } on DB failures.
 *
 * 2) GET /user/suggestions?search=<term>
 *    - Finds up to 5 recently created, active users matching the search term across
 *      name, email, phone, and location fields.
 *      • 200: { success: true, data: <mapped user summaries> }
 *      • 500: { success: false, error: 'Failed to fetch users' } on DB failures.
 *
 * 3) POST /user/register
 *    - Registers a new user (first_name, email, phone_number, country_code required).
 *      • De-dupes by (phone_number, country_code) OR email.
 *      • Enriches city/state/country/lat/long from geo-IP when not supplied.
 *      • Creates an OTP record (6-digit code, 5-minute expiry).
 *      • 200: { success: true, user_id, message }
 *      • 409: { success: false, message: 'User already exists' }
 *      • 400 / 500 on validation or server errors.
 *
 * 4) POST /user/request-otp
 *    - Issues a new OTP for an existing user; invalidates unused prior OTPs.
 *      • 200: { success: true, user_id, message, otp_code }
 *      • 404: { success: false, message: 'User not found' }
 *      • 400 / 500 on validation or server errors.
 *
 * 5) POST /user/verify-otp
 *    - Verifies a valid (non-expired, not already used) OTP and marks the user’s
 *      phone as verified.
 *      • 200: { success: true, message: 'OTP verified', user }
 *      • 401: { success: false, message: 'Invalid or expired OTP' }
 *      • 429: { success: false, message: 'Too many attempts' }
 *      • 400 / 500 on validation or server errors.
 *
 * 6) PATCH /user/:userId/location
 *    - Updates a user’s latitude/longitude.
 *      • 200: { success: true, message: 'User location updated' }
 *      • 400 / 500 on validation or server errors.
 *
 * 7) GET /user/emergency-contacts/:userId
 *    - Lists non-deleted emergency contacts for the user, newest first.
 *      • 200: { success: true, data: [...] }
 *      • 400 / 500 on validation or server errors.
 *
 * 8) POST /user/emergency-contacts
 *    - Adds an emergency contact if not present; restores if previously soft-deleted.
 *      • 200: { success: true, message: 'Emergency contact added' | 'Emergency contact restored' }
 *      • 409: { success: false, message: 'Contact already exists' } if active duplicate
 *      • 400 / 500 on validation or server errors.
 *
 * 9) DELETE /user/emergency-contacts/:id
 *    - Soft-deletes a contact (sets deleted_at).
 *      • 200: { success: true, message: 'Emergency contact deleted' }
 *      • 400 / 500 on validation or server errors.
 *
 * Implementation Notes:
 * - IP Derivation: prioritizes 'x-forwarded-for' then connection/socket addresses.
 * - Geo: Uses `geoip-lite.lookup(ip)`; fields may be undefined depending on IP.
 * - DB Layer: expects a `db.query(sql, params)` with [rows] semantics.
 * - Security: OTP values are logged to the server console for dev/testing; in production,
 *   use a secure channel (e.g., SMS provider) and remove logs.
 *
 * Author: Sunidhi Abhange
 */

const express = require('express');
const bodyParser = require('body-parser');
const geoip = require('geoip-lite');
const pretty = require('express-prettify');

module.exports = (db) => {
    const router = express.Router({ caseSensitive: true });

    router.use(pretty({ query: 'pretty' }));
    router.use(bodyParser.urlencoded({ extended: false }));
    router.use(bodyParser.json());

    // GET /user - By token or IP
    router.get('/', async (req, res) => {
        const getToken = req.query.token;
        const ip =
            (req.headers['x-forwarded-for'] || '').split(',').pop().trim() ||
            req.connection.remoteAddress ||
            req.socket?.remoteAddress;
        const geodata = geoip.lookup(ip);
        const info = { ip, geoData: geodata };

        try {
            if (getToken) {
                const [rows] = await db.query(
                    'SELECT first_name, last_name, email, phone_number, profile_picture_url, country_code, role, city, state, country, latitude, longitude FROM users WHERE token = ? LIMIT 1',
                    [getToken]
                );
                if (rows.length === 0) {
                    return res
                        .status(401)
                        .json({ error: 'Token is incorrect' });
                }
                return res.json({ user: rows[0], location: info });
            } else {
                return res.json(info);
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to process request' });
        }
    });

    // GET /chat/suggestions?q=search_term — Search active users
    router.get('/suggestions', async (req, res) => {
        const search =
            typeof req.query.search === 'string'
                ? req.query.search.trim().toLowerCase()
                : '';

        try {
            let baseQuery = `
                SELECT * FROM users
                WHERE is_active = 1
            `;

            const params = [];

            if (search) {
                baseQuery += `
                    AND (
                        LOWER(first_name) LIKE ? OR
                        LOWER(last_name) LIKE ? OR
                        LOWER(CONCAT(first_name, ' ', last_name)) LIKE ? OR
                        LOWER(email) LIKE ? OR
                        phone_number LIKE ? OR
                        LOWER(city) LIKE ? OR
                        LOWER(state) LIKE ? OR
                        LOWER(postal_code) LIKE ? OR
                        LOWER(country) LIKE ?
                    )
                `;
                const like = `%${search}%`;
                params.push(
                    like,
                    like,
                    like,
                    like,
                    like,
                    like,
                    like,
                    like,
                    like
                );
            }

            baseQuery += ` ORDER BY created_at DESC LIMIT 5`;

            const [rows] = await db.query(baseQuery, params);

            const users = rows.map((user) => ({
                id: user.id,
                name: `${user.first_name} ${user.last_name || ''}`.trim(),
                email: user.email,
                phone_number: user.phone_number,
                profile_picture_url: user.profile_picture_url,
                date_of_birth: user.date_of_birth,
                gender: user.gender,
                address_line1: user.address_line1,
                address_line2: user.address_line2,
                city: user.city,
                state: user.state,
                postal_code: user.postal_code,
                country: user.country,
                latitude: user.latitude,
                longitude: user.longitude,
                role: user.role,
                is_phone_verified: !!user.is_phone_verified,
                created_at: user.created_at,
                updated_at: user.updated_at,
            }));

            res.json({ success: true, data: users });
        } catch (error) {
            console.error('GET /chat/suggestions error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch users',
            });
        }
    });

    // POST /register
    router.post('/register', async (req, res) => {
        const {
            first_name,
            last_name,
            email,
            phone_number,
            country_code = '+44',
            city,
            state,
            country,
            latitude,
            longitude,
        } = req.body;

        if (!first_name || !email || !phone_number || !country_code) {
            return res
                .status(400)
                .json({ success: false, message: 'Missing required fields' });
        }

        try {
            const [existing] = await db.query(
                'SELECT id FROM users WHERE phone_number = ? AND country_code = ? OR email = ?',
                [phone_number, country_code, email]
            );
            if (existing.length > 0) {
                return res
                    .status(409)
                    .json({ success: false, message: 'User already exists' });
            }

            const getIP =
                req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            const geo = geoip.lookup(getIP);

            const [insertResult] = await db.query(
                `INSERT INTO users (first_name, last_name, email, phone_number, country_code, city, state, country, latitude, longitude)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    first_name.trim(),
                    last_name?.trim() || null,
                    email.trim().toLowerCase(),
                    phone_number.trim(),
                    country_code.trim(),
                    city || geo?.city || null,
                    state || geo?.region || null,
                    country || geo?.country || null,
                    latitude || geo?.ll?.[0] || null,
                    longitude || geo?.ll?.[1] || null,
                ]
            );

            const otp_code = Math.floor(
                100000 + Math.random() * 900000
            ).toString();
            const expires_at = new Date(Date.now() + 5 * 60 * 1000);
            const ip = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'] || '';

            await db.query(
                `INSERT INTO otp_logins (user_id, otp_code, expires_at, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?)`,
                [insertResult.insertId, otp_code, expires_at, ip, userAgent]
            );

            console.log(`OTP for user ${insertResult.insertId}:`, otp_code);

            return res.status(200).json({
                success: true,
                message: 'User registered successfully',
                user_id: insertResult.insertId,
            });
        } catch (err) {
            console.error(err);
            return res
                .status(500)
                .json({ success: false, message: 'Server error' });
        }
    });

    // POST /request-otp - Generate OTP for existing user and invalidate previous
    router.post('/request-otp', async (req, res) => {
        const { phone_number, country_code = '+44' } = req.body;

        if (!phone_number) {
            return res
                .status(400)
                .json({ success: false, message: 'Phone number required' });
        }

        try {
            const [users] = await db.query(
                'SELECT id FROM users WHERE phone_number = ? AND country_code = ?',
                [phone_number, country_code]
            );

            if (users.length === 0) {
                return res
                    .status(404)
                    .json({ success: false, message: 'User not found' });
            }

            const user_id = users[0].id;

            await db.query(
                `UPDATE otp_logins SET is_used = TRUE WHERE user_id = ? AND is_used = FALSE`,
                [user_id]
            );

            const otp_code = Math.floor(
                100000 + Math.random() * 900000
            ).toString();
            const expires_at = new Date(Date.now() + 5 * 60 * 1000);
            const ip = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'] || '';

            await db.query(
                `INSERT INTO otp_logins (user_id, otp_code, expires_at, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?)`,
                [user_id, otp_code, expires_at, ip, userAgent]
            );

            console.log(`New OTP for user ${user_id}:`, otp_code);

            return res.json({
                success: true,
                message: 'OTP sent successfully',
                user_id,
                otp_code,
            });
        } catch (err) {
            console.error(err);
            return res
                .status(500)
                .json({ success: false, message: 'OTP generation failed' });
        }
    });

    // POST /verify-otp - Validate OTP and return user
    router.post('/verify-otp', async (req, res) => {
        const { user_id, otp_code } = req.body;

        if (!user_id || !otp_code) {
            return res.status(400).json({
                success: false,
                message: 'Missing user_id or otp_code',
            });
        }

        try {
            const now = new Date();
            const [results] = await db.query(
                `SELECT * FROM otp_logins
                WHERE user_id = ? AND otp_code = ? AND is_used = FALSE AND expires_at > ?
                ORDER BY created_at DESC LIMIT 1`,
                [user_id, otp_code, now]
            );

            if (results.length === 0) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired OTP',
                });
            }

            const otp = results[0];
            if (otp.attempts >= otp.max_attempts) {
                return res
                    .status(429)
                    .json({ success: false, message: 'Too many attempts' });
            }

            await db.query(
                `UPDATE otp_logins SET is_used = TRUE, attempts = attempts + 1 WHERE id = ?`,
                [otp.id]
            );
            await db.query(
                `UPDATE users SET is_phone_verified = TRUE WHERE id = ?`,
                [user_id]
            );

            const [userResults] = await db.query(
                `SELECT * FROM users WHERE id = ?`,
                [user_id]
            );

            return res.json({
                success: true,
                message: 'OTP verified',
                user: userResults[0],
            });
        } catch (err) {
            console.error(err);
            return res
                .status(500)
                .json({ success: false, message: 'OTP verification failed' });
        }
    });

    // PATCH /user/:userId/location - Update user's location
    router.patch('/:userId/location', async (req, res) => {
        const userId = parseInt(req.params.userId);
        const { latitude, longitude } = req.body;

        if (isNaN(userId) || latitude == null || longitude == null) {
            return res
                .status(400)
                .json({ success: false, message: 'Invalid input' });
        }

        try {
            await db.query(
                `UPDATE users SET latitude = ?, longitude = ? WHERE id = ?`,
                [latitude, longitude, userId]
            );
            res.json({ success: true, message: 'User location updated' });
        } catch (err) {
            console.error('PATCH /user/:id/location error:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update location',
            });
        }
    });

    // Emergency Contact Routes
    router.get('/emergency-contacts/:userId', async (req, res) => {
        const userId = parseInt(req.params.userId);
        if (isNaN(userId)) {
            return res
                .status(400)
                .json({ success: false, message: 'Invalid user ID' });
        }

        try {
            const [rows] = await db.query(
                'SELECT id, name, phone_number, created_at FROM emergency_contacts WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
                [userId]
            );
            res.json({ success: true, data: rows });
        } catch (err) {
            console.error('GET /emergency-contacts error:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch contacts',
            });
        }
    });

    router.post('/emergency-contacts', async (req, res) => {
        const { user_id, name, phone_number } = req.body;

        if (!user_id || !name || !phone_number) {
            return res
                .status(400)
                .json({ success: false, message: 'Missing required fields' });
        }

        try {
            // Check for an existing *active* contact
            const [existingActive] = await db.query(
                'SELECT id FROM emergency_contacts WHERE user_id = ? AND phone_number = ? AND deleted_at IS NULL',
                [user_id, phone_number]
            );

            if (existingActive.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Contact already exists',
                });
            }

            // Check if the contact exists but was soft-deleted
            const [existingDeleted] = await db.query(
                'SELECT id FROM emergency_contacts WHERE user_id = ? AND phone_number = ? AND deleted_at IS NOT NULL',
                [user_id, phone_number]
            );

            if (existingDeleted.length > 0) {
                // Restore soft-deleted contact
                await db.query(
                    'UPDATE emergency_contacts SET deleted_at = NULL, name = ? WHERE id = ?',
                    [name.trim(), existingDeleted[0].id]
                );

                return res.json({
                    success: true,
                    message: 'Emergency contact restored',
                });
            }

            // Otherwise, insert a new contact
            await db.query(
                'INSERT INTO emergency_contacts (user_id, name, phone_number) VALUES (?, ?, ?)',
                [user_id, name.trim(), phone_number.trim()]
            );

            res.json({ success: true, message: 'Emergency contact added' });
        } catch (err) {
            console.error('POST /emergency-contacts error:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to add contact',
            });
        }
    });

    router.delete('/emergency-contacts/:id', async (req, res) => {
        const contactId = parseInt(req.params.id);
        if (isNaN(contactId)) {
            return res
                .status(400)
                .json({ success: false, message: 'Invalid contact ID' });
        }

        try {
            await db.query(
                'UPDATE emergency_contacts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
                [contactId]
            );
            res.json({ success: true, message: 'Emergency contact deleted' });
        } catch (err) {
            console.error('DELETE /emergency-contacts error:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to delete contact',
            });
        }
    });

    return router;
};
