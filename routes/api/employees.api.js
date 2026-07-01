const express = require('express');

const Student = require('../../models/Student');
const User = require('../../models/User');
const { deleteImages, uploadImageBuffer } = require('../../services/cloudinary');
const { tryRebuildFaceModelFromCloud } = require('../../services/faceModel');
const { stopWorkerProcess } = require('../../services/faceRecognition');

const router = express.Router();

async function saveEnrollmentImages(faceLabel, images, savedImages) {
  const batchId = Date.now();

  for (const [index, image] of images.entries()) {
    const [, encoded] = String(image).split(',');
    if (!encoded) {
      throw new Error(`Invalid image payload at index ${index}`);
    }

    const fileName = `${String(index).padStart(3, '0')}.jpg`;
    const imageBuffer = Buffer.from(encoded, 'base64');

    const publicId = `${batchId}_${String(index).padStart(3, '0')}`;
    const uploadResult = await uploadImageBuffer(imageBuffer, {
      folder: `faceAttendance/dataset/${faceLabel}`,
      publicId,
    });

    savedImages.push({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileName,
    });
  }

  return savedImages;
}

router.get('/', async (req, res, next) => {
  try {
    const query = req.user?.role === 'employee' ? { email: req.user.email } : {};
    const students = await Student.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, students });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can create employee identities from this API. Employees enroll during signup.',
      });
    }

    const { name, faceLabel, rollNumber, joiningDate, department, email, enrollmentImages = [] } = req.body;

    if (!name || !faceLabel || !joiningDate) {
      return res.status(400).json({
        success: false,
        message: 'name and faceLabel are required',
      });
    }

    if (!Array.isArray(enrollmentImages) || enrollmentImages.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'At least 6 face scan images are required',
      });
    }

    const existingStudent = await Student.findOne({ faceLabel }).lean();

    if (existingStudent) {
      return res.status(409).json({
        success: false,
        message: 'faceLabel already exists',
      });
    }

    let savedImages = [];
    let student = null;

    try {
      savedImages = await saveEnrollmentImages(faceLabel, enrollmentImages, savedImages);
      student = await Student.create({
        name,
        faceLabel,
        rollNumber,
        joiningDate,
        department,
        email,
        profileImage: savedImages[0] ? { url: savedImages[0].url, publicId: savedImages[0].publicId } : undefined,
        enrollmentImages: savedImages,
        enrollmentStatus: 'Pending',
      });
      const modelBuild = await tryRebuildFaceModelFromCloud();
      if (modelBuild.success) {
        stopWorkerProcess();
      }
      if (!modelBuild.success) {
        student.enrollmentReviewNote = `Biometric images stored in Cloudinary. Model rebuild warning: ${modelBuild.message}`;
        await student.save();
      }

      return res.status(201).json({ success: true, student, modelWarning: modelBuild.success ? '' : modelBuild.message });
    } catch (error) {
      if (student) {
        await Student.findByIdAndDelete(student._id);
      }
      await deleteImages(savedImages.map((image) => image.publicId));

      return res.status(500).json({
        success: false,
        message:
          'Student could not be saved because images could not be stored or the face model could not be trained. Check Cloudinary and Python setup.',
        details: error.message,
      });
    }
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'faceLabel already exists',
      });
    }

    next(error);
  }
});

router.put('/:studentId/enrollment', async (req, res, next) => {
  try {
    const { enrollmentImages = [] } = req.body;
    const student = await Student.findById(req.params.studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Employee was not found',
      });
    }

    if (req.user?.role === 'employee' && String(student.email || '').toLowerCase() !== String(req.user.email || '').toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: 'Employees can update only their own biometric enrollment.',
      });
    }

    if (!Array.isArray(enrollmentImages) || enrollmentImages.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'At least 6 face scan images are required',
      });
    }

    let savedImages = [];
    const previousImages = student.enrollmentImages || [];

    try {
      savedImages = await saveEnrollmentImages(student.faceLabel, enrollmentImages, savedImages);
      student.enrollmentImages = savedImages;
      student.profileImage = { url: savedImages[0].url, publicId: savedImages[0].publicId };
      student.faceLoginEnabled = true;
      student.enrollmentStatus = 'Pending';
      student.enrollmentReviewedAt = null;
      student.enrollmentReviewNote = 'Updated by employee from biometric scanner.';
      await student.save();
      await User.findOneAndUpdate(
        { role: 'employee', $or: [{ employeeProfile: student._id }, { email: student.email }] },
        { employeeProfile: student._id, faceLoginEnabled: true }
      );
      const modelBuild = await tryRebuildFaceModelFromCloud();
      if (modelBuild.success) {
        stopWorkerProcess();
      }
      if (!modelBuild.success) {
        student.enrollmentReviewNote = `Updated images stored in Cloudinary. Model rebuild warning: ${modelBuild.message}`;
        await student.save();
      }
      await deleteImages(previousImages.map((image) => image.publicId));

      return res.json({ success: true, student, modelWarning: modelBuild.success ? '' : modelBuild.message });
    } catch (error) {
      student.enrollmentImages = previousImages;
      await student.save().catch(() => {});
      await deleteImages(savedImages.map((image) => image.publicId));

      return res.status(500).json({
        success: false,
        message: 'Face data could not be updated. Check Cloudinary and Python setup.',
        details: error.message,
      });
    }
  } catch (error) {
    next(error);
  }
});

router.patch('/:studentId/enrollment-status', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can approve or reject enrollments.',
      });
    }

    const allowed = new Set(['Pending', 'Verified', 'Rejected', 'Re-enrollment Required']);
    const status = String(req.body.status || '').trim();

    if (!allowed.has(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid enrollment status',
      });
    }

    const student = await Student.findByIdAndUpdate(
      req.params.studentId,
      {
        enrollmentStatus: status,
        enrollmentReviewedAt: new Date(),
        enrollmentReviewNote: String(req.body.note || '').trim(),
      },
      { returnDocument: 'after' }
    ).lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Employee was not found',
      });
    }

    res.json({ success: true, student });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

