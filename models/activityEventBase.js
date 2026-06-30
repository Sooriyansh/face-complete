const mongoose = require('mongoose');

function activityEventBaseSchema(extraFields = {}) {
  return new mongoose.Schema(
    {
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
      sessionId: {
        type: String,
        default: '',
        trim: true,
        index: true,
      },
      machineId: {
        type: String,
        default: '',
        trim: true,
        index: true,
      },
      hostname: {
        type: String,
        default: '',
        trim: true,
        index: true,
      },
      operatingSystem: {
        type: String,
        default: '',
        trim: true,
      },
      applicationVersion: {
        type: String,
        default: '',
        trim: true,
      },
      browser: {
        type: String,
        default: '',
        trim: true,
      },
      ipAddress: {
        type: String,
        default: '',
        trim: true,
      },
      eventType: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },
      eventName: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },
      status: {
        type: String,
        default: 'Recorded',
        trim: true,
        index: true,
      },
      timestamp: {
        type: Date,
        required: true,
        index: true,
      },
      durationMs: {
        type: Number,
        default: 0,
      },
      externalId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },
      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      ...extraFields,
    },
    { timestamps: true }
  );
}

module.exports = { activityEventBaseSchema };
