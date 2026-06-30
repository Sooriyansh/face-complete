const mongoose = require('mongoose');
const { activityEventBaseSchema } = require('./activityEventBase');

const schema = activityEventBaseSchema({
  networkState: { type: String, default: '', trim: true, index: true },
  interfaces: { type: [String], default: [] },
});

module.exports = mongoose.model('NetworkEvent', schema);
