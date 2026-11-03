import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";

import { HeatmapLayer } from "../../utils/leafletHeat";
import "./heatmap.css";

/* =====================================================
   GEOCODER COMPONENT
===================================================== */
function Geocoder({ position = "topright" }) {
  const map = useMap();

  useEffect(() => {
    const control = L.Control.geocoder({
      defaultMarkGeocode: true,
      position,
    }).addTo(map);

    return () => {
      map.removeControl(control);
    };
  }, [map, position]);

  return null;
}

/* =====================================================
   MAIN HEATMAP COMPONENT
===================================================== */
function Heatmap() {
  const { t, i18n } = useTranslation();

  // Heatmap Controls State (Matches Image 2 GIS controls)
  const [radius, setRadius] = useState(28);
  const [opacity, setOpacity] = useState(0.85);
  const [blur, setBlur] = useState(18);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showHotspots, setShowHotspots] = useState(false);
  const [showDistricts, setShowDistricts] = useState(true);

  // Data states
  const [heatData, setHeatData] = useState(null); // { updatedAt, slot, stats, points: [[lat, lng, risk], ...] }
  const [districtGeoJson, setDistrictGeoJson] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_URL =
    import.meta.env.VITE_API_URL ||
    ("".replace(/\/+$/, "")); // Empty default resolves to current origin

  /* =====================================================
     FETCH REAL AGGREGATED HEATMAP PREDICTIONS & BOUNDARIES
  ===================================================== */
  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch the real aggregated AI predictions (generated after collision handling & averaging)
        const heatRes = await fetch(`${API_URL}/api/predictions/heatmap`, {
          signal: controller.signal,
        });

        if (!heatRes.ok) {
          throw new Error(`Failed to load predictions: ${heatRes.status}`);
        }

        const heatJson = await heatRes.json();
        setHeatData(heatJson);

        // 2. Fetch district boundary geometries for reference outlines
        try {
          const districtRes = await fetch(`${API_URL}/api/map/national`, {
            signal: controller.signal,
          });
          if (districtRes.ok) {
            const geoJson = await districtRes.json();
            if (geoJson?.type === "FeatureCollection") {
              setDistrictGeoJson(geoJson);
            }
          }
        } catch (geoErr) {
          console.warn("Could not load district boundary outlines:", geoErr);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Heatmap data load error:", err);
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();

    return () => {
      controller.abort();
    };
  }, [API_URL]);

  /* =====================================================
     CALCULATE METRICS & CRITICAL HOTSPOTS
  ===================================================== */
  const metrics = useMemo(() => {
    if (!heatData?.points || heatData.points.length === 0) {
      return {
        total: 0,
        maxRisk: 0,
        avgRisk: 0,
        criticalCount: 0,
        highCount: 0,
        moderateCount: 0,
        lowCount: 0,
        hotspots: [],
      };
    }

    let maxRisk = 0;
    let sumRisk = 0;
    let criticalCount = 0; // >= 0.75
    let highCount = 0;     // 0.50 - 0.74
    let moderateCount = 0; // 0.25 - 0.49
    let lowCount = 0;      // < 0.25
    const hotspots = [];

    for (let i = 0; i < heatData.points.length; i++) {
      const p = heatData.points[i];
      const risk = p[2];
      sumRisk += risk;
      if (risk > maxRisk) maxRisk = risk;

      if (risk >= 0.75) {
        criticalCount++;
        hotspots.push(p);
      } else if (risk >= 0.5) {
        highCount++;
        if (risk >= 0.70) hotspots.push(p);
      } else if (risk >= 0.25) {
        moderateCount++;
      } else {
        lowCount++;
      }
    }

    const total = heatData.points.length;
    const avgRisk = total > 0 ? (sumRisk / total) : 0;

    return {
      total,
      maxRisk: Number(maxRisk.toFixed(4)),
      avgRisk: Number(avgRisk.toFixed(4)),
      criticalCount,
      highCount,
      moderateCount,
      lowCount,
      hotspots: hotspots.slice(0, 50), // top critical hotspots for markers
    };
  }, [heatData]);

  /* =====================================================
     DISTRICT REFERENCE OUTLINES STYLE
  ===================================================== */
  const districtStyle = {
    color: "#475569",
    weight: 1,
    fillColor: "#0f172a",
    fillOpacity: 0.05,
    dashArray: "3, 3",
  };

  const onEachDistrict = (feature, layer) => {
    const props = feature.properties || {};
    const districtName = t(`districts.${props.name}`, { defaultValue: props.name || "District" });
    const stateName = t(`states.${props.state}`, { defaultValue: props.state || "" });

    layer.on("mouseover", () => {
      layer.setStyle({
        weight: 2,
        color: "#38bdf8",
        fillOpacity: 0.12,
        dashArray: "",
      });
    });

    layer.on("mouseout", () => {
      layer.setStyle(districtStyle);
    });

    layer.bindTooltip(`
      <div style="font-family: Arial, sans-serif; min-width: 110px;">
        <strong>${districtName}</strong><br/>
        <span style="color:#94a3b8; font-size:12px;">${stateName}</span>
      </div>
    `);
  };

  const resetControls = () => {
    setRadius(28);
    setOpacity(0.85);
    setBlur(18);
    setShowHeatmap(true);
    setShowHotspots(false);
  };

  return (
    <section style={{ width: "100%", background: "#09090b", padding: "24px 0" }}>
      {/* TITLE & HEADER */}
      <div style={{ maxWidth: "1400px", margin: "0 auto 18px", padding: "0 20px" }}>
        <p
          style={{
            color: "#22c55e",
            fontSize: "12px",
            letterSpacing: "2px",
            fontWeight: "700",
            marginBottom: "6px",
          }}
        >
          {t('heatmap.liveMonitoring', 'LIVE MONITORING')}
        </p>

        <h2 style={{ color: "#f8fafc", fontSize: "32px", margin: "0" }}>
          {t('heatmap.title', 'Landslide Risk Heatmap')}
        </h2>

        <p style={{ color: "#94a3b8", marginTop: "8px", marginBottom: "0" }}>
          {t('heatmap.subtitle', 'Real-time landslide risk monitoring across Northeast India.')}
        </p>
      </div>

      {/* MAP CONTAINER */}
      <div className="heatmap-wrapper">
        <MapContainer
          center={[25.7, 92.2]}
          zoom={8}
          minZoom={6}
          maxZoom={14}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%", zIndex: 1 }}
        >
          {/* Base Map: OpenStreetMap */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Reference District Boundary Outlines */}
          {showDistricts && districtGeoJson && (
            <GeoJSON
              key={`${i18n.language}-${districtGeoJson.features?.length}`}
              data={districtGeoJson}
              style={districtStyle}
              onEachFeature={onEachDistrict}
            />
          )}

          {/* REAL PREDICTION HEATMAP LAYER */}
          {showHeatmap && heatData?.points && heatData.points.length > 0 && (
            <HeatmapLayer
              points={heatData.points}
              radius={radius}
              blur={blur}
              opacity={opacity}
              max={1.0}
            />
          )}

          {/* OPTIONAL CRITICAL HOTSPOTS HIGHLIGHT MARKERS */}
          {showHotspots &&
            metrics.hotspots.map((pt, idx) => (
              <CircleMarker
                key={`hotspot-${idx}`}
                center={[pt[0], pt[1]]}
                radius={7}
                pathOptions={{
                  color: "#ffffff",
                  weight: 2,
                  fillColor: "#ef4444",
                  fillOpacity: 0.95,
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedPoint({ lat: pt[0], lng: pt[1], risk: pt[2] });
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  <div style={{ textAlign: "center", fontSize: "11px" }}>
                    <strong>🚨 Hotspot</strong><br />
                    <span>Risk: <strong>{(pt[2] * 100).toFixed(1)}%</strong></span><br />
                    <small>{pt[0].toFixed(4)}, {pt[1].toFixed(4)}</small>
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}

          <Geocoder position="topright" />
        </MapContainer>

        {/* =====================================================
            FLOATING CONTROLS PANEL (Matches User's Reference Image)
        ===================================================== */}
        <div className="heat-controls-panel">
          <div className="heat-panel-header">
            <h4 className="heat-panel-title">
              <span className="heat-icon">🔥</span> HEAT MAPPING
            </h4>
            <span className="heat-badge-slot">
              {heatData?.slot && heatData.slot !== 'none' ? `Slot: ${heatData.slot}` : 'LIVE'}
            </span>
          </div>

          {/* Radius Slider */}
          <div className="heat-control-group">
            <div className="heat-slider-label">
              <span>Radius</span>
              <span className="heat-slider-val">{radius}px</span>
            </div>
            <input
              type="range"
              min={10}
              max={60}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="heat-slider"
            />
          </div>

          {/* Opacity Slider */}
          <div className="heat-control-group">
            <div className="heat-slider-label">
              <span>Opacity</span>
              <span className="heat-slider-val">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              value={Math.round(opacity * 100)}
              onChange={(e) => setOpacity(Number(e.target.value) / 100)}
              className="heat-slider"
            />
          </div>

          {/* Blur / Diffusion Slider */}
          <div className="heat-control-group">
            <div className="heat-slider-label">
              <span>Blur & Diffusion</span>
              <span className="heat-slider-val">{blur}px</span>
            </div>
            <input
              type="range"
              min={5}
              max={40}
              value={blur}
              onChange={(e) => setBlur(Number(e.target.value))}
              className="heat-slider"
            />
          </div>

          {/* Density Gradient Spectrum */}
          <div className="gradient-bar-container">
            <div className="gradient-bar" />
            <div className="gradient-labels">
              <span>Low (0.0)</span>
              <span>Moderate</span>
              <span>Severe (1.0)</span>
            </div>
          </div>

          {/* Risk Levels Legend (Real Data) */}
          <div className="heat-legend-list">
            <div className="heat-legend-item">
              <div>
                <span className="legend-color-dot" style={{ background: "#ef4444" }} />
                <span>Critical / Severe (&ge; 0.75)</span>
              </div>
              <strong style={{ color: "#ef4444" }}>{metrics.criticalCount}</strong>
            </div>
            <div className="heat-legend-item">
              <div>
                <span className="legend-color-dot" style={{ background: "#f97316" }} />
                <span>High Risk (0.50 – 0.74)</span>
              </div>
              <strong style={{ color: "#f97316" }}>{metrics.highCount}</strong>
            </div>
            <div className="heat-legend-item">
              <div>
                <span className="legend-color-dot" style={{ background: "#eab308" }} />
                <span>Medium (0.25 – 0.49)</span>
              </div>
              <strong style={{ color: "#eab308" }}>{metrics.moderateCount}</strong>
            </div>
            <div className="heat-legend-item">
              <div>
                <span className="legend-color-dot" style={{ background: "#3b82f6" }} />
                <span>Low (&lt; 0.25)</span>
              </div>
              <strong style={{ color: "#38bdf8" }}>{metrics.lowCount}</strong>
            </div>
          </div>

          {/* Layer Toggles */}
          <div className="heat-toggles">
            <label className="heat-toggle-row">
              <span>Heatmap Density Layer</span>
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
              />
            </label>

            <label className="heat-toggle-row">
              <span>District Outlines</span>
              <input
                type="checkbox"
                checked={showDistricts}
                onChange={(e) => setShowDistricts(e.target.checked)}
              />
            </label>

            <label className="heat-toggle-row">
              <span>Highlight Severe Hotspots</span>
              <input
                type="checkbox"
                checked={showHotspots}
                onChange={(e) => setShowHotspots(e.target.checked)}
              />
            </label>

            <button type="button" className="btn-reset-heat" onClick={resetControls}>
              Reset Controls
            </button>
          </div>
        </div>

        {/* TOP RIGHT LIVE STATS CARD */}
        <div className="heat-stats-card">
          <div className="stat-column">
            <span className="stat-label">Model Grid Points</span>
            <span className="stat-val">{metrics.total.toLocaleString()}</span>
          </div>
          <div className="stat-column">
            <span className="stat-label">Max Risk</span>
            <span className={`stat-val ${metrics.maxRisk >= 0.75 ? "critical" : "moderate"}`}>
              {(metrics.maxRisk * 100).toFixed(1)}%
            </span>
          </div>
          <div className="stat-column">
            <span className="stat-label">Avg Saturation</span>
            <span className="stat-val">{(metrics.avgRisk * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* POINT INSPECTOR (When hotspot is clicked) */}
        {selectedPoint && (
          <div className="heat-inspector-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", color: "#38bdf8", fontWeight: "700", letterSpacing: "1px" }}>
                COORDINATE INSPECTOR
              </span>
              <button
                type="button"
                onClick={() => setSelectedPoint(null)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "14px" }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: "13px", color: "#e2e8f0", marginBottom: "6px" }}>
              Latitude: <strong>{selectedPoint.lat.toFixed(6)}</strong><br />
              Longitude: <strong>{selectedPoint.lng.toFixed(6)}</strong>
            </div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: selectedPoint.risk >= 0.75 ? "#ef4444" : "#eab308" }}>
              Risk Rating: {(selectedPoint.risk * 100).toFixed(1)}%
            </div>
          </div>
        )}

        {/* LOADING OVERLAY */}
        {loading && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 1000,
              background: "rgba(15, 23, 42, 0.88)",
              backdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "14px",
              padding: "18px 28px",
              color: "#ffffff",
              fontWeight: "600",
            }}
          >
            {t('heatmap.loading', 'Loading live AI risk heatmap...')}
          </div>
        )}

        {/* ERROR OVERLAY */}
        {error && (
          <div
            style={{
              position: "absolute",
              top: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1000,
              background: "rgba(127, 29, 29, 0.92)",
              backdropFilter: "blur(14px)",
              border: "1px solid rgba(248,113,113,0.5)",
              borderRadius: "12px",
              padding: "14px 22px",
              color: "#ffffff",
              textAlign: "center",
            }}
          >
            <strong>{t('heatmap.error', 'Unable to load live risk data')}</strong>
            <br />
            <small>{error}</small>
          </div>
        )}
      </div>

      {/* BOTTOM SUMMARY STATS */}
      <div
        style={{
          maxWidth: "1400px",
          margin: "18px auto 0",
          padding: "0 20px",
          display: "flex",
          gap: "24px",
          flexWrap: "wrap",
          color: "#94a3b8",
          fontSize: "13px",
        }}
      >
        <span>🔵 Low (&lt;25%): <strong>{metrics.lowCount}</strong></span>
        <span>🟡 Medium (25-49%): <strong>{metrics.moderateCount}</strong></span>
        <span>🟠 High (50-74%): <strong>{metrics.highCount}</strong></span>
        <span>🔴 Critical (&ge;75%): <strong style={{ color: "#ef4444" }}>{metrics.criticalCount}</strong></span>
        <span>📍 Total Averaged Predictions: <strong>{metrics.total.toLocaleString()}</strong></span>
      </div>
    </section>
  );
}

export default Heatmap;
