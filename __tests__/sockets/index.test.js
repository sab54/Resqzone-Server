/**
 * sockets.index.test.js
 *
 * What This Test File Covers:
 *
 * 1. User Room Joining
 *    - "join_user_room" joins the expected room string.
 *
 * 2. Chat Room Join/Leave
 *    - "join_chat" adds room; "leave_chat" removes it.
 *
 * 3. Typing Broadcast
 *    - "chat:typing_start" and "chat:typing_stop" broadcast via io.to(room).emit with correct payload.
 *
 * 4. Invalid Inputs
 *    - Non-numeric IDs are ignored (no room join/leave).
 *    - Console warnings are emitted for invalid inputs.
 */

const socketsInit = require('../../sockets');

let warnSpy;

function makeFakeIO() {
  const io = {
    connectionHandler: null,
    toCalls: [],
    on(event, handler) {
      if (event === 'connection') this.connectionHandler = handler;
    },
    to(room) {
      const call = { room, emitted: [] };
      this.toCalls.push(call);
      return {
        emit: (event, payload) => call.emitted.push({ event, payload }),
      };
    },
  };
  return io;
}

function makeFakeSocket() {
  const handlers = new Map();
  const rooms = new Set();
  const socket = {
    id: 'sock-1',
    rooms,
    on(event, cb) {
      handlers.set(event, cb);
    },
    join(room) {
      rooms.add(room);
    },
    leave(room) {
      rooms.delete(room);
    },
    // test helpers to trigger server-side handlers
    trigger(event, payload) {
      const cb = handlers.get(event);
      if (cb) cb(payload);
    },
  };
  return socket;
}

let io;
let socket;

beforeAll(() => {
  // Silence console.warn during tests but allow expectation checks
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  if (warnSpy) warnSpy.mockRestore();
});

beforeEach(() => {
  io = makeFakeIO();
  socketsInit(io); // wires up io.on('connection', ...)
  socket = makeFakeSocket();
  // simulate a client connection
  io.connectionHandler(socket);
});

test('join_user_room joins correct user room', () => {
  socket.trigger('join_user_room', 42);
  expect(socket.rooms.has('user_42')).toBe(true);
});

test('join_chat adds room and leave_chat removes it', () => {
  socket.trigger('join_chat', 99);
  expect(socket.rooms.has('chat_99')).toBe(true);

  socket.trigger('leave_chat', 99);
  expect(socket.rooms.has('chat_99')).toBe(false);
});

test('typing events broadcast to chat room via io.to(...).emit', () => {
  // start typing
  socket.trigger('chat:typing_start', { chatId: 7, userId: 123 });
  // stop typing
  socket.trigger('chat:typing_stop', { chatId: 7, userId: 123 });

  // We should have two io.to calls, both for chat_7
  expect(io.toCalls.length).toBe(2);
  expect(io.toCalls[0].room).toBe('chat_7');
  expect(io.toCalls[0].emitted[0]).toEqual({
    event: 'chat:typing_start',
    payload: { chatId: 7, userId: 123 },
  });

  expect(io.toCalls[1].room).toBe('chat_7');
  expect(io.toCalls[1].emitted[0]).toEqual({
    event: 'chat:typing_stop',
    payload: { chatId: 7, userId: 123 },
  });
});

test('invalid inputs are ignored and warnings are emitted', () => {
  socket.trigger('join_user_room', 'bad');
  socket.trigger('join_chat', 'nope');
  socket.trigger('leave_chat', 'nope');

  // No rooms should have been joined
  expect([...socket.rooms]).toEqual([]);

  // Verify console.warn was called with expected messages
  expect(console.warn).toHaveBeenCalledWith(
    expect.stringContaining('Invalid userId for join_user_room'),
    'bad'
  );
  expect(console.warn).toHaveBeenCalledWith(
    expect.stringContaining('Invalid chatId for join_chat'),
    'nope'
  );
  expect(console.warn).toHaveBeenCalledWith(
    expect.stringContaining('Invalid chatId for leave_chat'),
    'nope'
  );
});
