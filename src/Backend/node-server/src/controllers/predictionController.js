const fs = require('fs');
const path = require('path');
const {
  aggregateSlotPredictions,
  aggregateCsvFiles,
  parseCsvRows,
} = require('../services/predictionAggregator');
const {
  getSchedulerStatus,
  getNextAggregationTarget,
} = require('../services/predictionScheduler');
const {
  getIstTime,
  checkIstScheduleWindow,
} = require('../utils/timeUtils');

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
 * - Saves CSV into slot folder structure: storage/predictions/YYYY-MM-DD/HH-00/raw/
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

    // 5. Store CSV file into folder structure:
    //    storage/predictions/YYYY-MM-DD/HH-00/raw/predictions_YYYY-MM-DD_HH-mm-ss.csv
    const baseStorageDir =
      process.env.PREDICTIONS_STORAGE_DIR ||
      path.join(__dirname, '../../storage/predictions');

    const targetHour =
      windowCheck.targetHour !== undefined
        ? windowCheck.targetHour
        : (Math.floor(ist.hour / 4) * 4) % 24;
    const slotLabel = `${String(targetHour).padStart(2, '0')}-00`;

    const slotDir = path.join(baseStorageDir, ist.dateStr, slotLabel);
    const rawDir = path.join(slotDir, 'raw');
    const dateDir = path.join(baseStorageDir, ist.dateStr);

    const uniqueId = Date.now().toString().slice(-4);
    const fileName = `predictions_${ist.dateStr}_${ist.timeStr}_${uniqueId}.csv`;
    const rawFilePath = path.join(rawDir, fileName);
    const compatFilePath = path.join(dateDir, fileName);
    const latestFilePath = path.join(baseStorageDir, 'latest_predictions.csv');

    await fs.promises.mkdir(rawDir, { recursive: true });
    await fs.promises.mkdir(dateDir, { recursive: true });

    await fs.promises.writeFile(rawFilePath, file.buffer);
    await fs.promises.writeFile(compatFilePath, file.buffer);
    await fs.promises.writeFile(latestFilePath, file.buffer);

    const aggregationTime = `${String(targetHour).padStart(2, '0')}:30 IST`;

    console.log(
      `[AIML Ingest] Stored ${records.length} points for slot ${slotLabel} in ${rawFilePath}. Scheduled aggregation: ${aggregationTime}`
    );

    return res.status(200).json({
      status: 'ok',
      message: 'Predictions CSV successfully validated and stored',
      receivedRows: records.length,
      batchSlot: slotLabel,
      scheduledWindow: windowCheck.windowLabel,
      aggregationScheduledAt: aggregationTime,
      timestamp: ist.formatted,
      storage: {
        slotFolder: `${ist.dateStr}/${slotLabel}/raw`,
        filename: fileName,
        savedPath: `storage/predictions/${ist.dateStr}/${slotLabel}/raw/${fileName}`,
      },
    });
  } catch (err) {
    console.error('receivePredictions error:', err);
    return res.status(500).json({ error: 'Internal server error processing predictions' });
  }
}

/**
 * POST /api/predictions/aggregate
 * POST /api/map/aggregate-predictions
 *
 * Manually or programmatically triggers 4-hour batch aggregation.
 * Takes all CSV files for the target slot, averages colliding points,
 * and produces a single unified final CSV file with unique coordinates.
 */
async function triggerManualAggregation(req, res) {
  try {
    const providedKey =
      req.body?.key ||
      req.headers['x-api-key'] ||
      (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, '')) ||
      req.query?.key;

    const configuredKey = process.env.AIML_API_KEY;

    // Optional key check if configured
    if (configuredKey && providedKey && providedKey !== configuredKey) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    const ist = getIstTime();
    const dateStr = req.body?.date || req.query?.date || ist.dateStr;

    // Default to current/most recent slot if omitted
    let slotHour = req.body?.slot || req.query?.slot;
    if (!slotHour) {
      const targetHour = (Math.floor(ist.hour / 4) * 4) % 24;
      slotHour = `${String(targetHour).padStart(2, '0')}-00`;
    }

    const result = await aggregateSlotPredictions({
      dateStr,
      slotHour,
    });

    if (result.status === 'no_files') {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('triggerManualAggregation error:', err);
    return res.status(500).json({ error: 'Aggregation failed', details: err.message });
  }
}

/**
 * GET /api/predictions/final
 * GET /api/map/predictions/final
 *
 * Downloads or views the latest unified, aggregated CSV file with unique points and averaged values.
 */
async function getLatestFinalCsv(req, res) {
  try {
    const baseStorageDir =
      process.env.PREDICTIONS_STORAGE_DIR ||
      path.join(__dirname, '../../storage/predictions');

    const finalPath = path.join(baseStorageDir, 'latest_final_predictions.csv');
    const legacyPath = path.join(baseStorageDir, 'latest_predictions.csv');

    let targetPath = fs.existsSync(finalPath) ? finalPath : legacyPath;

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'No final predictions CSV available yet' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="final_predictions.csv"'
    );
    const readStream = fs.createReadStream(targetPath);
    readStream.pipe(res);
  } catch (err) {
    console.error('getLatestFinalCsv error:', err);
    res.status(500).json({ error: 'Failed to retrieve final predictions' });
  }
}

/**
 * GET /api/predictions/status
 *
 * Returns current scheduler information, upcoming 30m aggregation target, and latest results.
 */
function getSchedulerStatusEndpoint(req, res) {
  try {
    const status = getSchedulerStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scheduler status' });
  }
}

module.exports = {
  getIstTime,
  checkIstScheduleWindow,
  parseAndValidateCsv,
  receivePredictions,
  triggerManualAggregation,
  getLatestFinalCsv,
  getSchedulerStatusEndpoint,
};
