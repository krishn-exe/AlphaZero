const { aggregateSlotPredictions } = require('./predictionAggregator');
const { getIstTime } = require('../utils/timeUtils');

let schedulerInterval = null;
let lastProcessedSlot = null;
let lastExecutionResult = null;

// The 4-hour scheduled slots in IST
const SCHEDULED_SLOT_HOURS = [0, 4, 8, 12, 16, 20];

/**
 * Calculates the next aggregation target time (HH:30 IST for HH in [0, 4, 8, 12, 16, 20]).
 *
 * @param {Date} [fromDate]
 * @returns {{ targetIstDateStr: string, targetSlot: string, targetTimeFormatted: string, msUntilNext: number }}
 */
function getNextAggregationTarget(fromDate = new Date()) {
  const ist = getIstTime(fromDate);

  // Find the next slotHour where HH:30 IST is in the future
  for (const slotHour of SCHEDULED_SLOT_HOURS) {
    if (ist.hour < slotHour || (ist.hour === slotHour && ist.minute < 30)) {
      const targetSlot = `${String(slotHour).padStart(2, '0')}-00`;
      const targetTimeFormatted = `${ist.dateStr} ${String(slotHour).padStart(2, '0')}:30:00 IST`;

      // Calculate approximate ms until target
      const minutesCurrent = ist.hour * 60 + ist.minute + ist.second / 60;
      const minutesTarget = slotHour * 60 + 30;
      const msUntilNext = Math.max(0, Math.round((minutesTarget - minutesCurrent) * 60 * 1000));

      return {
        targetIstDateStr: ist.dateStr,
        targetSlot,
        targetTimeFormatted,
        msUntilNext,
      };
    }
  }

  // If past 20:30 IST, next is 00:30 IST on the next day
  const tomorrow = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowIst = getIstTime(tomorrow);
  const targetSlot = '00-00';
  const targetTimeFormatted = `${tomorrowIst.dateStr} 00:30:00 IST`;

  const minutesCurrent = ist.hour * 60 + ist.minute + ist.second / 60;
  const minutesTarget = 24 * 60 + 30; // 00:30 next day
  const msUntilNext = Math.max(0, Math.round((minutesTarget - minutesCurrent) * 60 * 1000));

  return {
    targetIstDateStr: tomorrowIst.dateStr,
    targetSlot,
    targetTimeFormatted,
    msUntilNext,
  };
}

/**
 * Checks if the current moment matches the 30-minute post-fetch aggregation window
 * (i.e. 00:30, 04:30, 08:30, 12:30, 16:30, 20:30 IST) and executes if not already done.
 */
async function checkAndRunScheduledAggregation(forcedDate = null) {
  const ist = getIstTime(forcedDate || new Date());

  const isScheduledHour = SCHEDULED_SLOT_HOURS.includes(ist.hour);
  // Allow a 2-minute trigger window (minute 30 or 31) to be resilient to timer drift
  const isTargetMinute = ist.minute === 30 || ist.minute === 31;

  if (isScheduledHour && isTargetMinute) {
    const slotHour = `${String(ist.hour).padStart(2, '0')}-00`;
    const slotKey = `${ist.dateStr}_${slotHour}`;

    if (lastProcessedSlot !== slotKey) {
      console.log(
        `[Prediction Scheduler] 30 minutes elapsed since ${slotHour} fetch window. Running aggregation for ${ist.dateStr}...`
      );

      try {
        const result = await aggregateSlotPredictions({
          dateStr: ist.dateStr,
          slotHour,
        });

        lastProcessedSlot = slotKey;
        lastExecutionResult = {
          timestamp: ist.formatted,
          slotKey,
          result,
        };

        return result;
      } catch (err) {
        console.error('[Prediction Scheduler] Aggregation error:', err);
        lastExecutionResult = {
          timestamp: ist.formatted,
          slotKey,
          error: err.message,
        };
      }
    }
  }

  return null;
}

/**
 * Starts the prediction scheduler.
 * Ticks every 30 seconds to accurately catch the HH:30 window without high CPU usage.
 */
function startPredictionScheduler() {
  if (schedulerInterval) return;

  const next = getNextAggregationTarget();
  console.log(
    `[Prediction Scheduler] Started. Aggregations run 30m after fetch (00:30, 04:30, 08:30, 12:30, 16:30, 20:30 IST).`
  );
  console.log(`[Prediction Scheduler] Next aggregation scheduled at: ${next.targetTimeFormatted} (slot: ${next.targetSlot})`);

  schedulerInterval = setInterval(() => {
    checkAndRunScheduledAggregation().catch((err) => {
      console.error('[Prediction Scheduler] Interval error:', err);
    });
  }, 30 * 1000); // Check every 30 seconds
}

/**
 * Stops the scheduler (useful for tests and graceful shutdown).
 */
function stopPredictionScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

/**
 * Returns current scheduler status, next targets, and last execution details.
 */
function getSchedulerStatus() {
  const currentIst = getIstTime();
  const nextTarget = getNextAggregationTarget();

  return {
    status: schedulerInterval ? 'running' : 'stopped',
    currentIstTime: currentIst.formatted,
    scheduledFetchHours: '00:00, 04:00, 08:00, 12:00, 16:00, 20:00 IST',
    scheduledAggregationHours: '00:30, 04:30, 08:30, 12:30, 16:30, 20:30 IST',
    nextAggregation: nextTarget,
    lastProcessedSlot,
    lastExecutionResult,
  };
}

module.exports = {
  SCHEDULED_SLOT_HOURS,
  getNextAggregationTarget,
  checkAndRunScheduledAggregation,
  startPredictionScheduler,
  stopPredictionScheduler,
  getSchedulerStatus,
};
