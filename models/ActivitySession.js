const mongoose = require('mongoose');
const { activityEventBaseSchema } = require('./activityEventBase');

const schema = activityEventBaseSchema({
  startedAt: { type: Date, default: null, index: true },
  endedAt: { type: Date, default: null, index: true },
  activeMs: { type: Number, default: 0 },
  idleMs: { type: Number, default: 0 },
});

module.exports = mongoose.model('ActivitySession', schema);
