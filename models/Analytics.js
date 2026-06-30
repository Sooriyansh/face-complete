const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    employeeId: { type: String, default: '', trim: true, index: true },
    period: { type: String, required: true, trim: true, index: true },
    dateKey: { type: String, required: true, trim: true, index: true },
    workingMs: { type: Number, default: 0 },
    activeMs: { type: Number, default: 0 },
    idleMs: { type: Number, default: 0 },
    sleepMs: { type: Number, default: 0 },
    productivityPercentage: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

analyticsSchema.index({ employee: 1, period: 1, dateKey: 1 }, { unique: true, sparse: true });
analyticsSchema.index({ employeeId: 1, period: 1, dateKey: 1 });

module.exports = mongoose.model('Analytics', analyticsSchema);
