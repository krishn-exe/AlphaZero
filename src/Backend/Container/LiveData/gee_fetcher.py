"""
GEE Fetcher -- pulls geospatial features from Google Earth Engine.

Organised into three refresh tiers:

  Tier 1 (Static)   -- DEM derivatives, soil composition, soil pH, water proximity, land use
  Tier 2 (Periodic) -- NDVI, Fractional Vegetation Cover (FVC)
  Tier 3 (Realtime) -- Precipitation (24h/3d), soil moisture/saturation, ambient/soil temperature, humidity

Each tier has its own entry-point function that accepts a grid DataFrame
and returns a DataFrame with the sampled feature columns.
"""

import logging
from datetime import datetime, timedelta, timezone

import ee
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ==============================================================================
# GEE Dataset IDs
# ==============================================================================

SRTM = "USGS/SRTMGL1_003"
CLAY = "OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02"
SAND = "OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02"
SOIL_PH = "OpenLandMap/SOL/SOL_PH-H2O_USDA-4C1A2A_M/v02"
WORLDCOVER = "ESA/WorldCover/v200"

NDVI_MODIS = "MODIS/061/MOD13Q1"

GSMAP_PRIMARY = "JAXA/GPM_L3/GSMaP/v8/operational"
GSMAP_FALLBACK = "JAXA/GPM_L3/GSMaP/v6/operational"
IMERG_FALLBACK = "NASA/GPM_L3/IMERG_V07"

SMAP_PRIMARY = "NASA/SMAP/SPL4SMGP/008"
SMAP_NASA_USDA = "NASA_USDA/HSL/SMAP10KM_soil_moisture"

GFS_WEATHER = "NOAA/GFS0P25"

# ==============================================================================
# Sampling scale (metres)
# ==============================================================================

STATIC_SCALE = 30       # SRTM / ESA native
PERIODIC_SCALE = 250    # MODIS native
REALTIME_SCALE = 11132  # GSMaP / SMAP native (~0.1 deg)

# Maximum points per sampleRegions call before batching.
_BATCH_SIZE = 2500


# ==============================================================================
# Internal helpers
# ==============================================================================

def _grid_to_fc(grid_df: pd.DataFrame) -> ee.FeatureCollection:
    """
    Convert a grid DataFrame (with Latitude, Longitude) into an ee.FeatureCollection.

    Attaches a ``grid_idx`` property to every feature so results can be
    deterministically joined back to the original DataFrame rows.
    """
    features = []
    for idx, row in grid_df.iterrows():
        geom = ee.Geometry.Point([float(row["Longitude"]), float(row["Latitude"])])
        feat = ee.Feature(geom, {"grid_idx": int(idx)})
        features.append(feat)
    return ee.FeatureCollection(features)


def _sample_image(
    image: ee.Image,
    points_fc: ee.FeatureCollection,
    scale: int,
    expected_count: int,
) -> pd.DataFrame:
    """
    Sample a multi-band ee.Image at the locations in points_fc.

    Handles batching if the point count exceeds _BATCH_SIZE.
    Uses unmask(0) to ensure points in NoData areas are never dropped.
    """
    if expected_count <= _BATCH_SIZE:
        sampled = image.unmask(0).sampleRegions(
            collection=points_fc,
            scale=scale,
            geometries=False,
        )
        return _fc_to_df(sampled)

    logger.info(f"  Batching {expected_count} points in chunks of {_BATCH_SIZE} ...")
    fc_list = points_fc.toList(expected_count)
    frames = []

    for start in range(0, expected_count, _BATCH_SIZE):
        chunk_size = min(_BATCH_SIZE, expected_count - start)
        sub_fc = ee.FeatureCollection(fc_list.slice(start, start + chunk_size))
        sampled = image.unmask(0).sampleRegions(
            collection=sub_fc,
            scale=scale,
            geometries=False,
        )
        chunk_df = _fc_to_df(sampled)
        frames.append(chunk_df)

    combined = pd.concat(frames, ignore_index=True)
    if "grid_idx" in combined.columns:
        combined = combined.sort_values("grid_idx").reset_index(drop=True)
    return combined


def _fc_to_df(fc: ee.FeatureCollection) -> pd.DataFrame:
    """Convert an ee.FeatureCollection with properties into a pandas DataFrame."""
    try:
        raw = fc.getInfo()
    except Exception as exc:
        logger.error(f"Failed to retrieve FeatureCollection from GEE: {exc}")
        return pd.DataFrame()

    rows = []
    for f in raw.get("features", []):
        props = f.get("properties", {})
        rows.append(props)

    df = pd.DataFrame(rows)
    if "grid_idx" in df.columns:
        df["grid_idx"] = df["grid_idx"].astype(int)
        df = df.sort_values("grid_idx").reset_index(drop=True)
    return df


# ==============================================================================
# Tier 1 -- Static features
# ==============================================================================

def fetch_static_features(grid_df: pd.DataFrame) -> pd.DataFrame:
    """
    Fetch features that never change (DEM, soil texture, soil pH, water proximity, land use).

    Returned columns
    ----------------
    grid_idx, Latitude, Longitude,
    Elevation_m, Slope_Angle, Aspect,
    Clay_Content, Sand_Content, Silt_Content, Soil_pH,
    Proximity_to_Water,
    Land_Use_Urban, Land_Use_Forest, Land_Use_Agriculture
    """
    logger.info(f"[Tier 1 / Static] Sampling {len(grid_df)} points ...")
    fc = _grid_to_fc(grid_df)

    # -- DEM derivatives ---------------------------------------------------
    dem = ee.Image(SRTM)
    elevation = dem.select("elevation").rename("Elevation_m")
    slope = ee.Terrain.slope(dem).rename("Slope_Angle")
    aspect = ee.Terrain.aspect(dem).rename("Aspect")

    # -- Soil texture & pH (OpenLandMap, 0 cm depth) -----------------------
    clay = ee.Image(CLAY).select("b0")
    sand = ee.Image(SAND).select("b0")
    silt = ee.Image.constant(100).subtract(clay).subtract(sand)

    clay = clay.rename("Clay_Content").toFloat()
    sand = sand.rename("Sand_Content").toFloat()
    silt = silt.rename("Silt_Content").toFloat()

    soil_ph = (
        ee.Image(SOIL_PH)
        .select("b0")
        .multiply(0.1)
        .toFloat()
        .rename("Soil_pH")
    )

    # -- Land use & Water Proximity (ESA WorldCover 2021, 10 m) ------------
    wc = ee.ImageCollection(WORLDCOVER).first().select("Map")
    lu_urban = wc.eq(50).rename("Land_Use_Urban").toUint8()
    lu_forest = wc.eq(10).rename("Land_Use_Forest").toUint8()
    lu_agri = wc.eq(40).rename("Land_Use_Agriculture").toUint8()

    # Water proximity (class 80 = water): 1.0 at water edge, decaying to 0.0 at 5km
    water = wc.eq(80)
    water_dist = water.distance(ee.Kernel.euclidean(5000, "meters"), False)
    proximity_water = (
        ee.Image.constant(1.0)
        .subtract(water_dist.divide(5000.0))
        .clamp(0.0, 1.0)
        .rename("Proximity_to_Water")
    )

    # -- Stack & sample ----------------------------------------------------
    stack = ee.Image.cat([
        elevation, slope, aspect,
        clay, sand, silt, soil_ph,
        proximity_water,
        lu_urban, lu_forest, lu_agri,
    ])

    df = _sample_image(stack, fc, STATIC_SCALE, len(grid_df))

    logger.info(f"[Tier 1 / Static] Done -- {len(df)} rows, columns: {list(df.columns)}")
    return df


# ==============================================================================
# Tier 2 -- Periodic features
# ==============================================================================

def fetch_periodic_features(grid_df: pd.DataFrame) -> pd.DataFrame:
    """
    Fetch NDVI and Fractional Vegetation Cover (FVC) from MODIS composites.

    Returned columns
    ----------------
    grid_idx, Latitude, Longitude,
    NDVI_Index, Vegetation_Cover
    """
    logger.info(f"[Tier 2 / Periodic] Sampling {len(grid_df)} points ...")
    fc = _grid_to_fc(grid_df)

    # -- NDVI (MODIS MOD13Q1, 16-day composite, 250 m) --------------------
    ndvi_col = ee.ImageCollection(NDVI_MODIS)
    latest_ndvi_img = ndvi_col.sort("system:time_start", False).first()

    # Raw NDVI is scaled by 10 000; multiply by 0.0001 to get [-1, 1]
    ndvi = latest_ndvi_img.select("NDVI").multiply(0.0001).rename("NDVI_Index")

    try:
        ndvi_date = latest_ndvi_img.date().format("YYYY-MM-dd").getInfo()
        logger.info(f"  Latest NDVI composite: {ndvi_date}")
    except Exception:
        logger.warning("  Could not retrieve NDVI composite date")

    # -- Fractional Vegetation Cover (FVC) derived from NDVI ---------------
    # Formula: FVC = clamp((NDVI - 0.05) / (0.85 - 0.05), 0.0, 1.0)
    vegetation = (
        ndvi.subtract(0.05)
        .divide(0.80)
        .clamp(0.0, 1.0)
        .rename("Vegetation_Cover")
    )

    # -- Stack & sample ----------------------------------------------------
    stack = ee.Image.cat([ndvi, vegetation])
    df = _sample_image(stack, fc, PERIODIC_SCALE, len(grid_df))

    logger.info(f"[Tier 2 / Periodic] Done -- {len(df)} rows")
    return df


# ==============================================================================
# Tier 3 -- Realtime features
# ==============================================================================

def fetch_realtime_features(grid_df: pd.DataFrame) -> pd.DataFrame:
    """
    Fetch near-real-time precipitation, soil moisture/saturation, temperature, and humidity.

    Returned columns
    ----------------
    grid_idx, Latitude, Longitude,
    Rainfall_mm, Rainfall_3Day,
    Soil_Moisture_Content, Soil_Saturation,
    Temperature_C, Humidity_percent, Soil_Temperature_C
    """
    logger.info(f"[Tier 3 / Realtime] Sampling {len(grid_df)} points ...")
    fc = _grid_to_fc(grid_df)

    precip_img = _build_precipitation_image()
    soil_img = _build_soil_moisture_image()
    weather_img = _build_weather_image()

    stack = ee.Image.cat([precip_img, soil_img, weather_img])
    df = _sample_image(stack, fc, REALTIME_SCALE, len(grid_df))

    logger.info(f"[Tier 3 / Realtime] Done -- {len(df)} rows")
    return df


# -- Precipitation helpers -------------------------------------------------

def _build_precipitation_image() -> ee.Image:
    """
    Build a 2-band precipitation image (24 h, 3 d cumulative mm).

    Tries GSMaP v8 -> GSMaP v6 -> IMERG V07, using whichever has data.
    """
    for dataset_id, band in [
        (GSMAP_PRIMARY, "hourlyPrecipRateGC"),
        (GSMAP_FALLBACK, "hourlyPrecipRateGC"),
    ]:
        try:
            col = ee.ImageCollection(dataset_id)
            latest = col.sort("system:time_start", False).first()
            latest_date = latest.date()
            latest_date_str = latest_date.format("YYYY-MM-dd HH:mm").getInfo()

            end_date = latest_date.advance(1, "hour")
            start_24h_ee = latest_date.advance(-24, "hour")
            start_3d_ee = latest_date.advance(-72, "hour")

            logger.info(f"  Using {dataset_id} (latest pass: {latest_date_str})")

            # GSMaP hourlyPrecipRateGC is mm/hr; each image = 1 hour -> sum = total mm
            rain_24h = (
                col.filterDate(start_24h_ee, end_date).select(band)
                .sum().rename("Rainfall_mm")
            )
            rain_3d = (
                col.filterDate(start_3d_ee, end_date).select(band)
                .sum().rename("Rainfall_3Day")
            )
            return ee.Image.cat([rain_24h, rain_3d])

        except Exception as exc:
            logger.warning(f"  {dataset_id} failed: {exc}")
            continue

    # -- Fallback: IMERG V07 -------------------------------------------
    logger.info("  GSMaP unavailable -- falling back to IMERG")
    try:
        col = ee.ImageCollection(IMERG_FALLBACK)
        band = "precipitation"

        latest = col.sort("system:time_start", False).first()
        latest_date = latest.date()

        end_date = latest_date.advance(1, "day")
        start_24h_ee = latest_date
        start_3d_ee = latest_date.advance(-3, "day")

        logger.info(f"  IMERG latest date: {latest_date.format('YYYY-MM-dd').getInfo()}")

        rain_24h = (
            col.filterDate(start_24h_ee, end_date).select(band)
            .sum().multiply(0.5).rename("Rainfall_mm")
        )
        rain_3d = (
            col.filterDate(start_3d_ee, end_date).select(band)
            .sum().multiply(0.5).rename("Rainfall_3Day")
        )
        return ee.Image.cat([rain_24h, rain_3d])

    except Exception as exc:
        logger.error(f"  All precipitation sources failed: {exc}")
        zero = ee.Image.constant(0).toFloat()
        return ee.Image.cat([
            zero.rename("Rainfall_mm"),
            zero.rename("Rainfall_3Day"),
        ])


# -- Soil moisture & temperature helpers -----------------------------------

def _build_soil_moisture_image() -> ee.Image:
    """
    Build a 3-band soil image: moisture content, saturation index, and soil temperature.
    """
    # -- Try SMAP L4 (sm_surface + sm_surface_wetness + soil_temp_layer1) --
    try:
        col = ee.ImageCollection(SMAP_PRIMARY)
        latest = col.sort("system:time_start", False).first()

        smap_date = latest.date().format("YYYY-MM-dd HH:mm").getInfo()
        logger.info(f"  SMAP L4 latest: {smap_date}")

        moisture = latest.select("sm_surface").rename("Soil_Moisture_Content")
        soil_temp = latest.select("soil_temp_layer1").subtract(273.15).rename("Soil_Temperature_C")

        try:
            band_names = latest.bandNames().getInfo()
            if "sm_surface_wetness" in band_names:
                saturation = latest.select("sm_surface_wetness").rename("Soil_Saturation")
            else:
                saturation = moisture.divide(0.45).min(ee.Image.constant(1.0)).rename("Soil_Saturation")
        except Exception:
            saturation = moisture.divide(0.45).min(ee.Image.constant(1.0)).rename("Soil_Saturation")

        return ee.Image.cat([moisture, saturation, soil_temp])

    except Exception as exc:
        logger.warning(f"  SMAP L4 failed ({exc}), trying NASA-USDA ...")

    # -- Fallback: NASA-USDA SMAP 10 km --------------------------------
    try:
        col = ee.ImageCollection(SMAP_NASA_USDA)
        latest = col.sort("system:time_start", False).first()

        smap_date = latest.date().format("YYYY-MM-dd").getInfo()
        logger.info(f"  NASA-USDA SMAP latest: {smap_date}")

        moisture = latest.select("ssm").divide(50.0).rename("Soil_Moisture_Content")
        saturation = moisture.divide(0.45).min(ee.Image.constant(1.0)).rename("Soil_Saturation")
        soil_temp = ee.Image.constant(22.0).toFloat().rename("Soil_Temperature_C")

        return ee.Image.cat([moisture, saturation, soil_temp])

    except Exception as exc:
        logger.error(f"  All soil moisture sources failed: {exc}")
        zero = ee.Image.constant(0).toFloat()
        return ee.Image.cat([
            zero.rename("Soil_Moisture_Content"),
            zero.rename("Soil_Saturation"),
            zero.rename("Soil_Temperature_C"),
        ])


def _build_weather_image() -> ee.Image:
    """
    Build a 2-band ambient weather image: Temperature_C and Humidity_percent from NOAA GFS.
    """
    try:
        now = datetime.now(timezone.utc)
        start_7d = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end_1d = (now + timedelta(days=1)).strftime("%Y-%m-%d")

        col = ee.ImageCollection(GFS_WEATHER).filterDate(start_7d, end_1d)
        latest = col.sort("system:time_start", False).first()

        gfs_date = latest.date().format("YYYY-MM-dd HH:mm").getInfo()
        logger.info(f"  NOAA GFS latest: {gfs_date}")

        # GFS temperature_2m_above_ground is in deg C directly
        temp_c = latest.select("temperature_2m_above_ground").rename("Temperature_C")
        humidity = latest.select("relative_humidity_2m_above_ground").rename("Humidity_percent")

        return ee.Image.cat([temp_c, humidity])

    except Exception as exc:
        logger.warning(f"  NOAA GFS weather failed ({exc}) -- using ambient defaults")
        return ee.Image.cat([
            ee.Image.constant(24.0).toFloat().rename("Temperature_C"),
            ee.Image.constant(75.0).toFloat().rename("Humidity_percent"),
        ])
