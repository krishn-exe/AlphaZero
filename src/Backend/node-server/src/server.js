const path = require('path');
// Load .env from root project directory first, fallback to local if needed
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });
require('dotenv').config(); // also loads local .env if present

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const mapRoutes = require('./routes/mapRoutes');
const subscribeRoutes = require('./routes/subscribeRoutes');
const { getNationalHeatmap } = require('./controllers/mapController');
const { startPredictionScheduler } = require('./services/predictionScheduler');
const { startCleanupScheduler } = require('./services/cleanupScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxy (Docker Nginx) for accurate client IP in rate limiting
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Public Heatmap shortcuts
app.get('/data/national', getNationalHeatmap);
app.get('/api/data/national', getNationalHeatmap);

// Routes
app.use('/api/map', mapRoutes);
app.use('/api/predictions', mapRoutes); // Alias for predictions endpoint
app.use('/api/subscribe', subscribeRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Landslide backend running on http://localhost:${PORT}`);
  startPredictionScheduler();
  startCleanupScheduler();
});
