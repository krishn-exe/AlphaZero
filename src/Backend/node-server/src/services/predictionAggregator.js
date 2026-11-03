const fs = require('fs');
const path = require('path');

/**
 * Parses a CSV string or buffer into an array of row objects.
 * Uses csv-parse if available, with robust native fallback.
 */
function parseCsvRows(csvBufferOrString) {
  const csvString = Buffer.isBuffer(csvBufferOrString)
    ? csvBufferOrString.toString('utf-8')
    : String(csvBufferOrString);

  if (!csvString || !csvString.trim()) {
    return [];
  }

  try {
    const { parse } = require('csv-parse/sync');
    return parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    // Robust native fallback parser
    const lines = csvString.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = values[i];
      });
      return obj;
    });
  }
}

/**
 * Aggregates points across multiple CSV contents (strings or buffers).
 * Identifies points with the exact same (Latitude, Longitude).
 * Computes average Risk_Rating for collisions.
 * Returns a single CSV string with unique coordinates and calculated averages.
 *
 * @param {Array<string|Buffer>} csvContents - Array of CSV file contents
 * @returns {{ csvString: string, records: Array, stats: object }}
 */
function aggregateCsvFiles(csvContents = []) {
  const pointMap = new Map();
  let totalRawPoints = 0;
  let skippedRows = 0;

  for (let fileIdx = 0; fileIdx < csvContents.length; fileIdx++) {
    const content = csvContents[fileIdx];
    const rows = parseCsvRows(content);

    for (const r of rows) {
      totalRawPoints++;

      const latStr = r.Latitude ?? r.latitude ?? r.lat ?? r.LATITUDE;
      const lngStr = r.Longitude ?? r.longitude ?? r.lng ?? r.lon ?? r.LONGITUDE;
      const riskStr =
        r.Risk_Rating ??
        r.risk_rating ??
        r.risk ??
        r.risk_score ??
        r.RISK_RATING;

      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      const risk = parseFloat(riskStr);

      if (isNaN(lat) || isNaN(lng) || isNaN(risk)) {
        skippedRows++;
        continue;
      }

      // Normalize key to 6 decimal places to prevent floating point representation drift
      const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;

      if (!pointMap.has(key)) {
        pointMap.set(key, {
          lat,
          lng,
          sumRisk: risk,
          count: 1,
        });
      } else {
        const item = pointMap.get(key);
        item.sumRisk += risk;
        item.count += 1;
      }
    }
  }

  // Build unique records with averaged risk ratings
  const finalRecords = [];
  for (const item of pointMap.values()) {
    const avgRisk = Number((item.sumRisk / item.count).toFixed(6));
    finalRecords.push({
      Latitude: item.lat,
      Longitude: item.lng,
      Risk_Rating: avgRisk,
    });
  }

  // Sort deterministically: Latitude ascending, then Longitude ascending
  finalRecords.sort((a, b) => a.Latitude - b.Latitude || a.Longitude - b.Longitude);

  // Generate CSV output
  const header = 'Latitude,Longitude,Risk_Rating';
  const csvRows = finalRecords.map(
    (r) => `${r.Latitude},${r.Longitude},${r.Risk_Rating}`
  );
  const csvString = [header, ...csvRows].join('\n') + '\n';

  const uniquePoints = finalRecords.length;
  const collisionsAveraged = totalRawPoints - skippedRows - uniquePoints;

  return {
    csvString,
    records: finalRecords,
    stats: {
      totalInputFiles: csvContents.length,
      totalRawPoints,
      skippedInvalidRows: skippedRows,
      uniquePoints,
      collisionsAveraged,
    },
  };
}

/**
 * Aggregates all prediction CSV files stored for a specific 4-hour batch slot.
 *
 * @param {object} params
 * @param {string} params.dateStr - YYYY-MM-DD (defaults to today's date in IST)
 * @param {string} params.slotHour - e.g. "00-00", "04-00", "08-00", "12-00", "16-00", "20-00"
 * @param {string} [params.baseStorageDir] - Path to storage directory
 * @returns {Promise<object>} Result and statistics of aggregation
 */
async function aggregateSlotPredictions({
  dateStr,
  slotHour,
  baseStorageDir,
} = {}) {
  const baseDir =
    baseStorageDir ||
    process.env.PREDICTIONS_STORAGE_DIR ||
    path.join(__dirname, '../../storage/predictions');

  // Format slot hour cleanly, e.g. "04" -> "04-00"
  let formattedSlot = String(slotHour || '00-00');
  if (/^\d{1,2}$/.test(formattedSlot)) {
    formattedSlot = `${formattedSlot.padStart(2, '0')}-00`;
  }

  const slotDir = path.join(baseDir, dateStr, formattedSlot);
  const rawSubDir = path.join(slotDir, 'raw');
  const dateDir = path.join(baseDir, dateStr);

  const candidateFiles = [];

  // 1. Check slotDir/raw/
  if (fs.existsSync(rawSubDir)) {
    const rawFiles = await fs.promises.readdir(rawSubDir);
    for (const f of rawFiles) {
      if (f.endsWith('.csv') && !f.startsWith('final_') && !f.startsWith('merged_')) {
        candidateFiles.push(path.join(rawSubDir, f));
      }
    }
  }

  // 2. Check slotDir/
  if (fs.existsSync(slotDir)) {
    const slotFiles = await fs.promises.readdir(slotDir);
    for (const f of slotFiles) {
      const fullPath = path.join(slotDir, f);
      const stat = await fs.promises.stat(fullPath);
      if (stat.isFile() && f.endsWith('.csv') && !f.startsWith('final_') && !f.startsWith('merged_')) {
        if (!candidateFiles.includes(fullPath)) {
          candidateFiles.push(fullPath);
        }
      }
    }
  }

  // 3. Check dateDir/ for files matching slot prefix (e.g. predictions_YYYY-MM-DD_04-*.csv)
  if (fs.existsSync(dateDir)) {
    const hourPrefix = formattedSlot.split('-')[0];
    const dateFiles = await fs.promises.readdir(dateDir);
    for (const f of dateFiles) {
      const fullPath = path.join(dateDir, f);
      const stat = await fs.promises.stat(fullPath);
      if (stat.isFile() && f.endsWith('.csv')) {
        const matchesSlot = f.includes(`_${hourPrefix}-`) || f.includes(`_${formattedSlot}`);
        const isNotFinal = !f.startsWith('final_') && !f.startsWith('merged_');
        if (matchesSlot && isNotFinal && !candidateFiles.includes(fullPath)) {
          candidateFiles.push(fullPath);
        }
      }
    }
  }

  if (candidateFiles.length === 0) {
    return {
      status: 'no_files',
      message: `No raw prediction CSV files found for slot ${formattedSlot} on ${dateStr}`,
      dateStr,
      slotHour: formattedSlot,
      candidatePathsChecked: [rawSubDir, slotDir, dateDir],
    };
  }

  // Read all input CSV files
  const fileBuffers = [];
  for (const filePath of candidateFiles) {
    const buffer = await fs.promises.readFile(filePath);
    fileBuffers.push(buffer);
  }

  // Execute aggregation and collision averaging
  const { csvString, records, stats } = aggregateCsvFiles(fileBuffers);

  // Ensure output directories exist
  await fs.promises.mkdir(slotDir, { recursive: true });
  await fs.promises.mkdir(dateDir, { recursive: true });
  await fs.promises.mkdir(baseDir, { recursive: true });

  // 1. Output inside slot folder
  const slotFinalPath = path.join(slotDir, 'final_predictions.csv');
  await fs.promises.writeFile(slotFinalPath, csvString, 'utf-8');

  // 2. Output inside date folder with slot name
  const dateFinalPath = path.join(dateDir, `final_predictions_${formattedSlot}.csv`);
  await fs.promises.writeFile(dateFinalPath, csvString, 'utf-8');

  // 3. Unified latest files for downstream consumption & heatmap
  const latestPath = path.join(baseDir, 'latest_predictions.csv');
  const latestFinalPath = path.join(baseDir, 'latest_final_predictions.csv');
  await fs.promises.writeFile(latestPath, csvString, 'utf-8');
  await fs.promises.writeFile(latestFinalPath, csvString, 'utf-8');

  // 4. Generate JSON format for Leaflet heatmap (array of [lat, lng, risk])
  const pointsArray = finalRecords.map((r) => [r.Latitude, r.Longitude, r.Risk_Rating]);
  const risks = finalRecords.map((r) => r.Risk_Rating);
  const minRisk = risks.length > 0 ? Math.min(...risks) : 0;
  const maxRisk = risks.length > 0 ? Math.max(...risks) : 0;
  const avgRisk = risks.length > 0 ? Number((risks.reduce((a, b) => a + b, 0) / risks.length).toFixed(4)) : 0;

  const heatJson = {
    updatedAt: new Date().toISOString(),
    slot: formattedSlot,
    date: dateStr,
    stats: {
      ...stats,
      minRisk,
      maxRisk,
      avgRisk,
    },
    points: pointsArray,
  };

  const slotFinalJsonPath = path.join(slotDir, 'final_predictions.json');
  const latestFinalJsonPath = path.join(baseDir, 'latest_final_predictions.json');
  await fs.promises.writeFile(slotFinalJsonPath, JSON.stringify(heatJson), 'utf-8');
  await fs.promises.writeFile(latestFinalJsonPath, JSON.stringify(heatJson), 'utf-8');

  // 5. Save metadata summary
  const meta = {
    date: dateStr,
    slot: formattedSlot,
    aggregatedAt: new Date().toISOString(),
    inputFiles: candidateFiles.map((p) => path.relative(baseDir, p)),
    stats,
  };
  const metaPath = path.join(slotDir, 'aggregation_meta.json');
  await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  console.log(
    `[AIML Aggregator] Slot ${formattedSlot} (${dateStr}): Merged ${stats.totalInputFiles} files into 1 CSV/JSON. Unique points: ${stats.uniquePoints}, Overlaps averaged: ${stats.collisionsAveraged}`
  );

  return {
    status: 'ok',
    message: 'CSV and JSON aggregation completed successfully',
    date: dateStr,
    slot: formattedSlot,
    inputFiles: candidateFiles.length,
    stats,
    outputs: {
      slotFinal: slotFinalPath,
      slotFinalJson: slotFinalJsonPath,
      dateFinal: dateFinalPath,
      latest: latestPath,
      latestJson: latestFinalJsonPath,
      metadata: metaPath,
    },
  };
}

/**
 * Retrieves the latest aggregated predictions in JSON format for the heatmap.
 * If no aggregated files exist yet in storage, loads and aggregates from real ML model
 * predicted_risk_output.csv as a reliable baseline.
 */
async function getLatestAggregatedJson(baseStorageDir) {
  const baseDir =
    baseStorageDir ||
    process.env.PREDICTIONS_STORAGE_DIR ||
    path.join(__dirname, '../../storage/predictions');

  const jsonPath = path.join(baseDir, 'latest_final_predictions.json');

  // 1. Return cached JSON if already aggregated
  if (fs.existsSync(jsonPath)) {
    try {
      const data = await fs.promises.readFile(jsonPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.warn('[Aggregator] Could not read latest_final_predictions.json:', err);
    }
  }

  // 2. Check for latest_final_predictions.csv
  const finalCsvPath = path.join(baseDir, 'latest_final_predictions.csv');
  const legacyCsvPath = path.join(baseDir, 'latest_predictions.csv');
  let targetCsv = fs.existsSync(finalCsvPath) ? finalCsvPath : (fs.existsSync(legacyCsvPath) ? legacyCsvPath : null);

  // 3. Fallback to real ML model prediction output
  if (!targetCsv) {
    const candidates = [
      path.join(__dirname, '../data/predicted_risk_output.csv'),
      path.join(__dirname, '../../data/predicted_risk_output.csv'),
      path.join(__dirname, '../../Container/Heat/ML-model/predicted_risk_output.csv'),
      path.join(__dirname, '../../../Container/Heat/ML-model/predicted_risk_output.csv'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        targetCsv = c;
        break;
      }
    }
  }

  if (!targetCsv || !fs.existsSync(targetCsv)) {
    return {
      updatedAt: new Date().toISOString(),
      slot: 'none',
      stats: { totalPoints: 0, uniquePoints: 0, maxRisk: 0, avgRisk: 0 },
      points: [],
    };
  }

  // Parse and aggregate target CSV
  const csvContent = await fs.promises.readFile(targetCsv, 'utf-8');
  const { records, stats } = aggregateCsvFiles([csvContent]);

  const pointsArray = records.map((r) => [r.Latitude, r.Longitude, r.Risk_Rating]);
  const risks = records.map((r) => r.Risk_Rating);
  const minRisk = risks.length > 0 ? Math.min(...risks) : 0;
  const maxRisk = risks.length > 0 ? Math.max(...risks) : 0;
  const avgRisk = risks.length > 0 ? Number((risks.reduce((a, b) => a + b, 0) / risks.length).toFixed(4)) : 0;

  const result = {
    updatedAt: new Date().toISOString(),
    slot: 'latest',
    stats: {
      ...stats,
      minRisk,
      maxRisk,
      avgRisk,
    },
    points: pointsArray,
  };

  // Cache to disk
  try {
    await fs.promises.mkdir(baseDir, { recursive: true });
    await fs.promises.writeFile(jsonPath, JSON.stringify(result), 'utf-8');
  } catch (err) {
    console.warn('[Aggregator] Could not write cache json:', err);
  }

  return result;
}

module.exports = {
  parseCsvRows,
  aggregateCsvFiles,
  aggregateSlotPredictions,
  getLatestAggregatedJson,
};
