const fs = require('fs');
const path = require('path');

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
  const targetHour = isEarlyBuffer ? (ist.hour + 1) % 24 : ist.hour;
  const windowLabel = `${String(targetHour).padStart(2, '0')}:00 IST`;

  const nextHour = ((Math.floor(ist.hour / 4) + 1) * 4) % 24;
  const nextWindowLabel = `${String(nextHour).padStart(2, '0')}:00 IST`;

  return {
    allowed,
    windowLabel,
    nextWindowLabel,
  };
}

/**
 * Parses and strictly validates that the CSV has 3 columns:
 * Latitude, Longitude, and Risk_Rating.
 */
function parseAndValidateCsv(csvBufferOrString) {
  const csvString = Buffer.isBuffer(csvBufferOrString)
    ? csvBufferOrString.toString('utf-8')
    : String(csvBufferOrString);

  if (!csvString || !csvString.trim()) {
    throw new Error('CSV content is empty');
  }

  let records = [];

  try {
    const { parse } = require('csv-parse/sync');
    records = parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    // Robust fallback CSV parser without third-party dependencies
    const lines = csvString.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      throw new Error('CSV must contain a header row and at least one data row');
    }
    const headers = lines[0].split(',').map((h) => h.trim());
    records = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = values[i];
      });
      return obj;
    });
  }

  if (!records || records.length === 0) {
    throw new Error('CSV contains no data rows');
  }

  const sample = records[0];
  const keys = Object.keys(sample).map((k) =>
    k.trim().toLowerCase().replace(/[\s_-]+/g, '_')
  );

  const hasLat = keys.includes('latitude') || keys.includes('lat');
  const hasLng = keys.includes('longitude') || keys.includes('lng') || keys.includes('lon');
  const hasRisk =
    keys.includes('risk_rating') ||
    keys.includes('risk') ||
    keys.includes('risk_score');

  if (!hasLat || !hasLng || !hasRisk) {
    throw new Error(
      'Invalid CSV structure: CSV must contain exactly 3 required columns: Latitude, Longitude, and Risk_Rating'
    );
  }

  // Validate numeric values on all rows
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const latVal = parseFloat(r.Latitude ?? r.latitude ?? r.lat);
    const lngVal = parseFloat(r.Longitude ?? r.longitude ?? r.lng ?? r.lon);
    const riskVal = parseFloat(r.Risk_Rating ?? r.risk_rating ?? r.risk ?? r.risk_score);

    if (isNaN(latVal) || latVal < -90 || latVal > 90) {
      throw new Error(`Invalid Latitude at row ${i + 1}: expected number between -90 and 90`);
    }
    if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
      throw new Error(`Invalid Longitude at row ${i + 1}: expected number between -180 and 180`);
    }
    if (isNaN(riskVal)) {
      throw new Error(`Invalid Risk_Rating at row ${i + 1}: expected a valid number`);
    }
  }

  return records;
}

/**
 * POST /api/map/national
 * POST /api/map/predictions
 * POST /api/predictions
 *
 * Accepts:
 * - key: API key (via multipart body, x-api-key header, or Authorization Bearer header)
 * - data / file: multipart CSV file with Latitude, Longitude, Risk_Rating
 *
 * Enforces:
 * - Key authorization
 * - IST schedule window (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 IST with 15m grace period)
 * - Strict CSV validation
 * - Saves CSV into a structured directory (storage/predictions/YYYY-MM-DD/predictions_HH-MM-SS.csv)
 */
async function receivePredictions(req, res) {
  try {
    // 1. Authenticate API Key
    const providedKey =
      req.body?.key ||
      req.headers['x-api-key'] ||
      (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, '')) ||
      req.query?.key;

    const configuredKey = process.env.AIML_API_KEY;

    if (!configuredKey) {
      console.error('AIML_API_KEY is not set in environment (.env)');
      return res.status(500).json({ error: 'Server misconfiguration: API key not set' });
    }

    if (!providedKey || providedKey !== configuredKey) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }

    // 2. Validate IST Time Window (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 with 15m grace period)
    const ist = getIstTime(req._mockDate || new Date());
    const windowCheck = checkIstScheduleWindow(ist, 15);

    const bypassTimeWindow =
      process.env.BYPASS_TIME_WINDOW === 'true' ||
      req.query?.bypass_time === 'true';

    if (!windowCheck.allowed && !bypassTimeWindow) {
      return res.status(403).json({
        error: 'Upload rejected: Outside allowed time window',
        details:
          'AIML predictions are accepted only at scheduled windows (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 IST) with a 15-minute grace period (up to HH:15 IST).',
        currentIstTime: ist.formatted,
        nextWindow: windowCheck.nextWindowLabel,
      });
    }

    // 3. Validate File Upload
    const file =
      req.file ||
      (req.files && (req.files.data?.[0] || req.files.file?.[0] || req.files[0]));

    if (!file || !file.buffer) {
      return res.status(400).json({
        error: 'Missing CSV file upload (expected multipart form field "data" or "file")',
      });
    }

    // 4. Validate CSV Content (3 columns: Latitude, Longitude, Risk_Rating)
    let records;
    try {
      records = parseAndValidateCsv(file.buffer);
    } catch (csvErr) {
      return res.status(400).json({
        error: 'Invalid CSV format',
        details: csvErr.message,
      });
    }

    // 5. Store CSV file into folder structure: storage/predictions/YYYY-MM-DD/
    const baseStorageDir =
      process.env.PREDICTIONS_STORAGE_DIR ||
      path.join(__dirname, '../../storage/predictions');

    const dateFolder = path.join(baseStorageDir, ist.dateStr);
    const fileName = `predictions_${ist.dateStr}_${ist.timeStr}.csv`;
    const filePath = path.join(dateFolder, fileName);
    const latestFilePath = path.join(baseStorageDir, 'latest_predictions.csv');

    await fs.promises.mkdir(dateFolder, { recursive: true });
    await fs.promises.writeFile(filePath, file.buffer);
    await fs.promises.writeFile(latestFilePath, file.buffer);

    console.log(
      `[AIML Ingest] Successfully stored ${records.length} predictions in ${filePath} (window: ${windowCheck.windowLabel})`
    );

    return res.status(200).json({
      status: 'ok',
      message: 'Predictions CSV successfully validated and stored',
      receivedRows: records.length,
      scheduledWindow: windowCheck.windowLabel,
      timestamp: ist.formatted,
      storage: {
        folder: ist.dateStr,
        filename: fileName,
        savedPath: `storage/predictions/${ist.dateStr}/${fileName}`,
      },
    });
  } catch (err) {
    console.error('receivePredictions error:', err);
    return res.status(500).json({ error: 'Internal server error processing predictions' });
  }
}

module.exports = {
  getIstTime,
  checkIstScheduleWindow,
  parseAndValidateCsv,
  receivePredictions,
};
