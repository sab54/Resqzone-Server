// Server/src/routes/chat.js
/**
 * chat.js (Conversations, Members, Messages, Read Receipts, and Local Groups)
 *
 * REST endpoints powering 1:1 and group chats, membership changes, message flow,
 * read receipts, listing and discovery of local groups, and hard deletes.
 *
 * Middleware:
 * - body-parser: JSON + urlencoded parsing.
 *
 * Endpoints:
 * 1) GET /chat/list/:user_id
 *    - Returns all chats the user participates in with enrichment:
 *      • last message (content/sender/timestamp), members list (with role),
 *      • group metadata (radius, lat/lng), and `is_nearby` flag for 1:1 chats
 *        based on matching postal codes.
 *    - Emits `chat:list_update` to the user's room after computing payload.
 *    - 200: { success: true, data: [...] }
 *    - 400: { success: false, error: 'Invalid user_id' }
 *    - 404: { success: false, error: 'User not found' }
 *    - 500: { success: false, error: 'Failed to fetch chats' }
 *
 * 2) POST /chat/create
 *    - Creates a new direct or group chat. If direct and already exists, returns it.
 *    - Body: { user_id, participant_ids: number[], is_group=false, group_name=null }
 *    - Side effects:
 *      • Inserts chat, members (owner/member roles), and user_alerts for participants.
 *    - 201: { success: true, message, chat_id, chat: {..., members:[...] } }
 *    - 200: { success: true, message: 'Chat already exists', chat_id } (for direct)
 *    - 400 / 500 on validation / server errors.
 *
 * 3) POST /chat/:chat_id/add-members
 *    - Adds members to an existing group (INSERT IGNORE to avoid duplicates).
 *    - Body: { user_id, user_ids: number[] }
 *    - Inserts user_alerts for each added member (urgency='advisory').
 *    - Emits `chat:list_update:trigger` to each added member.
 *    - 200: { success: true, message, added_user_ids }
 *    - 400 / 500 on validation / server errors.
 *
 * 4) DELETE /chat/:chat_id/remove-member
 *    - Removes a member from a group; only owner can remove others.
 *    - Query: ?user_id=<removee>&requested_by=<ownerId>
 *    - If the group becomes empty afterwards, deletes messages, receipts, and the chat.
 *    - Emits `chat:list_update:trigger` to the removed user.
 *    - 200 / 400 (owner cannot remove self) / 403 (non-owner) / 500.
 *
 * 5) POST /chat/local-groups/join
 *    - Finds a nearby location-based group via Haversine distance; joins or creates one.
 *    - Body: { userId, latitude, longitude, hasAddress, address }
 *    - Inserts a 'moderate' system alert and emits list update.
 *    - 201 when a new group is created, 200 when joined, 400/500 on errors.
 *
 * 6) DELETE /chat/:chat_id
 *    - Hard-deletes a chat and its messages/members.
 *    - 200 on success, 400/500 on errors.
 *
 * 7) GET /chat/:chat_id/members
 *    - Lists chat members with display-ready mapping.
 *    - 200: { success: true, data: members[] }, 400/500 on errors.
 *
 * 8) GET /chat/:chat_id/messages
 *    - Paged ascending chronological message fetch.
 *    - Query: ?limit=&offset=
 *    - 200: { success: true, data: messages[] }, 400/500 on errors.
 *
 * 9) POST /chat/:chat_id/messages
 *    - Sends a message; supports message_type 'text' or 'location' (stores "{latitude:x,longitude:y}").
 *    - Emits `chat:new_message` to chat room and `chat:list_update:trigger` to sender room.
 *    - 201: { success: true, message: 'Message sent', message_id }
 *    - 400/500 on errors.
 *
 * 10) POST /chat/read
 *    - Upserts read receipts for a chat: { chat_id (via req.params—see route), user_id, message_id }.
 *      NOTE: The handler path is `/read` and reads `req.params.chat_id`.
 *    - Emits `chat:read_receipt` to the chat room.
 *    - 200 or 400/500 on errors.
 *
 * 11) GET /chat/:chat_id/read-receipts
 *    - Lists read receipts with user info.
 *    - 200: { success: true, data: [...] }, 400/500 on errors.
 *
 * Socket Rooms:
 * - Per-user:  user_<id>
 * - Per-chat:  chat_<id>
 *
 * DB Contract:
 * - Expects `db.query(sql, params)` resolving to `[rows]` or `[result]` with `insertId/affectedRows`.
 *
 * Author: Sunidhi Abhange
 */

const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

module.exports = (db, io) => {
    const router = express.Router({ caseSensitive: true });

    router.use(bodyParser.json());
    router.use(bodyParser.urlencoded({ extended: false }));

    // GET /chat/list/:user_id
    router.get('/list/:user_id', async (req, res) => {
        const userId = parseInt(req.params.user_id);
        if (isNaN(userId)) {
            return res
                .status(400)
                .json({ success: false, error: 'Invalid user_id' });
        }

        try {
            const [[currentUser]] = await db.query(
                `SELECT postal_code FROM users WHERE id = ? LIMIT 1`,
                [userId]
            );

            if (!currentUser) {
                return res
                    .status(404)
                    .json({ success: false, error: 'User not found' });
            }

            const userPostal = currentUser.postal_code || '';

            const [chats] = await db.query(
                `
                SELECT
                    c.id AS chat_id,
                    c.is_group,
                    c.name AS group_name,
                    c.created_by,
                    c.latitude,
                    c.longitude,
                    c.radius_km,
                    COALESCE(MAX(m.created_at), c.created_at) AS updated_at,
                    (
                        SELECT message FROM chat_messages
                        WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1
                    ) AS last_message,
                    (
                        SELECT sender_id FROM chat_messages
                        WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1
                    ) AS last_sender_id,
                    (
                        SELECT created_at FROM chat_messages
                        WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1
                    ) AS last_message_at
                FROM chats c
                JOIN chat_members cm ON cm.chat_id = c.id
                LEFT JOIN chat_messages m ON m.chat_id = c.id
                WHERE cm.user_id = ?
                GROUP BY c.id
                `,
                [userId]
            );

            const chatIds = chats.map((c) => c.chat_id);
            if (!chatIds.length) return res.json({ success: true, data: [] });

            // Step 2: Fetch all members
            const [members] = await db.query(
                `
                SELECT
                    cm.chat_id,
                    u.id,
                    u.first_name,
                    u.last_name,
                    u.profile_picture_url,
                    u.email,
                    u.postal_code,
                    cm.role
                FROM chat_members cm
                JOIN users u ON u.id = cm.user_id
                WHERE cm.chat_id IN (?)
                `,
                [chatIds]
            );

            // Step 3: Group members by chat
            const membersMap = {};
            for (const m of members) {
                if (!membersMap[m.chat_id]) membersMap[m.chat_id] = [];
                membersMap[m.chat_id].push({
                    id: m.id,
                    name: `${m.first_name} ${m.last_name || ''}`.trim(),
                    avatar: m.profile_picture_url,
                    email: m.email,
                    postal_code: m.postal_code,
                    role: m.role,
                });
            }

            // Step 4: Final enrich
            const enriched = chats.map((chat) => {
                const isGroup = !!chat.is_group;
                const chatMembers = membersMap[chat.chat_id] || [];

                const otherUser = !isGroup
                    ? chatMembers.find((u) => u.id !== userId)
                    : null;

                const lastSender = chatMembers.find(
                    (u) => u.id === chat.last_sender_id
                );

                const isNearby =
                    !isGroup && otherUser?.postal_code === userPostal;

                return {
                    id: chat.chat_id,
                    name: isGroup
                        ? chat.group_name || 'Unnamed Group'
                        : otherUser?.name || 'Direct Chat',
                    is_group: isGroup,
                    created_by: chat.created_by,
                    lastMessage: chat.last_message || '',
                    lastMessageAt: chat.last_message_at,
                    lastSender: lastSender
                        ? {
                              id: lastSender.id,
                              name: lastSender.name,
                              avatar: lastSender.profile_picture_url,
                          }
                        : null,
                    latitude: chat.latitude,
                    longitude: chat.longitude,
                    radius_km: chat.radius_km,
                    members: chatMembers,
                    is_nearby: isNearby,
                    updated_at: chat.updated_at,
                };
            });

            // Emit socket update
            if (io) {
                io.to(`user_${userId}`).emit('chat:list_update', enriched);
            }

            res.json({ success: true, data: enriched });
        } catch (error) {
            console.error(`GET /chat/list/${userId} failed:`, error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch chats',
            });
        }
    });

    // POST /chat/create
    router.post('/create', async (req, res) => {
        const {
            user_id,
            participant_ids,
            is_group = false,
            group_name = null,
        } = req.body;

        if (
            !user_id ||
            !Array.isArray(participant_ids) ||
            participant_ids.length === 0
        ) {
            return res.status(400).json({
                success: false,
                error: 'user_id and participant_ids are required',
            });
        }

        try {
            // Check if direct chat already exists
            if (!is_group && participant_ids.length === 1) {
                const otherId = participant_ids[0];
                const [existing] = await db.query(
                    `SELECT c.id FROM chats c
                 JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
                 JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
                 WHERE c.is_group = 0
                 GROUP BY c.id`,
                    [user_id, otherId]
                );
                if (existing.length > 0) {
                    return res.status(200).json({
                        success: true,
                        message: 'Chat already exists',
                        chat_id: existing[0].id,
                    });
                }
            }

            // Create new chat
            const [chatResult] = await db.query(
                `INSERT INTO chats (is_group, name, created_by) VALUES (?, ?, ?)`,
                [is_group, is_group ? group_name : null, user_id]
            );
            const chatId = chatResult.insertId;

            const allUserIds = [...new Set([user_id, ...participant_ids])];

            // Add chat members
            const memberValues = allUserIds
                .map(
                    (id) =>
                        `(${chatId}, ${id}, '${
                            id === user_id ? 'owner' : 'member'
                        }')`
                )
                .join(', ');
            await db.query(
                `INSERT INTO chat_members (chat_id, user_id, role) VALUES ${memberValues}`
            );

            // Insert user alerts
            const alertValues = participant_ids
                .map((id) => {
                    const title = is_group
                        ? `New group chat: ${group_name || 'Unnamed Group'}`
                        : 'New direct chat';
                    const message = is_group
                        ? `You were added to group "${
                              group_name || 'Unnamed Group'
                          }".`
                        : `You have a new direct chat with user ${user_id}.`;
                    return `(${id}, 'chat', ${chatId}, ${db.escape(
                        title
                    )}, ${db.escape(message)})`;
                })
                .join(', ');
            await db.query(
                `INSERT INTO user_alerts (user_id, type, related_id, title, message) VALUES ${alertValues}`
            );

            // Fetch full chat with members
            const [[chat]] = await db.query(
                `SELECT * FROM chats WHERE id = ?`,
                [chatId]
            );

            const [members] = await db.query(
                `SELECT cm.user_id, cm.role, u.first_name, u.last_name, u.email
             FROM chat_members cm
             JOIN users u ON u.id = cm.user_id
             WHERE cm.chat_id = ?`,
                [chatId]
            );

            // Determine 1-on-1 chat display name
            if (!chat.is_group) {
                const otherUser = members.find((m) => m.user_id !== user_id);
                chat.name = otherUser
                    ? `${otherUser.first_name} ${
                          otherUser.last_name || ''
                      }`.trim()
                    : 'Direct Chat';
            }

            return res.status(201).json({
                success: true,
                message: 'Chat created successfully',
                chat_id: chatId,
                chat: {
                    ...chat,
                    members,
                },
            });
        } catch (error) {
            console.error('POST /chat/create failed:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create chat',
            });
        }
    });

    // POST /chat/:chat_id/add-members
    router.post('/:chat_id/add-members', async (req, res) => {
        const chatId = parseInt(req.params.chat_id);
        const { user_id, user_ids } = req.body;

        if (
            !chatId ||
            !user_id ||
            !Array.isArray(user_ids) ||
            user_ids.length === 0
        ) {
            return res.status(400).json({
                success: false,
                error: 'chat_id, user_id, and user_ids are required',
            });
        }

        try {
            // Insert new members into chat_members
            const values = user_ids
                .map((uid) => `(${chatId}, ${uid}, 'member')`)
                .join(', ');

            await db.query(
                `INSERT IGNORE INTO chat_members (chat_id, user_id, role) VALUES ${values}`
            );

            // Use valid urgency level: 'advisory'
            const alerts = user_ids
                .map(
                    (uid) =>
                        `(${uid}, 'chat', ${chatId}, 'Added to Group', 'You were added to a group chat.', 'advisory', 'system')`
                )
                .join(', ');

            await db.query(
                `INSERT INTO user_alerts (user_id, type, related_id, title, message, urgency, source)
             VALUES ${alerts}`
            );

            // Notify users via socket
            if (io) {
                user_ids.forEach((uid) =>
                    io.to(`user_${uid}`).emit('chat:list_update:trigger')
                );
            }

            res.status(200).json({
                success: true,
                message: 'Members added to chat successfully',
                added_user_ids: user_ids,
            });
        } catch (error) {
            console.error(`POST /chat/${chatId}/add-members failed:`, error);
            res.status(500).json({
                success: false,
                error: 'Failed to add members to chat',
            });
        }
    });

    // DELETE /chat/:chat_id/remove-member
    router.delete('/:chat_id/remove-member', async (req, res) => {
        const chatId = parseInt(req.params.chat_id);
        const { user_id, requested_by } = req.query;

        console.log(req.params, user_id, requested_by, chatId);

        if (!chatId || !user_id || !requested_by) {
            return res.status(400).json({
                success: false,
                error: 'chat_id, user_id, and requested_by are required',
            });
        }

        try {
            const userId = parseInt(user_id);
            const requestedBy = parseInt(requested_by);

            // Step 1: Ensure requester is group owner
            const [[roleRow]] = await db.query(
                `SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ? LIMIT 1`,
                [chatId, requestedBy]
            );

            if (!roleRow || roleRow.role !== 'owner') {
                return res.status(403).json({
                    success: false,
                    error: 'Only the group owner can remove members',
                });
            }

            // Step 2: Prevent owner from removing themselves
            if (userId === requestedBy) {
                return res.status(400).json({
                    success: false,
                    error: 'Group owner cannot remove themselves',
                });
            }

            // Step 3: Remove the user from the group
            await db.query(
                `DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?`,
                [chatId, userId]
            );

            // Step 4: Check if any members are left
            const [remaining] = await db.query(
                `SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ?`,
                [chatId]
            );

            if (remaining[0].count === 0) {
                await db.query(`DELETE FROM chat_messages WHERE chat_id = ?`, [
                    chatId,
                ]);
                await db.query(
                    `DELETE FROM chat_read_receipts WHERE chat_id = ?`,
                    [chatId]
                );
                await db.query(`DELETE FROM chats WHERE id = ?`, [chatId]);

                return res.status(200).json({
                    success: true,
                    message: `User ${userId} removed and empty group deleted (chat ${chatId})`,
                });
            }

            // Step 5: Notify removed user
            if (io) {
                io.to(`user_${userId}`).emit('chat:list_update:trigger');
            }

            return res.status(200).json({
                success: true,
                message: `User ${userId} removed from chat ${chatId}`,
            });
        } catch (error) {
            console.error(
                `DELETE /chat/${chatId}/remove-member failed:`,
                error
            );
            return res.status(500).json({
                success: false,
                error: 'Failed to remove user from chat',
            });
        }
    });

    // POST /chat/local-groups/join
    const RADIUS_KM = 0.2; // Default radius for local groups
    router.post('/local-groups/join', async (req, res) => {
        const { userId, latitude, longitude, hasAddress, address } = req.body;

        if (!userId || !latitude || !longitude || !address) {
            return res.status(400).json({
                success: false,
                error: 'userId, latitude, and longitude are required',
            });
        }

        try {
            const lat = parseFloat(latitude);
            const lon = parseFloat(longitude);

            // Step 1: Find nearby existing local group using Haversine formula
            const [rows] = await db.query(
                `
            SELECT id, name, latitude, longitude, radius_km,
                   (6371 * acos(
                       cos(radians(?)) * cos(radians(latitude)) *
                       cos(radians(longitude) - radians(?)) +
                       sin(radians(?)) * sin(radians(latitude))
                   )) AS distance_km
            FROM chats
            WHERE is_group = 1
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND radius_km IS NOT NULL
            HAVING distance_km <= radius_km
            ORDER BY distance_km ASC
            LIMIT 1
            `,
                [lat, lon, lat]
            );

            let chatId;
            let isNew = false;

            if (rows.length > 0) {
                // Join existing nearby group
                chatId = rows[0].id;
                await db.query(
                    `INSERT IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, 'member')`,
                    [chatId, userId]
                );
            } else {
                // Create new group with lat/lon and radius
                var groupName = '';
                if (!hasAddress) {
                    groupName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
                } else {
                    groupName = address.street
                        ? `${address.street}`
                        : `${address.city}`;

                    console.log('groupName: ', groupName);
                }

                const [result] = await db.query(
                    `INSERT INTO chats (is_group, name, latitude, longitude, radius_km, created_by)
                    VALUES (1, ?, ?, ?, ?, ?)`,
                    [groupName, lat, lon, RADIUS_KM, userId]
                );
                chatId = result.insertId;
                isNew = true;

                await db.query(
                    `INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, 'owner')`,
                    [chatId, userId]
                );
            }

            // Notify user via alert
            const alertTitle = isNew
                ? 'New Local Group Created'
                : 'Joined Nearby Local Group';
            const alertMessage = isNew
                ? `You've created a new local group at your location.`
                : `You've joined a local group near your location.`;

            await db.query(
                `INSERT INTO user_alerts (user_id, type, related_id, title, message, urgency, source)
             VALUES (?, 'chat', ?, ?, ?, 'moderate', 'system')`,
                [userId, chatId, alertTitle, alertMessage]
            );

            // Trigger UI update
            if (io) {
                io.to(`user_${userId}`).emit('chat:list_update:trigger');
            }

            return res.status(isNew ? 201 : 200).json({
                success: true,
                message: isNew
                    ? 'Local group created and joined'
                    : 'Joined existing nearby local group',
                chat_id: chatId,
            });
        } catch (error) {
            console.error('/local-groups/join failed:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to join local group',
            });
        }
    });

    // DELETE /chat/:chat_id
    router.delete('/:chat_id', async (req, res) => {
        const chatId = parseInt(req.params.chat_id);
        if (isNaN(chatId))
            return res.status(400).json({ error: 'Invalid chat ID' });

        try {
            await db.query(`DELETE FROM chat_messages WHERE chat_id = ?`, [
                chatId,
            ]);
            await db.query(`DELETE FROM chat_members WHERE chat_id = ?`, [
                chatId,
            ]);
            await db.query(`DELETE FROM chats WHERE id = ?`, [chatId]);

            res.status(200).json({
                success: true,
                message: 'Chat deleted successfully',
            });
        } catch (error) {
            console.error(`DELETE /chat/${chatId} failed:`, error);
            res.status(500).json({ error: 'Failed to delete chat' });
        }
    });

    // GET /chat/:chat_id/members
    router.get('/:chat_id/members', async (req, res) => {
        const chatId = parseInt(req.params.chat_id);
        if (isNaN(chatId))
            return res
                .status(400)
                .json({ success: false, error: 'Invalid chat_id' });

        try {
            const [rows] = await db.query(
                `SELECT u.id, u.first_name, u.last_name, u.email, u.profile_picture_url, cm.role
                 FROM chat_members cm
                 JOIN users u ON cm.user_id = u.id
                 WHERE cm.chat_id = ?`,
                [chatId]
            );

            const members = rows.map((user) => ({
                id: user.id,
                name: `${user.first_name} ${user.last_name || ''}`.trim(),
                email: user.email,
                avatar: user.profile_picture_url,
                role: user.role,
            }));

            res.json({ success: true, data: members });
        } catch (error) {
            console.error(`GET /chat/${chatId}/members failed:`, error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch members',
            });
        }
    });

    // GET /chat/:chat_id/messages
    router.get('/:chat_id/messages', async (req, res) => {
        const chatId = parseInt(req.params.chat_id);
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        if (isNaN(chatId))
            return res
                .status(400)
                .json({ success: false, error: 'Invalid chat_id' });

        try {
            const [rows] = await db.query(
                `SELECT m.id, m.chat_id, m.sender_id, u.first_name, u.last_name,
                        m.message AS content, m.message_type, m.created_at
                 FROM chat_messages m
                 LEFT JOIN users u ON m.sender_id = u.id
                 WHERE m.chat_id = ?
                 ORDER BY m.created_at ASC
                 LIMIT ? OFFSET ?`,
                [chatId, limit, offset]
            );

            const messages = rows.map((msg) => ({
                id: msg.id,
                chat_id: msg.chat_id,
                sender: {
                    id: msg.sender_id,
                    name: `${msg.first_name || ''} ${
                        msg.last_name || ''
                    }`.trim(),
                },
                content: msg.content,
                message_type: msg.message_type,
                timestamp: msg.created_at,
            }));

            res.json({ success: true, data: messages });
        } catch (error) {
            console.error(`GET /chat/${chatId}/messages failed:`, error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch messages',
            });
        }
    });

    // POST /chat/:chat_id/messages
    router.post('/:chat_id/messages', async (req, res) => {
        const chatId = parseInt(req.params.chat_id);
        const { sender_id, message, message_type = 'text' } = req.body;

        if (!sender_id || !message) {
            return res.status(400).json({
                success: false,
                error: 'sender_id and message are required',
            });
        }

        try {
            let messageContent = message;
            let locationData = null;

            // If the message type is "location", extract the latitude and longitude from message
            if (message_type === 'location' && message.location) {
                const { latitude, longitude } = message.location;

                if (latitude && longitude) {
                    locationData = { latitude, longitude };
                    messageContent = `{latitude:${latitude},longitude:${longitude}}`;
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'Location data is incomplete',
                    });
                }
            }

            // Insert the message into the database
            const [result] = await db.query(
                `INSERT INTO chat_messages (chat_id, sender_id, message, message_type)
                VALUES (?, ?, ?, ?)`,
                [chatId, sender_id, messageContent, message_type]
            );

            const [senderRows] = await db.query(
                `SELECT first_name, last_name FROM users WHERE id = ?`,
                [sender_id]
            );

            const senderName = senderRows.length
                ? `${senderRows[0].first_name} ${
                      senderRows[0].last_name || ''
                  }`.trim()
                : 'Unknown';

            const newMessage = {
                id: result.insertId,
                chat_id: chatId,
                sender: { id: sender_id, name: senderName },
                content: messageContent,
                message_type,
                timestamp: new Date().toISOString(),
            };

            if (io) {
                io.to(`chat_${chatId}`).emit('chat:new_message', newMessage);
                io.to(`user_${sender_id}`).emit('chat:list_update:trigger');
            } else {
                console.warn(
                    '⚠️ io not available in POST /chat/:chat_id/messages'
                );
            }

            res.status(201).json({
                success: true,
                message: 'Message sent',
                message_id: result.insertId,
            });
        } catch (error) {
            console.error(`POST /chat/${chatId}/messages failed:`, error);
            res.status(500).json({
                success: false,
                error: 'Failed to send message',
            });
        }
    });

    // POST /chat/:chat_id/read
    router.post('/read', async (req, res) => {
        const chatId = parseInt(req.params.chat_id);
        const { user_id, message_id } = req.body;

        if (!chatId || !user_id || !message_id) {
            return res.status(400).json({
                success: false,
                error: 'chat_id, user_id, and message_id are required',
            });
        }

        try {
            await db.query(
                `
            INSERT INTO chat_read_receipts (chat_id, user_id, message_id, read_at)
            VALUES (?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE message_id = VALUES(message_id), read_at = NOW()
            `,
                [chatId, user_id, message_id]
            );

            if (io) {
                io.to(`chat_${chatId}`).emit('chat:read_receipt', {
                    chat_id: chatId,
                    user_id,
                    message_id,
                    read_at: new Date().toISOString(),
                });
            }

            res.status(200).json({
                success: true,
                message: 'Read receipt updated',
            });
        } catch (error) {
            console.error(`POST /chat/read failed:`, error);
            res.status(500).json({
                success: false,
                error: 'Failed to update read receipt',
            });
        }
    });

    // GET /chat/:chat_id/read-receipts
    router.get('/:chat_id/read-receipts', async (req, res) => {
        const chatId = parseInt(req.params.chat_id);
        if (isNaN(chatId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid chat_id',
            });
        }

        try {
            const [rows] = await db.query(
                `
            SELECT rr.user_id, rr.message_id, rr.read_at,
                   u.first_name, u.last_name, u.profile_picture_url
            FROM chat_read_receipts rr
            JOIN users u ON u.id = rr.user_id
            WHERE rr.chat_id = ?
            `,
                [chatId]
            );

            const receipts = rows.map((r) => ({
                user_id: r.user_id,
                message_id: r.message_id,
                read_at: r.read_at,
                name: `${r.first_name} ${r.last_name || ''}`.trim(),
                avatar: r.profile_picture_url,
            }));

            res.json({ success: true, data: receipts });
        } catch (error) {
            console.error(`GET /chat/${chatId}/read-receipts failed:`, error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch read receipts',
            });
        }
    });

    return router;
};
