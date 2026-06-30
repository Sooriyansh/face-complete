const mongoose = require('mongoose');

const systemEventSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      trim: true,
    },
    meaning: {
      type: String,
      default: '',
      trim: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
    },
    eventId: {
      type: Number,
      required: true,
    },
    sourceLog: {
      type: String,
      required: true,
      trim: true,
    },
    provider: {
      type: String,
      default: '',
      trim: true,
    },
    recordNumber: {
      type: Number,
      default: null,
    },
    computer: {
      type: String,
      default: '',
      trim: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
      index: true,
    },
    employeeId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    employeeName: {
      type: String,
      default: '',
      trim: true,
    },
    user: {
      type: String,
      default: '',
      trim: true,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      default: 'Recorded',
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    externalId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

systemEventSchema.index({ event: 1, occurredAt: -1 });
systemEventSchema.index({ employee: 1, occurredAt: -1 });
systemEventSchema.index({ user: 1, occurredAt: -1 });
systemEventSchema.index({ employeeId: 1, occurredAt: -1 });
systemEventSchema.index({ employeeName: 1, occurredAt: -1 });
systemEventSchema.index({ sourceLog: 1, eventId: 1, recordNumber: 1 });
systemEventSchema.index({ employee: 1, event: 1, occurredAt: -1 });
systemEventSchema.index({ employeeId: 1, event: 1, occurredAt: -1 });
systemEventSchema.index({ status: 1, occurredAt: -1 });

module.exports = mongoose.model('SystemEvent', systemEventSchema);
