const User = require('../models/User');
const { AUTH_COOKIE, parseCookies, verifyJwt } = require('../services/auth/auth.service');
const { roleRoom, setNotificationSocket, userRoom } = require('../services/notifications');

function secureTokenEquals(expected, actual) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && require('crypto').timingSafeEqual(expectedBuffer, actualBuffer);
}

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
      const collectorToken = String(process.env.SYSTEM_EVENTS_COLLECTOR_TOKEN || '').trim();
      const authToken = String(socket.handshake.auth?.collectorToken || socket.handshake.headers['x-collector-token'] || '').trim();
      if (secureTokenEquals(collectorToken, authToken)) {
        socket.user = {
          _id: `collector:${socket.handshake.auth?.agentId || socket.id}`,
          role: 'collector',
          name: socket.handshake.auth?.agentId || 'Windows Activity Agent',
        };
        socket.trustedCollector = true;
        return next();
      }

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
    if (socket.trustedCollector) {
      socket.join('collectors:system-events');
      socket.emit('collector:ready', {
        socketId: socket.id,
        recovered: socket.recovered === true,
      });
      socket.on('collector:heartbeat', (payload = {}, ack) => {
        const response = { ok: true, receivedAt: new Date().toISOString(), payloadId: payload.id || null };
        if (typeof ack === 'function') ack(response);
      });
      return;
    }

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
