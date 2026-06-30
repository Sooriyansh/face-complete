const mongoose = require('mongoose');
const { activityEventBaseSchema } = require('./activityEventBase');

const schema = activityEventBaseSchema({
  activeStartedAt: { type: Date, default: null, index: true },
  activeEndedAt: { type: Date, default: null, index: true },
});

module.exports = mongoose.model('ActiveSession', schema);
