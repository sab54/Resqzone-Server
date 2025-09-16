/**
 * services/sockets/index.js
 *
 * This module configures and manages real-time WebSocket communication using Socket.IO.
 * It defines event listeners for user-specific and chat-related rooms, typing indicators,
 * and connection lifecycle events to facilitate interactive chat features.
 *
 * Key functionalities:
 * - **User Room Management**:
 *   - `join_user_room`: Allows a client to join a private room tied to their user ID.
 *     Ensures the `userId` is a valid number before joining `user_<userId>`.
 *
 * - **Chat Room Management**:
 *   - `join_chat`: Lets a socket join a specific chat room identified by `chatId`.
 *   - `leave_chat`: Lets a socket leave a chat room. Both validate that `chatId` is numeric.
 *
 * - **Typing Indicators**:
 *   - `chat:typing_start`: Broadcasts to all members of a chat room that a user has started typing.
 *   - `chat:typing_stop`: Broadcasts to all members of a chat room that a user has stopped typing.
 *   - Both events validate that `chatId` and `userId` are provided before broadcasting.
 *
 * - **Connection Lifecycle**:
 *   - Logs when a socket connects (with socket ID).
 *   - Logs when a socket disconnects, ensuring proper visibility into connection state changes.
 *
 * Error Handling & Validation:
 * - For `join_user_room`, `join_chat`, and `leave_chat`, invalid IDs (non-numeric) are ignored,
 *   and warnings are logged rather than throwing exceptions.
 *
 * Notes:
 * - This module does not handle authentication; it assumes the caller has already verified
 *   the socket’s identity and authorization to join the requested rooms.
 * - Room names are namespaced with `user_` or `chat_` prefixes to avoid collisions.
 *
 * Author: Sunidhi Abhange
 */

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: ${socket.id}`);

        // Join user-specific room
        socket.on('join_user_room', (userId) => {
            if (typeof userId !== 'number') {
                console.warn(`⚠️ Invalid userId for join_user_room:`, userId);
                return;
            }

            const room = `user_${userId}`;
            socket.join(room);
            console.log(`👤 Socket ${socket.id} joined user room ${room}`);
        });

        // Join a chat room
        socket.on('join_chat', (chatId) => {
            if (typeof chatId !== 'number') {
                console.warn(`⚠️ Invalid chatId for join_chat:`, chatId);
                return;
            }

            const room = `chat_${chatId}`;
            socket.join(room);
            console.log(`📥 Socket ${socket.id} joined room ${room}`);
        });

        // Leave a chat room
        socket.on('leave_chat', (chatId) => {
            if (typeof chatId !== 'number') {
                console.warn(`⚠️ Invalid chatId for leave_chat:`, chatId);
                return;
            }

            const room = `chat_${chatId}`;
            socket.leave(room);
            console.log(`📤 Socket ${socket.id} left room ${room}`);
        });

        // Typing indicator (Enhanced)
        socket.on('chat:typing_start', ({ chatId, userId }) => {
            if (!chatId || !userId) return;
            io.to(`chat_${chatId}`).emit('chat:typing_start', {
                chatId,
                userId,
            });
        });

        socket.on('chat:typing_stop', ({ chatId, userId }) => {
            if (!chatId || !userId) return;
            io.to(`chat_${chatId}`).emit('chat:typing_stop', {
                chatId,
                userId,
            });
        });

        // Disconnect
        socket.on('disconnect', () => {
            console.log(`❌ Socket disconnected: ${socket.id}`);
        });
    });
};
