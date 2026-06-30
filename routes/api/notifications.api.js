const express = require('express');

const Notification = require('../../models/Notification');
const Student = require('../../models/Student');
const {
  buildAccessQuery,
  createNotification,
  saveNotificationToken,
  serializeNotification,
} = require('../../services/notifications');

const router = express.Router();

const tabTypeMap = {
  attendance: ['Attendance', 'Login Reminder', 'Checkout'],
  leave: ['Leave Request', 'Leave Approved', 'Leave Rejected'],
  reports: ['Daily Report', 'Overtime'],
  system: ['System Alert', 'General'],
};

async function accessQueryFor(req) {
  const employee = req.user.role === 'employee'
    ? await Student.findOne({ email: req.user.email }).select('_id').lean()
    : null;
  return buildAccessQuery(req.user, employee);
}

function applyFilters(query, req) {
  const tab = String(req.query.tab || 'all').toLowerCase();
  if (tab === 'unread') {
    query.isRead = false;
  } else if (tabTypeMap[tab]) {
    query.type = { $in: tabTypeMap[tab] };
  }

  if (req.query.type) {
    query.type = req.query.type;
  }

  return query;
}

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 100);
    const query = applyFilters(await accessQueryFor(req), req);
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ ...(await accessQueryFor(req)), isRead: false }),
    ]);

    res.json({
      success: true,
      notifications: notifications.map(serializeNotification),
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/recent', async (req, res, next) => {
  try {
    const query = await accessQueryFor(req);
    const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(6).lean();
    res.json({ success: true, notifications: notifications.map(serializeNotification) });
  } catch (error) {
    next(error);
  }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    const query = await accessQueryFor(req);
    const unreadCount = await Notification.countDocuments({ ...query, isRead: false });
    res.json({ success: true, unreadCount });
  } catch (error) {
    next(error);
  }
});

router.post('/tokens', async (req, res, next) => {
  try {
    const token = await saveNotificationToken(req.user, req.body, req.get('user-agent'));
    res.status(201).json({ success: true, tokenId: token._id });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can send manual notifications.' });
    }

    const notification = await createNotification({
      recipientId: req.body.recipientId || null,
      recipientRole: req.body.recipientRole || 'admin',
      recipientModel: req.body.recipientModel || 'User',
      senderId: req.user._id,
      senderRole: 'admin',
      title: req.body.title,
      message: req.body.message,
      type: req.body.type || 'General',
      priority: req.body.priority || 'normal',
      actionUrl: req.body.actionUrl || '',
    });

    res.status(201).json({ success: true, notification: serializeNotification(notification) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const query = await accessQueryFor(req);
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...query },
      { isRead: true, readAt: new Date() },
      { returnDocument: 'after' }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification was not found.' });
    }

    res.json({ success: true, notification: serializeNotification(notification) });
  } catch (error) {
    next(error);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    const query = await accessQueryFor(req);
    const result = await Notification.updateMany({ ...query, isRead: false }, { isRead: true, readAt: new Date() });
    res.json({ success: true, modifiedCount: result.modifiedCount || 0 });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const query = await accessQueryFor(req);
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, ...query });
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification was not found.' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
