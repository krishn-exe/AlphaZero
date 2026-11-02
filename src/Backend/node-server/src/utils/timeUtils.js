/**
 * Returns the current time decomposed into Indian Standard Time (IST, UTC+05:30).
 */
function getIstTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value])
  );

  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const second = parseInt(parts.second, 10);

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour,
    minute,
    second,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    timeStr: `${parts.hour}-${parts.minute}-${parts.second}`,
    formatted: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} IST`,
  };
}

/**
 * Validates if the given IST time falls on the 4-hour schedule
 * (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 IST) within a 15-minute grace period.
 * Also allows up to 1 minute early buffer for minor clock drift.
 */
function checkIstScheduleWindow(ist, graceMinutes = 15) {
  const isScheduledHour = ist.hour % 4 === 0;
  const isWithinGrace =
    isScheduledHour && (ist.minute < graceMinutes || (ist.minute === graceMinutes && ist.second === 0));
  const isEarlyBuffer = ist.hour % 4 === 3 && ist.minute === 59;

  const allowed = isWithinGrace || isEarlyBuffer;
  const targetHour = isEarlyBuffer ? (ist.hour + 1) % 24 : (Math.floor(ist.hour / 4) * 4) % 24;
  const windowLabel = `${String(targetHour).padStart(2, '0')}:00 IST`;

  const nextHour = ((Math.floor(ist.hour / 4) + 1) * 4) % 24;
  const nextWindowLabel = `${String(nextHour).padStart(2, '0')}:00 IST`;

  return {
    allowed,
    targetHour,
    windowLabel,
    nextWindowLabel,
  };
}

module.exports = {
  getIstTime,
  checkIstScheduleWindow,
};
