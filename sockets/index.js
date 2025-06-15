module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: ${socket.id}`);

        // ✅ Join user-specific room
        socket.on('join_user_room', (userId) => {
            if (typeof userId !== 'number') {
                console.warn(`⚠️ Invalid userId for join_user_room:`, userId);
                return;
            }

            const room = `user_${userId}`;
            socket.join(room);
            console.log(`👤 Socket ${socket.id} joined user room ${room}`);
        });

        // ✅ Join a chat room
        socket.on('join_chat', (chatId) => {
            if (typeof chatId !== 'number') {
                console.warn(`⚠️ Invalid chatId for join_chat:`, chatId);
                return;
            }

            const room = `chat_${chatId}`;
            socket.join(room);
            console.log(`📥 Socket ${socket.id} joined room ${room}`);
        });

        // ✅ Leave a chat room
        socket.on('leave_chat', (chatId) => {
            if (typeof chatId !== 'number') {
                console.warn(`⚠️ Invalid chatId for leave_chat:`, chatId);
                return;
            }

            const room = `chat_${chatId}`;
            socket.leave(room);
            console.log(`📤 Socket ${socket.id} left room ${room}`);
        });

        // ✍️ Typing indicator (Enhanced)
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

        // ❌ Disconnect
        socket.on('disconnect', () => {
            console.log(`❌ Socket disconnected: ${socket.id}`);
        });
    });
};
