"""
GEE Fetcher — pulls geospatial features from Google Earth Engine.

Organised into three refresh tiers:

  Tier 1 (Static)   — DEM derivatives, soil composition, land use
  Tier 2 (Periodic) — NDVI, vegetation cover
  Tier 3 (Realtime) — Precipitation (24h/3d/7d), soil moisture, soil saturation

Each tier has its own entry-point function that accepts a grid DataFrame
and returns a DataFrame with the sampled feature columns.
"""

import logging
from datetime import datetime, timedelta, timezone

import ee
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════════════════════
# GEE Dataset IDs
# ══════════════════════════════════════════════════════════════════════════════

SRTM = "USGS/SRTMGL1_003"
CLAY = "OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02"
SAND = "OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02"
WORLDCOVER = "ESA/WorldCover/v200"

NDVI_MODIS = "MODIS/061/MOD13Q1"
VEG_MODIS = "MODIS/061/MOD44B"

GSMAP_PRIMARY = "JAXA/GPM_L3/GSMaP/v8/operational"
GSMAP_FALLBACK = "JAXA/GPM_L3/GSMaP/v6/operational"
IMERG_FALLBACK = "NASA/GPM_L3/IMERG_V07"

SMAP_PRIMARY = "NASA/SMAP/SPL4SMGP/007"
SMAP_NASA_USDA = "NASA_USDA/HSL/SMAP10KM_soil_moisture"

# ══════════════════════════════════════════════════════════════════════════════
# Sampling scale (metres) — matches the coarsest native resolution per tier
# to avoid wasting EECU on unnecessary oversampling.
# ══════════════════════════════════════════════════════════════════════════════

STATIC_SCALE = 30       # SRTM native
PERIODIC_SCALE = 250    # MODIS native
REALTIME_SCALE = 11132  # GSMaP native (~0.1°)

# Maximum points per sampleRegions call before batching.
_BATCH_SIZE = 2500


# ══════════════════════════════════════════════════════════════════════════════
# Internal helpers
# ══════════════════════════════════════════════════════════════════════════════

def _grid_to_fc(grid_df: pd.DataFrame) -> ee.FeatureCollection:
    """
    Convert a grid DataFrame → ee.FeatureCollection.

    Each Feature carries ``grid_idx``, ``Latitude``, ``Longitude`` properties
    so that point identity is preserved after server-side operations.
    """
    features = []
    for i, (_, row) in enumerate(grid_df.iterrows()):
        pt = ee.Geometry.Point([float(row["Longitude"]), float(row["Latitude"])])
        features.append(ee.Feature(pt, {
            "grid_idx": i,
            "Latitude": float(row["Latitude"]),
            "Longitude": float(row["Longitude"]),
        }))
    return ee.FeatureCollection(features)


def _sample_image(
    image: ee.Image,
    points_fc: ee.FeatureCollection,
    scale: int,
    expected_count: int,
) -> pd.DataFrame:
    """
    Sample *image* at every point in *points_fc* and return a DataFrame.

    Uses ``sampleRegions`` for a single server-side call.  Points that fall
    in masked / NoData pixels are preserved by ``unmask(0)`` so the output
    always has *expected_count* rows (assuming no GEE-side errors).
    """
    # unmask fills NoData with 0 — prevents point-dropping in sampleRegions
    sampled = image.unmask(0).sampleRegions(
        collection=points_fc,
        scale=scale,
        geometries=False,
    )

    try:
        result = sampled.getInfo()
    except Exception as exc:
        logger.error(f"sampleRegions().getInfo() failed: {exc}")
        raise

    if not result or "features" not in result:
        logger.warning("sampleRegions returned an empty result")
        return pd.DataFrame()

    records = [f["properties"] for f in result["features"]]
    df = pd.DataFrame(records)

    # Restore original grid order
    if "grid_idx" in df.columns:
        df = df.sort_values("grid_idx").reset_index(drop=True)

    return df


def _try_collection(dataset_id: str) -> ee.ImageCollection:
    """
    Attempt to load an ImageCollection, raising on failure.

    This doesn't actually hit the server — just constructs the reference.
    Errors surface later when ``.getInfo()`` is called.
    """
    return ee.ImageCollection(dataset_id)


# ══════════════════════════════════════════════════════════════════════════════
# Tier 1 — Static features
# ══════════════════════════════════════════════════════════════════════════════

def fetch_static_features(grid_df: pd.DataFrame) -> pd.DataFrame:
    """
    Fetch features that never change (DEM, soil, land use).

    Returned columns
    ----------------
    grid_idx, Latitude, Longitude,
    Elevation_m, Slope_Angle, Aspect,
    Clay_Content, Sand_Content, Silt_Content,
    Land_Use_Urban, Land_Use_Forest, Land_Use_Agriculture
    """
    logger.info(f"[Tier 1 / Static] Sampling {len(grid_df)} points …")
    fc = _grid_to_fc(grid_df)

    # ── DEM derivatives ───────────────────────────────────────────────────
    dem = ee.Image(SRTM)
    elevation = dem.select("elevation").rename("Elevation_m")
    slope = ee.Terrain.slope(dem).rename("Slope_Angle")
    aspect = ee.Terrain.aspect(dem).rename("Aspect")

    # ── Soil texture (OpenLandMap, 0 cm depth) ────────────────────────────
    clay = ee.Image(CLAY).select("b0")
    sand = ee.Image(SAND).select("b0")
    silt = ee.Image.constant(100).subtract(clay).subtract(sand)

    clay = clay.rename("Clay_Content").toFloat()
    sand = sand.rename("Sand_Content").toFloat()
    silt = silt.rename("Silt_Content").toFloat()

    # ── Land use (ESA WorldCover 2021, 10 m) ──────────────────────────────
    wc = ee.ImageCollection(WORLDCOVER).first().select("Map")
    lu_urban = wc.eq(50).rename("Land_Use_Urban").toUint8()
    lu_forest = wc.eq(10).rename("Land_Use_Forest").toUint8()
    lu_agri = wc.eq(40).rename("Land_Use_Agriculture").toUint8()

    # ── Stack & sample ────────────────────────────────────────────────────
    stack = ee.Image.cat([
        elevation, slope, aspect,
        clay, sand, silt,
        lu_urban, lu_forest, lu_agri,
    ])

    df = _sample_image(stack, fc, STATIC_SCALE, len(grid_df))

    logger.info(f"[Tier 1 / Static] Done — {len(df)} rows, columns: {list(df.columns)}")
    return df


# ══════════════════════════════════════════════════════════════════════════════
# Tier 2 — Periodic features
# ══════════════════════════════════════════════════════════════════════════════

def fetch_periodic_features(grid_df: pd.DataFrame) -> pd.DataFrame:
    """
    Fetch NDVI and vegetation cover from the most recent MODIS composites.

    Returned columns
    ----------------
    grid_idx, Latitude, Longitude,
    NDVI_Index, Vegetation_Cover
    """
    logger.info(f"[Tier 2 / Periodic] Sampling {len(grid_df)} points …")
    fc = _grid_to_fc(grid_df)

    # ── NDVI (MODIS MOD13Q1, 16-day composite, 250 m) ────────────────────
    ndvi_col = ee.ImageCollection(NDVI_MODIS)
    latest_ndvi_img = ndvi_col.sort("system:time_start", False).first()

    # Raw NDVI is scaled by 10 000; multiply by 0.0001 to get [-1, 1]
    ndvi = latest_ndvi_img.select("NDVI").multiply(0.0001).rename("NDVI_Index")

    # Log the composite date for traceability
    try:
        ndvi_date = latest_ndvi_img.date().format("YYYY-MM-dd").getInfo()
        logger.info(f"  Latest NDVI composite: {ndvi_date}")
    except Exception:
        logger.warning("  Could not retrieve NDVI composite date")

    # ── Vegetation cover (MODIS MOD44B, annual, 250 m) ───────────────────
    veg_col = ee.ImageCollection(VEG_MODIS)
    latest_veg_img = veg_col.sort("system:time_start", False).first()

    # Percent_Tree_Cover is 0–100 → scale to 0–1 fraction
    vegetation = (
        latest_veg_img.select("Percent_Tree_Cover")
        .divide(100.0)
        .rename("Vegetation_Cover")
    )

    # ── Stack & sample ────────────────────────────────────────────────────
    stack = ee.Image.cat([ndvi, vegetation])
    df = _sample_image(stack, fc, PERIODIC_SCALE, len(grid_df))

    logger.info(f"[Tier 2 / Periodic] Done — {len(df)} rows")
    return df


# ══════════════════════════════════════════════════════════════════════════════
# Tier 3 — Realtime features
# ══════════════════════════════════════════════════════════════════════════════

def fetch_realtime_features(grid_df: pd.DataFrame) -> pd.DataFrame:
    """
    Fetch near-real-time precipitation and soil moisture.

    Returned columns
    ----------------
    grid_idx, Latitude, Longitude,
    Rainfall_mm, Rainfall_3Day, Rainfall_7Day,
    Soil_Moisture_Content, Soil_Saturation
    """
    logger.info(f"[Tier 3 / Realtime] Sampling {len(grid_df)} points …")
    fc = _grid_to_fc(grid_df)

    precip_img = _build_precipitation_image()
    soil_img = _build_soil_moisture_image()

    stack = ee.Image.cat([precip_img, soil_img])
    df = _sample_image(stack, fc, REALTIME_SCALE, len(grid_df))

    logger.info(f"[Tier 3 / Realtime] Done — {len(df)} rows")
    return df


# ── Precipitation helpers ─────────────────────────────────────────────────

def _build_precipitation_image() -> ee.Image:
    """
    Build a 3-band precipitation image (24 h, 3 d, 7 d cumulative mm).

    Tries GSMaP v8 → GSMaP v6 → IMERG V07, using whichever has data.
    """
    now = datetime.now(timezone.utc)
    end_str = now.strftime("%Y-%m-%dT%H:%M:%S")

    # Date strings for the three rolling windows
    start_24h = (now - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")
    start_3d = (now - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%S")
    start_7d = (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S")

    # ── Try GSMaP (primary: ~4 h latency) ─────────────────────────────
    for dataset_id, band in [
        (GSMAP_PRIMARY, "hourlyPrecipRateGC"),
        (GSMAP_FALLBACK, "hourlyPrecipRateGC"),
    ]:
        try:
            col = ee.ImageCollection(dataset_id)
            # Quick check: does the collection have images in the 7-day window?
            count = col.filterDate(start_7d, end_str).size().getInfo()
            if count == 0:
                logger.info(f"  {dataset_id}: 0 images in 7-day window, trying next …")
                continue

            logger.info(f"  Using {dataset_id} ({count} images in 7-day window)")

            # GSMaP hourlyPrecipRateGC is mm/hr; each image = 1 hour → sum = total mm
            rain_24h = (
                col.filterDate(start_24h, end_str).select(band)
                .sum().rename("Rainfall_mm")
            )
            rain_3d = (
                col.filterDate(start_3d, end_str).select(band)
                .sum().rename("Rainfall_3Day")
            )
            rain_7d = (
                col.filterDate(start_7d, end_str).select(band)
                .sum().rename("Rainfall_7Day")
            )
            return ee.Image.cat([rain_24h, rain_3d, rain_7d])

        except Exception as exc:
            logger.warning(f"  {dataset_id} failed: {exc}")
            continue

    # ── Fallback: IMERG V07 (high latency, but wide availability) ─────
    logger.info(f"  GSMaP unavailable — falling back to IMERG")
    try:
        col = ee.ImageCollection(IMERG_FALLBACK)
        band = "precipitation"

        # IMERG uses the MOST RECENT available date (could be months old)
        latest = col.sort("system:time_start", False).first()
        latest_date = latest.date()

        end_date = latest_date.advance(1, "day")
        start_24h_ee = latest_date
        start_3d_ee = latest_date.advance(-3, "day")
        start_7d_ee = latest_date.advance(-7, "day")

        logger.info(f"  IMERG latest date: {latest_date.format('YYYY-MM-dd').getInfo()}")

        # IMERG precipitation is mm/hr for 30-min intervals → multiply by 0.5
        rain_24h = (
            col.filterDate(start_24h_ee, end_date).select(band)
            .sum().multiply(0.5).rename("Rainfall_mm")
        )
        rain_3d = (
            col.filterDate(start_3d_ee, end_date).select(band)
            .sum().multiply(0.5).rename("Rainfall_3Day")
        )
        rain_7d = (
            col.filterDate(start_7d_ee, end_date).select(band)
            .sum().multiply(0.5).rename("Rainfall_7Day")
        )
        return ee.Image.cat([rain_24h, rain_3d, rain_7d])

    except Exception as exc:
        logger.error(f"  All precipitation sources failed: {exc}")
        # Return zeros so the pipeline doesn't crash
        zero = ee.Image.constant(0).toFloat()
        return ee.Image.cat([
            zero.rename("Rainfall_mm"),
            zero.rename("Rainfall_3Day"),
            zero.rename("Rainfall_7Day"),
        ])


# ── Soil moisture helpers ─────────────────────────────────────────────────

def _build_soil_moisture_image() -> ee.Image:
    """
    Build a 2-band soil image: moisture content and saturation index.

    Tries SMAP L4 (SPL4SMGP) → NASA-USDA SMAP 10 km, with derivation
    of saturation from moisture if no direct saturation band is available.
    """
    # ── Try SMAP L4 (sm_surface + sm_surface_wetness) ─────────────────
    try:
        col = ee.ImageCollection(SMAP_PRIMARY)
        latest = col.sort("system:time_start", False).first()

        smap_date = latest.date().format("YYYY-MM-dd HH:mm").getInfo()
        logger.info(f"  SMAP L4 latest: {smap_date}")

        moisture = latest.select("sm_surface").rename("Soil_Moisture_Content")

        # Try the wetness band; derive if missing
        try:
            band_names = latest.bandNames().getInfo()
            if "sm_surface_wetness" in band_names:
                saturation = latest.select("sm_surface_wetness").rename("Soil_Saturation")
            else:
                logger.info("  sm_surface_wetness not found — deriving from sm_surface / 0.45")
                saturation = moisture.divide(0.45).min(ee.Image.constant(1.0)).rename("Soil_Saturation")
        except Exception:
            saturation = moisture.divide(0.45).min(ee.Image.constant(1.0)).rename("Soil_Saturation")

        return ee.Image.cat([moisture, saturation])

    except Exception as exc:
        logger.warning(f"  SMAP L4 failed ({exc}), trying NASA-USDA …")

    # ── Fallback: NASA-USDA SMAP 10 km ────────────────────────────────
    try:
        col = ee.ImageCollection(SMAP_NASA_USDA)
        latest = col.sort("system:time_start", False).first()

        smap_date = latest.date().format("YYYY-MM-dd").getInfo()
        logger.info(f"  NASA-USDA SMAP latest: {smap_date}")

        # ssm = surface soil moisture (mm); normalise to ~0–1 range
        # Typical top-layer moisture is 0–50 mm; dividing by 50 gives fraction
        moisture = latest.select("ssm").divide(50.0).rename("Soil_Moisture_Content")
        # Derive saturation (moisture / typical porosity)
        saturation = moisture.divide(0.45).min(ee.Image.constant(1.0)).rename("Soil_Saturation")

        return ee.Image.cat([moisture, saturation])

    except Exception as exc:
        logger.error(f"  All soil moisture sources failed: {exc}")
        zero = ee.Image.constant(0).toFloat()
        return ee.Image.cat([
            zero.rename("Soil_Moisture_Content"),
            zero.rename("Soil_Saturation"),
        ])
