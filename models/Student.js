const mongoose = require('mongoose');
const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    faceLabel: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    rollNumber: {
      type: String,
      trim: true,
      default: '',
    },
    joiningDate: {
      type: Date,
      default: null,
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      default: '',
    },
    designation: {
      type: String,
      trim: true,
      default: '',
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: '',
    },
    profileImage: {
      url: { type: String, trim: true, default: '' },
      publicId: { type: String, trim: true, default: '' },
    },
    faceLoginEnabled: {
      type: Boolean,
      default: false,
    },
    biometricEncryptionStatus: {
      type: String,
      enum: ['Pending', 'Encrypted'],
      default: 'Pending',
    },
    livenessStatus: {
      type: String,
      enum: ['Pending', 'Passed', 'Failed'],
      default: 'Pending',
    },
    enrollmentImages: {
      type: [
        {
          url: {
            type: String,
            required: true,
          },
          publicId: {
            type: String,
            required: true,
          },
          fileName: {
            type: String,
            required: true,
          },
        },
      ],
      default: [],
    },
    enrollmentStatus: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected', 'Re-enrollment Required'],
      default: 'Pending',
    },
    enrollmentReviewedAt: {
      type: Date,
      default: null,
    },
    enrollmentReviewNote: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Student', studentSchema);
