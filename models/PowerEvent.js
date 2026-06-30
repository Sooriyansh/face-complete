const mongoose = require('mongoose');
const { activityEventBaseSchema } = require('./activityEventBase');

const schema = activityEventBaseSchema({
  powerState: { type: String, default: '', trim: true, index: true },
});

module.exports = mongoose.model('PowerEvent', schema);
