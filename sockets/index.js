const User = require('../models/User');
const { AUTH_COOKIE, parseCookies, verifyJwt } = require('../services/auth/auth.service');
const { roleRoom, setNotificationSocket, userRoom } = require('../services/notifications');

function initializeSockets(server, app) {
  let Server;
  try {
    ({ Server } = require('socket.io'));
  } catch (error) {
    console.warn('Socket.IO is not installed. Real-time notifications are disabled.');
    return null;
  }

  const io = new Server(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || false,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const payload = verifyJwt(cookies[AUTH_COOKIE]);
      if (!payload?.id) {
        return next(new Error('Authentication is required.'));
      }

      const user = await User.findById(payload.id).select('_id role name email').lean();
      if (!user) {
        return next(new Error('User was not found.'));
      }

      socket.user = user;
      return next();
    } catch (error) {
      return next(new Error('Socket authentication failed.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(userRoom(socket.user._id));
    socket.join(roleRoom(socket.user.role));
    socket.emit('notification:ready', {
      userId: String(socket.user._id),
      role: socket.user.role,
    });
  });

  setNotificationSocket(io);

  // Make io accessible to API routes via app.locals
  if (app) {
    app.locals.io = io;
  }

  return io;
}

module.exports = { initializeSockets };
