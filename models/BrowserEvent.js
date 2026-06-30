const mongoose = require('mongoose');
const { activityEventBaseSchema } = require('./activityEventBase');

const schema = activityEventBaseSchema({
  url: { type: String, default: '', trim: true },
  title: { type: String, default: '', trim: true },
  processName: { type: String, default: '', trim: true },
});

module.exports = mongoose.model('BrowserEvent', schema);
