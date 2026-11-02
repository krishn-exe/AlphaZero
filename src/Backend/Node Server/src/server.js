require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const mapRoutes = require('./routes/mapRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const subscribeRoutes = require('./routes/subscribeRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const { getGridPredictions, getNationalHeatmap } = require('./controllers/mapController');

app.get('/api/risk-data', getGridPredictions);
app.get('/data/national', getNationalHeatmap);
app.get('/api/data/national', getNationalHeatmap);
app.use('/api/map', mapRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/subscribe', subscribeRoutes);
app.use('/api/admin', adminAuthRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Landslide backend running on http://localhost:${PORT}`);
});
