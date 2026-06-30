const mongoose = require('mongoose');
const { activityEventBaseSchema } = require('./activityEventBase');

const schema = activityEventBaseSchema({
  idleStartedAt: { type: Date, default: null, index: true },
  idleEndedAt: { type: Date, default: null, index: true },
});

module.exports = mongoose.model('IdleSession', schema);
