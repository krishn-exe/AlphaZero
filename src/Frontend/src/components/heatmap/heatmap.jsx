import { useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  useMap,
} from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import { HeatmapLayer } from "../../utils/leafletHeat";
import { NER_DISTRICTS } from "../../data/districts";
import "./heatmap.css";

/* =====================================================
   PROMINENT NORTHEAST REGION KEY CITIES
   Rendered with white ring and bold labels like Image 2
===================================================== */
const NER_KEY_CITIES = [
  { name: "Guwahati", state: "Assam", lat: 26.1445, lng: 91.7362, baseRisk: 0.38 },
  { name: "Shillong", state: "Meghalaya", lat: 25.5788, lng: 91.8933, baseRisk: 0.68 },
  { name: "Aizawl", state: "Mizoram", lat: 23.7271, lng: 92.7176, baseRisk: 0.74 },
  { name: "Itanagar", state: "Arunachal Pradesh", lat: 27.0844, lng: 93.6053, baseRisk: 0.52 },
  { name: "Kohima", state: "Nagaland", lat: 25.6751, lng: 94.1086, baseRisk: 0.61 },
  { name: "Gangtok", state: "Sikkim", lat: 27.3389, lng: 88.6065, baseRisk: 0.46 },
  { name: "Imphal", state: "Manipur", lat: 24.8170, lng: 93.9368, baseRisk: 0.49 },
  { name: "Agartala", state: "Tripura", lat: 23.8315, lng: 91.2868, baseRisk: 0.34 },
  { name: "Silchar", state: "Assam", lat: 24.8333, lng: 92.7789, baseRisk: 0.59 },
  { name: "Tura", state: "Meghalaya", lat: 25.5144, lng: 90.2033, baseRisk: 0.63 },
  { name: "Jorhat", state: "Assam", lat: 26.7509, lng: 94.2037, baseRisk: 0.41 },
  { name: "Dibrugarh", state: "Assam", lat: 27.4728, lng: 94.9120, baseRisk: 0.44 },
];

/**
 * Creates custom HTML marker icon for landmark cities (matching Image 2)
 */
function createCityMarkerIcon(cityName, riskPercent) {
  const riskClass = riskPercent >= 70 ? "critical" : riskPercent >= 50 ? "high" : "";
  const html = `
    <div class="city-marker-content">
      <div class="city-marker-dot"></div>
      <div class="city-marker-label">
        ${cityName}
        <span class="city-marker-score ${riskClass}">${riskPercent}%</span>
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: "city-marker-icon",
    iconSize: [120, 24],
    iconAnchor: [6, 6],
  });
}

/**
 * Map Controller to execute animated flyTo on search selection
 */
function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], 10, {
        duration: 1.5,
        easeLinearity: 0.25,
      });
    }
  }, [target, map]);
  return null;
}

/* =====================================================
   MAIN HEATMAP COMPONENT
===================================================== */
function Heatmap() {
  const { t, i18n } = useTranslation();

  // Data states
  const [heatData, setHeatData] = useState(null);
  const [districtGeoJson, setDistrictGeoJson] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchInputRef = useRef(null);

  const API_URL =
    import.meta.env.VITE_API_URL ||
    ("".replace(/\/+$/, ""));

  /* =====================================================
     FETCH REAL AGGREGATED HEATMAP PREDICTIONS & BOUNDARIES
  ===================================================== */
  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch real aggregated predictions (averaging collisions from ML model)
        const heatRes = await fetch(`${API_URL}/api/predictions/heatmap`, {
          signal: controller.signal,
        });

        if (!heatRes.ok) {
          throw new Error(`Failed to load predictions: ${heatRes.status}`);
        }

        const heatJson = await heatRes.json();
        setHeatData(heatJson);

        // Fetch district boundaries for subtle geographic reference outlines
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
          console.error("Heatmap load error:", err);
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
     SEARCH LIST OF ALL DISTRICTS AND CITIES
  ===================================================== */
  const allSearchableLocations = useMemo(() => {
    const list = [];

    // Add Key Cities
    NER_KEY_CITIES.forEach((c) => {
      list.push({
        id: `city-${c.name}`,
        name: c.name,
        state: c.state,
        lat: c.lat,
        lng: c.lng,
        type: "City",
        baseRisk: c.baseRisk,
      });
    });

    // Add Districts from NER_DISTRICTS
    NER_DISTRICTS.forEach((group) => {
      group.districts.forEach((d) => {
        // Approximate district coordinates from boundary or city
        const matchingFeature = districtGeoJson?.features?.find(
          (f) => f.properties?.name?.toLowerCase() === d.toLowerCase()
        );
        if (matchingFeature && matchingFeature.geometry) {
          let lat = 26.0;
          let lng = 92.0;
          if (matchingFeature.properties?.centerLat && matchingFeature.properties?.centerLng) {
            lat = matchingFeature.properties.centerLat;
            lng = matchingFeature.properties.centerLng;
          }
          list.push({
            id: `district-${d}`,
            name: d,
            state: group.state,
            lat,
            lng,
            type: "District",
            baseRisk: (matchingFeature.properties?.riskScore || 45) / 100,
          });
        }
      });
    });

    return list;
  }, [districtGeoJson]);

  // Filtered search results
  const searchResults = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return allSearchableLocations
      .filter((loc) => loc.name.toLowerCase().includes(q) || loc.state.toLowerCase().includes(q))
      .slice(0, 8);
  }, [searchQuery, allSearchableLocations]);

  // Handle location selection from search
  const handleSelectLocation = (loc) => {
    setSearchQuery(loc.name);
    setIsDropdownOpen(false);
    setSelectedLocation(loc);
    setFlyTarget({ lat: loc.lat, lng: loc.lng });
  };

  /* =====================================================
     DYNAMIC CITY RISK SCORES CALCULATED FROM HEATMAP POINTS
  ===================================================== */
  const citiesWithRisk = useMemo(() => {
    if (!heatData?.points || heatData.points.length === 0) {
      return NER_KEY_CITIES.map((c) => ({
        ...c,
        riskPercent: Math.round(c.baseRisk * 100),
      }));
    }

    return NER_KEY_CITIES.map((city) => {
      // Find nearest prediction points within ~0.35 deg (~35km)
      let sum = 0;
      let count = 0;
      for (let i = 0; i < heatData.points.length; i++) {
        const pt = heatData.points[i];
        const dLat = pt[0] - city.lat;
        const dLng = pt[1] - city.lng;
        const distSq = dLat * dLat + dLng * dLng;
        if (distSq <= 0.12) {
          sum += pt[2];
          count++;
        }
      }

      const calculatedRisk = count > 0 ? (sum / count) : city.baseRisk;
      const riskPercent = Math.round(calculatedRisk * 100);

      return {
        ...city,
        riskPercent,
      };
    });
  }, [heatData]);

  // Subtle clean reference boundaries style
  const districtStyle = {
    color: "#64748b",
    weight: 0.8,
    fillOpacity: 0.02,
    dashArray: "2, 4",
  };

  return (
    <section style={{ width: "100%", background: "#09090b", padding: "24px 0" }}>
      {/* SECTION TITLE & HEADER */}
      <div style={{ maxWidth: "1400px", margin: "0 auto 16px", padding: "0 20px" }}>
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

      {/* MAP WRAPPER */}
      <div className="heatmap-wrapper">
        {/* =====================================================
            SEARCH BAR FEATURE (TOP-CENTER)
        ===================================================== */}
        <div className="map-search-container">
          <div className="map-search-bar">
            <span className="map-search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search district or city in Northeast India (e.g., Shillong, Aizawl, Guwahati)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              className="map-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="map-search-clear"
                onClick={() => {
                  setSearchQuery("");
                  setIsDropdownOpen(false);
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isDropdownOpen && searchResults.length > 0 && (
            <ul className="map-search-dropdown">
              {searchResults.map((loc) => {
                const score = Math.round(loc.baseRisk * 100);
                const isHigh = score >= 50;
                return (
                  <li
                    key={loc.id}
                    className="map-search-item"
                    onClick={() => handleSelectLocation(loc)}
                  >
                    <div>
                      <strong>{loc.name}</strong>
                      <span className="search-item-state">({loc.state})</span>
                    </div>
                    <span
                      className="search-item-risk"
                      style={{
                        background: isHigh ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)",
                        color: isHigh ? "#ef4444" : "#f59e0b",
                      }}
                    >
                      {score}% Risk
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* =====================================================
            LEAFLET MAP
        ===================================================== */}
        <MapContainer
          center={[25.7, 92.2]}
          zoom={8}
          minZoom={6}
          maxZoom={13}
          scrollWheelZoom={true}
          touchZoom={true}
          dragging={true}
          tapHold={false}
          style={{ height: "100%", width: "100%", zIndex: 1 }}
        >
          {/* Animated search fly-to */}
          {flyTarget && <MapFlyTo target={flyTarget} />}

          {/* Base Map: OpenStreetMap */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Reference District Boundary Outlines */}
          {districtGeoJson && (
            <GeoJSON
              key={`${i18n.language}-${districtGeoJson.features?.length}`}
              data={districtGeoJson}
              style={districtStyle}
            />
          )}

          {/* REAL STATIC DENSITY HEATMAP LAYER */}
          {heatData?.points && heatData.points.length > 0 && (
            <HeatmapLayer
              points={heatData.points}
              radius={34}
              blur={22}
              max={1.0}
              opacity={0.84}
            />
          )}

          {/* KEY CITY LABELS & CIRCLES (MATCHING IMAGE 2 REFERENCE) */}
          {citiesWithRisk.map((city) => (
            <Marker
              key={city.name}
              position={[city.lat, city.lng]}
              icon={createCityMarkerIcon(city.name, city.riskPercent)}
              eventHandlers={{
                click: () => {
                  setSelectedLocation({
                    name: city.name,
                    state: city.state,
                    baseRisk: city.riskPercent / 100,
                  });
                },
              }}
            />
          ))}
        </MapContainer>

        {/* =====================================================
            SELECTED LOCATION POPUP CARD (Top-Right)
        ===================================================== */}
        {selectedLocation && (
          <div className="city-selected-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
              <span style={{ fontSize: "10px", color: "#38bdf8", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase" }}>
                LOCATION SELECTED
              </span>
              <button
                type="button"
                onClick={() => setSelectedLocation(null)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "14px", padding: 0 }}
              >
                ✕
              </button>
            </div>
            <h3 style={{ margin: "0 0 2px 0", fontSize: "18px", color: "#ffffff" }}>
              {selectedLocation.name}
            </h3>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>{selectedLocation.state}</span>
            <div style={{ marginTop: "10px", display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "#cbd5e1" }}>Landslide Risk:</span>
              <strong
                style={{
                  fontSize: "20px",
                  color: selectedLocation.baseRisk >= 0.7 ? "#ef4444" : selectedLocation.baseRisk >= 0.5 ? "#f97316" : "#f59e0b",
                }}
              >
                {Math.round(selectedLocation.baseRisk * 100)}%
              </strong>
            </div>
          </div>
        )}

        {/* =====================================================
            BOTTOM HORIZONTAL GRADIENT LEGEND (MATCHING IMAGE 2 REFERENCE)
        ===================================================== */}
        <div className="heat-bottom-legend">
          <div className="heat-legend-title">
            <span>🔥 Landslide Risk Intensity</span>
          </div>
          <div className="heat-legend-bar" />
          <div className="heat-legend-ticks">
            <span>0% (Low)</span>
            <span>35% (Moderate)</span>
            <span>65% (High)</span>
            <span>100% (Severe)</span>
          </div>
        </div>

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
              padding: "16px 26px",
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
              top: "70px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1000,
              background: "rgba(127, 29, 29, 0.92)",
              backdropFilter: "blur(14px)",
              border: "1px solid rgba(248,113,113,0.5)",
              borderRadius: "12px",
              padding: "12px 20px",
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
    </section>
  );
}

export default Heatmap;
