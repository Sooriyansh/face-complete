const WorkSchedule = require('../models/WorkSchedule');

const DEFAULT_SCHEDULE = {
  officeJoinTime: '08:00',
  checkOutTime: '17:00',
  workingHours: 8,
  breakMinutes: 0,
  gracePeriodMinutes: 0,
  overtimeStartTime: '17:00',
};

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function minutesFromTime(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number);
  return hours * 60 + minutes;
}

function dateAtLocalTime(baseDate, timeValue) {
  const date = new Date(baseDate);
  const [hours, minutes] = String(timeValue).split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function normalizeScheduleInput(input = {}) {
  const schedule = {
    officeJoinTime: isTime(input.officeJoinTime) ? input.officeJoinTime : DEFAULT_SCHEDULE.officeJoinTime,
    checkOutTime: isTime(input.checkOutTime) ? input.checkOutTime : DEFAULT_SCHEDULE.checkOutTime,
    overtimeStartTime: isTime(input.overtimeStartTime) ? input.overtimeStartTime : input.checkOutTime,
    workingHours: Number(input.workingHours),
    breakMinutes: Number(input.breakMinutes),
    gracePeriodMinutes: Number(input.gracePeriodMinutes),
  };

  if (!isTime(schedule.overtimeStartTime)) {
    schedule.overtimeStartTime = schedule.checkOutTime;
  }

  schedule.workingHours = Number.isFinite(schedule.workingHours)
    ? Math.min(Math.max(schedule.workingHours, 1), 24)
    : DEFAULT_SCHEDULE.workingHours;
  schedule.breakMinutes = Number.isFinite(schedule.breakMinutes) ? Math.max(schedule.breakMinutes, 0) : 0;
  schedule.gracePeriodMinutes = Number.isFinite(schedule.gracePeriodMinutes) ? Math.max(schedule.gracePeriodMinutes, 0) : 0;

  return schedule;
}

async function getWorkSchedule() {
  const schedule = await WorkSchedule.findOne({ key: 'default' }).lean();
  return schedule || DEFAULT_SCHEDULE;
}

async function saveWorkSchedule(input, updatedBy = null) {
  const schedule = normalizeScheduleInput(input);
  return WorkSchedule.findOneAndUpdate(
    { key: 'default' },
    { ...schedule, updatedBy },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();
}

function calculateScheduleState(schedule, attendanceTime, checkoutAt = null) {
  const activeSchedule = { ...DEFAULT_SCHEDULE, ...(schedule || {}) };
  const joinDeadline = dateAtLocalTime(attendanceTime, activeSchedule.officeJoinTime);
  joinDeadline.setMinutes(joinDeadline.getMinutes() + Number(activeSchedule.gracePeriodMinutes || 0));
  const lateMs = Math.max(new Date(attendanceTime).getTime() - joinDeadline.getTime(), 0);
  const overtimeStart = dateAtLocalTime(checkoutAt || attendanceTime, activeSchedule.overtimeStartTime);
  const overtimeMs = checkoutAt ? Math.max(new Date(checkoutAt).getTime() - overtimeStart.getTime(), 0) : 0;
  const standardShiftMs = Math.max(Number(activeSchedule.workingHours || 8) * 60 * 60 * 1000, 0);

  return {
    lateMs,
    lateByMinutes: Math.round(lateMs / 60000),
    lateStatus: lateMs > 0 ? 'Late' : 'On Time',
    overtimeMs,
    standardShiftMs,
    joinDeadline,
    overtimeStart,
  };
}

module.exports = {
  DEFAULT_SCHEDULE,
  calculateScheduleState,
  dateAtLocalTime,
  getWorkSchedule,
  minutesFromTime,
  normalizeScheduleInput,
  saveWorkSchedule,
};
