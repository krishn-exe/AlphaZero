import { useEffect, useState, useCallback } from "react";

import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  useMap,
} from "react-leaflet";

import L from "leaflet";

import {
  featureCollection,
  polygon,
  union,
  difference,
} from "@turf/turf";

import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";

import "./heatmap.css";


// ============================================
// CONFIGURATION
// ============================================

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:3000";


// Change this later if you want polling.
// Example: 10000 = refresh every 10 seconds.
// Keep as null for fetch-once mode.

const REFRESH_INTERVAL = null;


// ============================================
// GEOCODER
// ============================================

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


// ============================================
// RISK HELPERS
// ============================================

function normalizeRiskScore(riskScore) {

  const score = Number(riskScore);


  if (!Number.isFinite(score)) {
    return null;
  }


  // Backend should send 0 → 1.
  // Clamp unexpected values safely.

  return Math.max(
    0,
    Math.min(1, score)
  );

}


function getRiskColor(riskScore) {

  const score =
    normalizeRiskScore(riskScore);


  if (score === null) {
    return "#808080";
  }


  if (score < 0.25) {
    return "#22c55e";
  }


  if (score < 0.5) {
    return "#eab308";
  }


  if (score < 0.75) {
    return "#f97316";
  }


  return "#ef4444";

}


function getRiskLevel(riskScore) {

  const score =
    normalizeRiskScore(riskScore);


  if (score === null) {
    return "Unknown";
  }


  if (score < 0.25) {
    return "Low";
  }


  if (score < 0.5) {
    return "Moderate";
  }


  if (score < 0.75) {
    return "High";
  }


  return "Severe";

}


function getRiskPercentage(riskScore) {

  const score =
    normalizeRiskScore(riskScore);


  if (score === null) {
    return "N/A";
  }


  return Math.round(score * 100);

}


// ============================================
// VALIDATE API POINT
// ============================================

function isValidRiskPoint(point) {

  const lat = Number(point.lat);
  const lng = Number(point.lng);


  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );

}


// ============================================
// MAIN COMPONENT
// ============================================

function Heatmap() {


  // ==========================================
  // MAP MASK
  // ==========================================

  const [outsideNER, setOutsideNER] =
    useState(null);


  // ==========================================
  // LIVE RISK POINTS
  // ==========================================

  const [riskPoints, setRiskPoints] =
    useState([]);


  // ==========================================
  // SELECTED POINT
  // ==========================================

  const [
    selectedRiskPoint,
    setSelectedRiskPoint,
  ] = useState(null);


  // ==========================================
  // API STATUS
  // ==========================================

  const [isLoading, setIsLoading] =
    useState(true);


  const [error, setError] =
    useState(null);


  const [lastFetched, setLastFetched] =
    useState(null);


  // ==========================================
  // LOAD NER GEOJSON + CREATE MASK
  //
  // Turf version: 7.4.0
  // ==========================================

  useEffect(() => {

    const controller =
      new AbortController();


    async function loadNERMask() {

      try {

        const response = await fetch(
          "/ner_districts.geojson",
          {
            signal: controller.signal,
          }
        );


        if (!response.ok) {

          throw new Error(
            "Failed to load NER boundaries"
          );

        }


        const data =
          await response.json();


        if (
          !data.features ||
          !Array.isArray(data.features)
        ) {

          throw new Error(
            "Invalid NER GeoJSON format"
          );

        }


        // Combine all NER district polygons

        const nerCollection =
          featureCollection(
            data.features
          );


        const nerUnion =
          union(nerCollection);


        if (!nerUnion) {

          throw new Error(
            "Could not create NER boundary"
          );

        }


        // World polygon

        const world = polygon([
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ],
        ]);


        // Turf 7:
        // Difference takes a FeatureCollection

        const mask = difference(
          featureCollection([
            world,
            nerUnion,
          ])
        );


        setOutsideNER(mask);

      }

      catch (error) {

        if (
          error.name !== "AbortError"
        ) {

          console.error(
            "NER mask error:",
            error
          );

        }

      }

    }


    loadNERMask();


    return () => {
      controller.abort();
    };


  }, []);


  // ==========================================
  // FETCH LIVE RISK DATA
  // ==========================================

  const fetchRiskData =
    useCallback(async (signal) => {

      try {

        setError(null);


        const response =
          await fetch(

            `${API_URL}/api/risk-data`,

            {
              signal,
            }

          );


        if (!response.ok) {

          throw new Error(
            `Risk API error: ${response.status}`
          );

        }


        const responseData =
          await response.json();


        /*
          Supports both formats:


          FORMAT 1:

          [
            {
              lat,
              lng,
              riskScore
            }
          ]


          FORMAT 2:

          {
            data: [
              {
                lat,
                lng,
                riskScore
              }
            ]
          }

        */


        const points =
          Array.isArray(responseData)

            ? responseData

            : responseData.data;


        if (!Array.isArray(points)) {

          throw new Error(
            "Invalid risk data received"
          );

        }


        // Keep only valid coordinates

        const validPoints =
          points.filter(
            isValidRiskPoint
          );


        setRiskPoints(
          validPoints
        );


        setLastFetched(
          new Date()
        );

      }

      catch (error) {

        if (
          error.name !== "AbortError"
        ) {

          console.error(
            "Risk data error:",
            error
          );


          setError(
            error.message
          );

        }

      }

      finally {

        if (!signal.aborted) {

          setIsLoading(false);

        }

      }

    }, []);


  // ==========================================
  // INITIAL FETCH
  // + OPTIONAL POLLING
  // ==========================================

  useEffect(() => {

    const controller =
      new AbortController();


    setIsLoading(true);


    fetchRiskData(
      controller.signal
    );


    let interval;


    if (REFRESH_INTERVAL) {

      interval = setInterval(
        () => {

          fetchRiskData(
            controller.signal
          );

        },

        REFRESH_INTERVAL
      );

    }


    return () => {

      controller.abort();


      if (interval) {
        clearInterval(interval);
      }

    };


  }, [fetchRiskData]);


  // ==========================================
  // HANDLE POINT CLICK
  // ==========================================

  function handlePointClick(point) {

    setSelectedRiskPoint(point);

  }


  // ==========================================
  // RENDER
  // ==========================================

  return (

    <div className="map-container">


      {/* ================================
          API STATUS
      ================================= */}

      {isLoading && (

        <div className="map-status">
          Loading risk data...
        </div>

      )}


      {error && (

        <div className="map-error">

          Unable to load live risk data.

        </div>

      )}


      {/* ================================
          MAP
      ================================= */}

      <MapContainer

        center={[
          26.11667,
          92.86667,
        ]}

        zoom={7}

        minZoom={6}

        maxBounds={[
          [21, 88],
          [30, 98],
        ]}

        maxBoundsViscosity={1}

        scrollWheelZoom={false}

        style={{
          height: "70vh",
          width: "100%",
        }}

      >


        {/* ============================
            BASE MAP
        ============================= */}

        <TileLayer

          attribution="
            &copy; OpenStreetMap contributors
          "

          url="
            https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
          "

        />


        {/* ============================
            TERRAIN OVERLAY
        ============================= */}

        <TileLayer

          attribution="&copy; Esri"

          url={
            `https://ibasemaps-api.arcgis.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}?token=${import.meta.env.VITE_ARCGIS_API_KEY}`
          }

          opacity={0.6}

        />


        {/* ============================
            MASK OUTSIDE NER
        ============================= */}

        {outsideNER && (

          <GeoJSON

            data={outsideNER}

            interactive={false}

            style={{
              color: "black",
              weight: 0,
              fillColor: "black",
              fillOpacity: 0.8,
            }}

          />

        )}


        {/* ============================
            LIVE RISK POINTS
        ============================= */}

        {riskPoints.map(
          (point, index) => {

            const score =
              normalizeRiskScore(
                point.riskScore
              );


            const isSelected =

              selectedRiskPoint &&

              (
                point.id
                  ? point.id === selectedRiskPoint.id

                  : point.lat === selectedRiskPoint.lat &&

                    point.lng === selectedRiskPoint.lng
              );


            return (

              <CircleMarker

                key={
                  point.id ||
                  `${point.lat}-${point.lng}-${index}`
                }

                center={[
                  Number(point.lat),
                  Number(point.lng),
                ]}

                radius={
                  isSelected
                    ? 11
                    : 8
                }

                pathOptions={{

                  fillColor:
                    getRiskColor(score),

                  color:
                    isSelected
                      ? "white"
                      : "black",

                  weight:
                    isSelected
                      ? 3
                      : 1,

                  fillOpacity: 0.85,

                }}

                eventHandlers={{

                  click: () =>
                    handlePointClick(point),

                }}

              />

            );

          }
        )}


        {/* ============================
            GEOCODER
        ============================= */}

        <Geocoder
          position="topright"
        />


      </MapContainer>


      {/* ================================
          RISK INFORMATION PANEL
      ================================= */}

      {selectedRiskPoint && (

        <div className="risk-panel">


          {/* TITLE */}

          <div className="district-info">

            <h2>
              Risk Monitoring Point
            </h2>

            <p>
              Live Landslide Risk Assessment
            </p>

          </div>


          {/* RISK SCORE */}

          <div className="risk-info">

            <span>
              Risk Score:
            </span>

            <strong>

              {
                getRiskPercentage(
                  selectedRiskPoint.riskScore
                )
              }

              {
                getRiskPercentage(
                  selectedRiskPoint.riskScore
                ) !== "N/A" && "/100"
              }

            </strong>

          </div>


          {/* RISK LEVEL */}

          <div>

            <span>
              Risk Level:
            </span>

            <strong>

              {
                getRiskLevel(
                  selectedRiskPoint.riskScore
                )
              }

            </strong>

          </div>


          {/* LATITUDE */}

          <div>

            <span>
              Latitude:
            </span>

            <strong>
              {
                Number(
                  selectedRiskPoint.lat
                ).toFixed(5)
              }
            </strong>

          </div>


          {/* LONGITUDE */}

          <div>

            <span>
              Longitude:
            </span>

            <strong>
              {
                Number(
                  selectedRiskPoint.lng
                ).toFixed(5)
              }
            </strong>

          </div>


          {/* OPTIONAL RAINFALL */}

          {selectedRiskPoint.rainfall != null && (

            <div>

              <span>
                Rainfall:
              </span>

              <strong>
                {selectedRiskPoint.rainfall} mm
              </strong>

            </div>

          )}


          {/* OPTIONAL LAST UPDATED */}

          {selectedRiskPoint.lastUpdated && (

            <div>

              <span>
                Last Updated:
              </span>

              <strong>

                {
                  new Date(
                    selectedRiskPoint.lastUpdated
                  ).toLocaleString()
                }

              </strong>

            </div>

          )}


        </div>

      )}


      {/* ================================
          DATA TIMESTAMP
      ================================= */}

      {lastFetched && (

        <div className="map-last-updated">

          Data refreshed:{" "}

          {
            lastFetched.toLocaleTimeString()
          }

        </div>

      )}


    </div>

  );

}


export default Heatmap;

