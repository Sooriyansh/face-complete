const mongoose = require('mongoose');
const { activityEventBaseSchema } = require('./activityEventBase');

const schema = activityEventBaseSchema({
  description: { type: String, default: '', trim: true },
});

module.exports = mongoose.model('TimelineLog', schema);
