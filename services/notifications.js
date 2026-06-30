const Notification = require('../models/Notification');
const NotificationToken = require('../models/NotificationToken');
const Student = require('../models/Student');
const User = require('../models/User');
require('../config/testingEnv').applyTestingEnvDefaults();

let ioServer = null;
let firebaseAdmin = null;
let webPush = null;

function tryRequire(name) {
  try {
    return require(name);
  } catch (error) {
    return null;
  }
}

function initializePushProviders() {
  if (!firebaseAdmin) {
    const admin = tryRequire('firebase-admin');
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : '';

    if (admin && !admin.apps.length && projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      firebaseAdmin = admin;
    } else if (admin?.apps?.length) {
      firebaseAdmin = admin;
    }
  }

  if (!webPush) {
    const push = tryRequire('web-push');
    if (push && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      push.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      webPush = push;
    }
  }
}

function setNotificationSocket(io) {
  ioServer = io;
}

function serializeNotification(notification) {
  const plain = typeof notification.toObject === 'function' ? notification.toObject() : notification;
  return {
    ...plain,
    id: String(plain._id),
  };
}

function roleRoom(role) {
  return `role:${role}`;
}

function userRoom(userId) {
  return `user:${userId}`;
}

async function getRecipientUserIds(notification) {
  if (notification.recipientRole === 'admin') {
    if (notification.recipientId && notification.recipientModel === 'User') {
      return [String(notification.recipientId)];
    }
    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    return admins.map((admin) => String(admin._id));
  }

  if (notification.recipientModel === 'User' && notification.recipientId) {
    return [String(notification.recipientId)];
  }

  if (notification.recipientModel === 'Student' && notification.recipientId) {
    const employee = await Student.findById(notification.recipientId).select('email').lean();
    const user = employee?.email
      ? await User.findOne({ email: employee.email, role: 'employee' }).select('_id').lean()
      : null;
    return user ? [String(user._id)] : [];
  }

  return [];
}

async function countUnreadForUser(user) {
  if (!user) return 0;
  const employee = user.role === 'employee'
    ? await Student.findOne({ email: user.email }).select('_id').lean()
    : null;
  const access = buildAccessQuery(user, employee);
  return Notification.countDocuments({ ...access, isRead: false });
}

function buildAccessQuery(user, employee = null) {
  if (user.role === 'admin') {
    return {
      recipientRole: 'admin',
      $or: [{ recipientId: null }, { recipientId: user._id }],
    };
  }

  return {
    recipientRole: 'employee',
    $or: [
      { recipientModel: 'User', recipientId: user._id },
      ...(employee ? [{ recipientModel: 'Student', recipientId: employee._id }] : []),
    ],
  };
}

async function emitRealtime(notification) {
  if (!ioServer) return;
  const payload = serializeNotification(notification);
  ioServer.to(roleRoom(notification.recipientRole)).emit('notification:new', payload);
  const userIds = await getRecipientUserIds(notification);
  userIds.forEach((id) => ioServer.to(userRoom(id)).emit('notification:new', payload));
}

function emitUserEvent(userId, eventName, payload) {
  if (!ioServer) return;
  ioServer.to(userRoom(userId)).emit(eventName, payload);
}

function emitRoleEvent(role, eventName, payload) {
  if (!ioServer || !role) return;
  ioServer.to(roleRoom(role)).emit(eventName, payload);
}

async function emitEmployeeEvent(employeeId, eventName, payload) {
  if (!ioServer || !employeeId) return;
  const employee = await Student.findById(employeeId).select('_id email').lean();
  const users = await User.find({
    role: 'employee',
    $or: [
      { employeeProfile: employeeId },
      ...(employee?.email ? [{ email: employee.email }] : []),
    ],
  }).select('_id').lean();

  users.forEach((user) => ioServer.to(userRoom(user._id)).emit(eventName, payload));
}

async function deliverPush(notification) {
  initializePushProviders();
  const userIds = await getRecipientUserIds(notification);
  if (!userIds.length) return;

  const tokens = await NotificationToken.find({ userId: { $in: userIds } }).lean();
  const payload = {
    title: notification.title,
    body: notification.message,
    data: {
      notificationId: String(notification._id),
      type: notification.type,
      actionUrl: notification.actionUrl || '/',
    },
  };

  if (firebaseAdmin) {
    await Promise.allSettled(
      tokens
        .filter((token) => token.fcmToken)
        .map((token) =>
          firebaseAdmin.messaging().send({
            token: token.fcmToken,
            notification: { title: payload.title, body: payload.body },
            data: payload.data,
            webpush: { fcmOptions: { link: payload.data.actionUrl } },
          })
        )
    );
  }

  if (webPush) {
    await Promise.allSettled(
      tokens
        .filter((token) => token.webPushSubscription?.endpoint)
        .map((token) => webPush.sendNotification(token.webPushSubscription, JSON.stringify(payload)))
    );
  }
}

function normalizeNotification(input = {}) {
  const title = String(input.title || '').trim();
  const message = String(input.message || '').trim();
  if (!title || !message) {
    const error = new Error('Notification title and message are required.');
    error.status = 400;
    throw error;
  }

  return {
    recipientId: input.recipientId || null,
    recipientModel: input.recipientModel || (input.recipientId ? 'User' : 'User'),
    recipientRole: input.recipientRole || 'admin',
    senderId: input.senderId || null,
    senderModel: input.senderModel || 'User',
    senderRole: input.senderRole || 'system',
    title,
    message,
    type: input.type || 'General',
    priority: input.priority || 'normal',
    actionUrl: input.actionUrl || '',
    metadata: input.metadata || {},
  };
}

async function createNotification(input) {
  const notification = await Notification.create(normalizeNotification(input));
  await Promise.allSettled([emitRealtime(notification), deliverPush(notification)]);
  return notification;
}

async function notifyAdmins(input) {
  return createNotification({
    ...input,
    recipientRole: 'admin',
    recipientId: null,
    recipientModel: 'User',
  });
}

async function notifyEmployee(employee, input) {
  if (!employee?._id) return null;
  return createNotification({
    ...input,
    recipientId: employee._id,
    recipientModel: 'Student',
    recipientRole: 'employee',
  });
}

async function saveNotificationToken(user, body = {}, userAgent = '') {
  const fcmToken = String(body.fcmToken || '').trim();
  const webPushSubscription = body.webPushSubscription && body.webPushSubscription.endpoint
    ? body.webPushSubscription
    : null;

  if (!fcmToken && !webPushSubscription) {
    const error = new Error('A Firebase token or Web Push subscription is required.');
    error.status = 400;
    throw error;
  }

  const query = fcmToken
    ? { userId: user._id, fcmToken }
    : { userId: user._id, 'webPushSubscription.endpoint': webPushSubscription.endpoint };

  const update = {
      userId: user._id,
      role: user.role,
      userAgent: String(userAgent || '').slice(0, 500),
      lastSeenAt: new Date(),
    };

  if (fcmToken) {
    update.fcmToken = fcmToken;
  }

  if (webPushSubscription) {
    update.webPushSubscription = webPushSubscription;
  }

  return NotificationToken.findOneAndUpdate(
    query,
    update,
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

module.exports = {
  buildAccessQuery,
  countUnreadForUser,
  createNotification,
  notifyAdmins,
  notifyEmployee,
  roleRoom,
  saveNotificationToken,
  serializeNotification,
  setNotificationSocket,
  userRoom,
  emitEmployeeEvent,
  emitRoleEvent,
  emitUserEvent,
};
