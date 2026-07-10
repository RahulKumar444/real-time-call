const jwt = require('jsonwebtoken');

/**
 * In-memory room tracker.
 * Map<roomId, Set<{ socketId, userId, userName }>>
 */
const rooms = new Map();

/**
 * Register all Socket.io event handlers on the given io instance.
 * @param {import('socket.io').Server} io
 */
function registerSocketHandlers(io) {
  // --- Socket authentication middleware ------------------------------------
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: no token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { id: decoded.id, name: decoded.name, email: decoded.email };
      next();
    } catch (err) {
      return next(new Error('Authentication error: invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (${socket.user.name})`);

    // --- join-room --------------------------------------------------------
    socket.on('join-room', ({ roomId }) => {
      socket.join(roomId);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      const userEntry = {
        socketId: socket.id,
        userId: socket.user.id,
        userName: socket.user.name,
      };

      rooms.get(roomId).add(userEntry);

      // Send the full user list to everyone in the room
      io.to(roomId).emit('room-users', Array.from(rooms.get(roomId)));

      // Notify others that a new user joined
      socket.to(roomId).emit('user-joined', userEntry);
    });

    // --- leave-room -------------------------------------------------------
    socket.on('leave-room', ({ roomId }) => {
      handleLeaveRoom(socket, roomId);
    });

    // --- WebRTC signaling -------------------------------------------------
    socket.on('offer', ({ to, offer }) => {
      io.to(to).emit('offer', { from: socket.id, offer });
    });

    socket.on('answer', ({ to, answer }) => {
      io.to(to).emit('answer', { from: socket.id, answer });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    // --- Whiteboard -------------------------------------------------------
    socket.on('draw', ({ roomId, drawData }) => {
      socket.to(roomId).emit('draw', drawData);
    });

    socket.on('clear-whiteboard', ({ roomId }) => {
      socket.to(roomId).emit('clear-whiteboard');
    });

    // --- Chat -------------------------------------------------------------
    socket.on('chat-message', ({ roomId, message }) => {
      io.to(roomId).emit('chat-message', {
        from: socket.user.name,
        message,
        timestamp: new Date().toISOString(),
      });
    });

    // --- File sharing -----------------------------------------------------
    socket.on('file-shared', ({ roomId, fileData }) => {
      socket.to(roomId).emit('file-shared', fileData);
    });

    // --- Disconnect -------------------------------------------------------
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id} (${socket.user.name})`);

      // Clean up every room the user was in
      for (const [roomId, members] of rooms.entries()) {
        for (const member of members) {
          if (member.socketId === socket.id) {
            members.delete(member);

            socket.to(roomId).emit('user-left', {
              socketId: socket.id,
              userId: socket.user.id,
              userName: socket.user.name,
            });

            // Remove the room entirely if empty
            if (members.size === 0) {
              rooms.delete(roomId);
            }

            break; // socket can only appear once per room
          }
        }
      }
    });
  });
}

/**
 * Handle a user explicitly leaving a room.
 */
function handleLeaveRoom(socket, roomId) {
  socket.leave(roomId);

  const members = rooms.get(roomId);
  if (!members) return;

  for (const member of members) {
    if (member.socketId === socket.id) {
      members.delete(member);
      break;
    }
  }

  socket.to(roomId).emit('user-left', {
    socketId: socket.id,
    userId: socket.user.id,
    userName: socket.user.name,
  });

  if (members.size === 0) {
    rooms.delete(roomId);
  }
}

module.exports = { registerSocketHandlers };
