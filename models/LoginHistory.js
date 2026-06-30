const mongoose = require('mongoose');
const { activityEventBaseSchema } = require('./activityEventBase');

const schema = activityEventBaseSchema({
  accountName: { type: String, default: '', trim: true },
  logonType: { type: String, default: '', trim: true },
});

module.exports = mongoose.model('LoginHistory', schema);
