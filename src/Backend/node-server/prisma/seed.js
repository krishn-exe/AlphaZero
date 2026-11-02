const { PrismaClient } = require('@prisma/client');
const nerDistricts = require('./data/ner_districts.json');
const prisma = new PrismaClient();

/**
 * Seed data for full NER district coverage.
 *
 * DATA SOURCE: real district boundaries filtered from geohacker/india's
 * all-India district GeoJSON (https://github.com/geohacker/india), down to
 * the 8 NER states, simplified for payload size. 78 districts — this source
 * predates a few recent district splits (real present-day NER is ~130), but
 * it's real administrative geometry, not placeholder rectangles, which is
 * what matters for the demo map.
 *
 * IMPORTANT — data-realness contract for the demo (unchanged from before):
 *   - Every District row gets a randomized DEMO risk score. None of these
 *     are computed by AIML's model.
 *   - Aizawl and East Khasi Hills (Shillong's district) additionally get a
 *     City row each — THAT is where the real AIML DL model output lands,
 *     via PUT /api/map/city/:id/risk. Their District-level row stays demo
 *     data like every other district.
 */
function getRiskLevel(score) {
  if (score >= 75) return 'severe';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function randomDemoScore() {
  return Math.round(Math.random() * 100 * 10) / 10; // float, 0-100, one decimal
}

function randomRainfall() {
  return Math.round(Math.random() * 200 * 10) / 10; // float, 0-200 mm
}

function makeCityBoxAround(lat, lng, delta = 0.08) {
  return JSON.stringify({
    type: 'Polygon',
    coordinates: [[
      [lng - delta, lat - delta],
      [lng + delta, lat - delta],
      [lng + delta, lat + delta],
      [lng - delta, lat + delta],
      [lng - delta, lat - delta],
    ]],
  });
}

async function main() {
  const existingCount = await prisma.district.count();
  if (existingCount > 0) {
    console.log(`Database already has ${existingCount} districts — skipping seed (safe to re-run, no duplicates created).`);
    return;
  }
  console.log(`Seeding ${nerDistricts.length} NER districts (all demo data, real boundaries)...`);

  const created = {};
  for (const d of nerDistricts) {
    const score = randomDemoScore();
    const rainfall = randomRainfall();
    const row = await prisma.district.create({
      data: {
        name: d.name,
        state: d.state,
        centerLat: d.centerLat,
        centerLng: d.centerLng,
        boundaryGeoJson: JSON.stringify(d.boundaryGeoJson),
        riskScore: score,
        riskLevel: getRiskLevel(score),
        rainfall: rainfall,
        // computedAt intentionally left null — demo data, not model output
      },
    });

    if (d.name === 'Aizawl' && d.state === 'Mizoram') created.aizawlDistrict = row;
    if (d.name === 'East Khasi Hills' && d.state === 'Meghalaya') created.shillongDistrict = row;
  }

  console.log(`Seeded ${nerDistricts.length} districts.`);

  if (!created.aizawlDistrict || !created.shillongDistrict) {
    console.warn('WARNING: could not find Aizawl and/or East Khasi Hills in the source data — pilot city rows were not created. Check prisma/data/ner_districts.json.');
  } else {
    console.log('Seeding pilot city rows (Aizawl, Shillong) — placeholder until AIML pushes real scores...');

    await prisma.city.create({
      data: {
        districtId: created.aizawlDistrict.id,
        name: 'Aizawl City',
        centerLat: 23.7271,
        centerLng: 92.7176,
        boundaryGeoJson: makeCityBoxAround(23.7271, 92.7176),
        riskScore: 0,
        riskLevel: getRiskLevel(0),
        rainfall: randomRainfall(),
        // computedAt stays null until AIML's first real PUT
      },
    });

    await prisma.city.create({
      data: {
        districtId: created.shillongDistrict.id,
        name: 'Shillong City',
        centerLat: 25.5788,
        centerLng: 91.8933,
        boundaryGeoJson: makeCityBoxAround(25.5788, 91.8933),
        riskScore: 0,
        riskLevel: getRiskLevel(0),
        rainfall: randomRainfall(),
      },
    });

    console.log('Seeded 2 pilot city rows.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
