import { useEffect, useMemo, useState } from "react";

import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
} from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";

import {
  featureCollection,
  polygon,
  union,
  difference,
} from "@turf/turf";


/* =====================================================
   GEOCODER
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
   RISK CONFIG
===================================================== */

const RISK_CONFIG = {
  low: {
    color: "#22c55e",
    label: "Low",
  },

  medium: {
    color: "#eab308",
    label: "Medium",
  },

  high: {
    color: "#f97316",
    label: "High",
  },

  severe: {
    color: "#ef4444",
    label: "Severe",
  },
};


/* =====================================================
   GET RISK LEVEL

   Uses backend riskLevel if available.
   Falls back to riskScore.
===================================================== */

function getRiskLevel(riskLevel, riskScore) {
  const level = riskLevel?.toLowerCase();

  if (RISK_CONFIG[level]) {
    return level;
  }

  const score = Number(riskScore) || 0;

  if (score < 25) return "low";
  if (score < 50) return "medium";
  if (score < 75) return "high";

  return "severe";
}


function getRiskConfig(riskLevel, riskScore) {
  const level = getRiskLevel(
    riskLevel,
    riskScore
  );

  return RISK_CONFIG[level];
}


/* =====================================================
   DATE FORMATTER
===================================================== */

function formatDate(date) {
  if (!date) {
    return "Not available";
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return parsedDate.toLocaleString();
}


/* =====================================================
   MAIN HEATMAP
===================================================== */

function Heatmap() {

  const [riskData, setRiskData] =
    useState(null);

  const [outsideNER, setOutsideNER] =
    useState(null);

  const [selectedDistrict, setSelectedDistrict] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);


  /* =====================================================
     API URL
  ===================================================== */

  const API_URL =
    import.meta.env.VITE_API_URL ||
    "https://land-slide-sih26.onrender.com";


  /* =====================================================
     FETCH NATIONAL RISK DATA
  ===================================================== */

  useEffect(() => {

    const controller =
      new AbortController();


    async function fetchRiskData() {

      try {

        setLoading(true);
        setError(null);


        const response = await fetch(
          `${API_URL}/data/national`,
          {
            signal: controller.signal,
          }
        );


        if (!response.ok) {
          throw new Error(
            `Risk API error: ${response.status}`
          );
        }


        const contentType =
          response.headers.get(
            "content-type"
          ) || "";


        if (
          !contentType.includes(
            "application/json"
          )
        ) {

          const text =
            await response.text();

          console.error(
            "Expected JSON but received:",
            text.substring(0, 300)
          );

          throw new Error(
            "Server returned invalid data"
          );
        }


        const data =
          await response.json();


        console.log(
          "National risk data:",
          data
        );


        if (
          !data ||
          data.type !== "FeatureCollection" ||
          !Array.isArray(data.features)
        ) {
          throw new Error(
            "Invalid GeoJSON data received"
          );
        }


        setRiskData(data);


        /* =============================================
           CREATE OUTSIDE NER MASK

           Turf v7.4.0
        ============================================= */

        try {

          /*
            Union all district polygons.

            Your national data currently contains
            the Northeast districts, so we can create
            the visible region directly from them.
          */

          const districts =
            featureCollection(
              data.features
            );


          const nerUnion =
            union(districts);


          if (!nerUnion) {
            throw new Error(
              "Could not union districts"
            );
          }


          /*
            Large world polygon
          */

          const world = polygon([
            [
              [-180, -85],
              [180, -85],
              [180, 85],
              [-180, 85],
              [-180, -85],
            ],
          ]);


          /*
            Turf v7 difference expects
            a FeatureCollection
          */

          const mask =
            difference(
              featureCollection([
                world,
                nerUnion,
              ])
            );


          if (mask) {
            setOutsideNER(mask);
          }


        } catch (turfError) {

          /*
            IMPORTANT:

            Turf failure should NEVER
            crash the entire heatmap.
          */

          console.warn(
            "Could not create outside mask:",
            turfError
          );

          setOutsideNER(null);
        }


      } catch (err) {

        if (
          err.name !== "AbortError"
        ) {

          console.error(
            "Risk data error:",
            err
          );

          setError(
            err.message
          );
        }


      } finally {

        setLoading(false);

      }

    }


    fetchRiskData();


    return () => {
      controller.abort();
    };


  }, [API_URL]);


  /* =====================================================
     CALCULATE REGION STATISTICS
  ===================================================== */

  const stats = useMemo(() => {

    const result = {
      total: 0,
      low: 0,
      medium: 0,
      high: 0,
      severe: 0,
    };


    if (
      !riskData?.features
    ) {
      return result;
    }


    result.total =
      riskData.features.length;


    riskData.features.forEach(
      (feature) => {

        const properties =
          feature.properties || {};


        const level =
          getRiskLevel(
            properties.riskLevel,
            properties.riskScore
          );


        if (
          result[level] !== undefined
        ) {
          result[level]++;
        }

      }
    );


    return result;


  }, [riskData]);


  /* =====================================================
     DISTRICT STYLE
  ===================================================== */

  function districtStyle(feature) {

    const properties =
      feature?.properties || {};


    const risk =
      getRiskConfig(
        properties.riskLevel,
        properties.riskScore
      );


    return {

      color: "#111827",

      weight: 1,

      fillColor:
        risk.color,

      fillOpacity: 0.7,

    };

  }


  /* =====================================================
     DISTRICT INTERACTION
  ===================================================== */

  function onEachDistrict(
    feature,
    layer
  ) {

    const properties =
      feature.properties || {};


    const risk =
      getRiskConfig(
        properties.riskLevel,
        properties.riskScore
      );


    /* =============================
       CLICK
    ============================= */

    layer.on("click", () => {

      setSelectedDistrict(
        properties
      );

    });


    /* =============================
       HOVER
    ============================= */

    layer.on("mouseover", () => {

      layer.setStyle({

        weight: 3,

        color: "#ffffff",

        fillOpacity: 0.9,

      });


      layer.bringToFront();

    });


    /* =============================
       MOUSE OUT
    ============================= */

    layer.on("mouseout", () => {

      layer.setStyle(
        districtStyle(feature)
      );

    });


    /* =============================
       TOOLTIP
    ============================= */

    layer.bindTooltip(
      `
        <div style="
          font-family: Arial;
          min-width: 130px;
        ">

          <strong>
            ${properties.name || "Unknown"}
          </strong>

          <br/>

          <span>
            ${properties.state || ""}
          </span>

          <br/><br/>

          <strong>
            Risk:
          </strong>

          ${Math.round(
            Number(
              properties.riskScore
            ) || 0
          )}/100

          <br/>

          <span style="
            color:${risk.color};
            font-weight:bold;
          ">

            ${risk.label.toUpperCase()}

          </span>

        </div>
      `
    );

  }


  /* =====================================================
     SELECTED RISK CONFIG
  ===================================================== */

  const selectedRisk =
    selectedDistrict
      ? getRiskConfig(
          selectedDistrict.riskLevel,
          selectedDistrict.riskScore
        )
      : null;


  /* =====================================================
     RENDER
  ===================================================== */

  return (

    <section
      style={{
        width: "100%",
        background: "#09090b",
        padding: "24px 0",
      }}
    >


      {/* =============================================
          TITLE
      ============================================= */}

      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto 18px",
          padding: "0 20px",
        }}
      >

        <p
          style={{
            color: "#22c55e",
            fontSize: "12px",
            letterSpacing: "2px",
            fontWeight: "700",
            marginBottom: "6px",
          }}
        >
          LIVE MONITORING
        </p>


        <h2
          style={{
            color: "#f8fafc",
            fontSize: "32px",
            margin: "0",
          }}
        >
          Landslide Risk Heatmap
        </h2>


        <p
          style={{
            color: "#94a3b8",
            marginTop: "8px",
            marginBottom: "0",
          }}
        >
          Real-time landslide risk
          monitoring across Northeast India.
        </p>

      </div>



      {/* =============================================
          MAP WRAPPER

          position: relative is IMPORTANT

          This is what allows the glass cards
          to sit ON TOP OF THE MAP.
      ============================================= */}

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "72vh",
          minHeight: "600px",
          overflow: "hidden",
          borderTop: "1px solid #27272a",
          borderBottom: "1px solid #27272a",
        }}
      >


        {/* =============================================
            MAP
        ============================================= */}

        <MapContainer

          center={[
            26.2,
            92.8,
          ]}

          zoom={7}

          minZoom={6}

          maxZoom={12}

          maxBounds={[
            [21, 87],
            [30, 99],
          ]}

          maxBoundsViscosity={1}

          scrollWheelZoom={false}

          style={{
            height: "100%",
            width: "100%",
            zIndex: 1,
          }}
        >


          {/* =============================
              OPENSTREETMAP
          ============================= */}

          <TileLayer

            attribution="
              &copy; OpenStreetMap contributors
            "

            url="
              https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
            "

          />


          {/* =============================
              TERRAIN
          ============================= */}

          <TileLayer

            attribution="
              &copy; Esri
            "

            url={`https://ibasemaps-api.arcgis.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}?token=${import.meta.env.VITE_ARCGIS_API_KEY}`}

            opacity={0.55}

          />


          {/* =============================
              OUTSIDE MASK

              interactive false means it
              never blocks district clicks.
          ============================= */}

          {outsideNER && (

            <GeoJSON

              data={outsideNER}

              interactive={false}

              style={{
                color: "#000000",
                weight: 0,
                fillColor: "#000000",
                fillOpacity: 0.72,
              }}

            />

          )}


          {/* =============================
              RISK DISTRICTS
          ============================= */}

          {riskData && (

            <GeoJSON

              data={riskData}

              style={districtStyle}

              onEachFeature={
                onEachDistrict
              }

            />

          )}


          <Geocoder
            position="topright"
          />


        </MapContainer>



        {/* =============================================
            LOADING OVERLAY
        ============================================= */}

        {loading && (

          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform:
                "translate(-50%, -50%)",

              zIndex: 1000,

              background:
                "rgba(15, 23, 42, 0.85)",

              backdropFilter:
                "blur(14px)",

              border:
                "1px solid rgba(255,255,255,0.15)",

              borderRadius: "14px",

              padding:
                "18px 28px",

              color: "#ffffff",

              fontWeight: "600",
            }}
          >

            Loading live risk data...

          </div>

        )}



        {/* =============================================
            ERROR OVERLAY
        ============================================= */}

        {error && (

          <div
            style={{
              position: "absolute",

              top: "20px",

              left: "50%",

              transform:
                "translateX(-50%)",

              zIndex: 1000,

              background:
                "rgba(127, 29, 29, 0.92)",

              backdropFilter:
                "blur(14px)",

              border:
                "1px solid rgba(248,113,113,0.5)",

              borderRadius: "12px",

              padding:
                "14px 22px",

              color: "#ffffff",

              textAlign: "center",
            }}
          >

            <strong>
              Unable to load live risk data
            </strong>

            <br />

            <small>
              {error}
            </small>

          </div>

        )}



        {/* =============================================
            REGION OVERVIEW
        ============================================= */}

        <div
          style={{
            position: "absolute",

            top: "20px",

            left: "20px",

            zIndex: 1000,

            width: "240px",

            background:
              "rgba(15, 23, 42, 0.78)",

            backdropFilter:
              "blur(18px)",

            WebkitBackdropFilter:
              "blur(18px)",

            border:
              "1px solid rgba(255,255,255,0.16)",

            borderRadius: "16px",

            padding: "18px",

            color: "#ffffff",

            boxShadow:
              "0 8px 32px rgba(0,0,0,0.35)",
          }}
        >

          <p
            style={{
              color: "#22c55e",

              fontSize: "11px",

              letterSpacing: "1.5px",

              fontWeight: "700",

              margin:
                "0 0 8px",
            }}
          >
            REGION OVERVIEW
          </p>


          <h3
            style={{
              margin: "0 0 8px",

              fontSize: "20px",
            }}
          >
            Northeast India
          </h3>


          <p
            style={{
              color: "#cbd5e1",

              fontSize: "13px",

              lineHeight: "1.5",

              marginBottom: "16px",
            }}
          >
            Monitoring landslide risk
            across active regions.
          </p>


          <div
            style={{
              borderTop:
                "1px solid rgba(255,255,255,0.12)",

              paddingTop: "12px",

              display: "flex",

              justifyContent:
                "space-between",

              alignItems:
                "center",
            }}
          >

            <span
              style={{
                color: "#94a3b8",

                fontSize: "13px",
              }}
            >
              Total Regions
            </span>


            <strong
              style={{
                fontSize: "24px",

                color: "#ffffff",
              }}
            >
              {stats.total}
            </strong>

          </div>

        </div>



        {/* =============================================
            RISK LEGEND
        ============================================= */}

        <div
          style={{
            position: "absolute",

            left: "20px",

            bottom: "25px",

            zIndex: 1000,

            width: "210px",

            background:
              "rgba(15, 23, 42, 0.82)",

            backdropFilter:
              "blur(18px)",

            WebkitBackdropFilter:
              "blur(18px)",

            border:
              "1px solid rgba(255,255,255,0.16)",

            borderRadius: "16px",

            padding: "18px",

            color: "#ffffff",

            boxShadow:
              "0 8px 32px rgba(0,0,0,0.35)",
          }}
        >

          <h3
            style={{
              margin:
                "0 0 16px",

              fontSize: "17px",
            }}
          >
            Risk Levels
          </h3>


          {[
            {
              level: "low",
              label: "Low",
              range: "0 – 24",
            },

            {
              level: "medium",
              label: "Medium",
              range: "25 – 49",
            },

            {
              level: "high",
              label: "High",
              range: "50 – 74",
            },

            {
              level: "severe",
              label: "Severe",
              range: "75 – 100",
            },

          ].map((item) => (

            <div
              key={item.level}

              style={{
                display: "flex",

                alignItems:
                  "center",

                justifyContent:
                  "space-between",

                marginBottom: "12px",
              }}
            >

              <div
                style={{
                  display: "flex",

                  alignItems:
                    "center",

                  gap: "9px",
                }}
              >

                <span
                  style={{
                    width: "10px",

                    height: "10px",

                    borderRadius: "50%",

                    background:
                      RISK_CONFIG[
                        item.level
                      ].color,

                    display:
                      "inline-block",
                  }}
                />

                <span
                  style={{
                    fontSize: "13px",
                  }}
                >
                  {item.label}
                </span>

              </div>


              <span
                style={{
                  color: "#94a3b8",

                  fontSize: "12px",
                }}
              >
                {item.range}
              </span>

            </div>

          ))}

        </div>



        {/* =============================================
            SELECTED DISTRICT PANEL
        ============================================= */}

        <div
          style={{
            position: "absolute",

            right: "20px",

            bottom: "25px",

            zIndex: 1000,

            width: "300px",

            background:
              "rgba(15, 23, 42, 0.84)",

            backdropFilter:
              "blur(20px)",

            WebkitBackdropFilter:
              "blur(20px)",

            border:
              "1px solid rgba(255,255,255,0.16)",

            borderRadius: "18px",

            padding: "20px",

            color: "#ffffff",

            boxShadow:
              "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >


          {!selectedDistrict && (

            <>

              <p
                style={{
                  color: "#22c55e",

                  fontSize: "11px",

                  letterSpacing: "1.5px",

                  fontWeight: "700",

                  margin:
                    "0 0 8px",
                }}
              >
                DISTRICT INFORMATION
              </p>


              <h3
                style={{
                  margin:
                    "0 0 10px",
                }}
              >
                Select a Region
              </h3>


              <p
                style={{
                  color: "#94a3b8",

                  fontSize: "13px",

                  lineHeight: "1.6",

                  margin: 0,
                }}
              >
                Click on any coloured
                district to view its
                landslide risk details.

              </p>

            </>

          )}



          {selectedDistrict && (

            <>

              {/* TITLE */}

              <div
                style={{
                  display: "flex",

                  justifyContent:
                    "space-between",

                  alignItems:
                    "flex-start",

                  marginBottom: "18px",
                }}
              >

                <div>

                  <p
                    style={{
                      color: "#22c55e",

                      fontSize: "10px",

                      letterSpacing: "1.5px",

                      fontWeight: "700",

                      margin:
                        "0 0 6px",
                    }}
                  >
                    SELECTED REGION
                  </p>


                  <h3
                    style={{
                      margin:
                        "0 0 5px",

                      fontSize: "22px",
                    }}
                  >
                    {selectedDistrict.name}
                  </h3>


                  <span
                    style={{
                      color: "#94a3b8",

                      fontSize: "13px",
                    }}
                  >
                    {selectedDistrict.state}
                  </span>

                </div>


                <span
                  style={{
                    background:
                      `${selectedRisk.color}25`,

                    color:
                      selectedRisk.color,

                    border:
                      `1px solid ${selectedRisk.color}55`,

                    borderRadius:
                      "20px",

                    padding:
                      "5px 10px",

                    fontSize: "10px",

                    fontWeight: "700",

                    textTransform:
                      "uppercase",
                  }}
                >
                  {selectedRisk.label}
                </span>

              </div>



              {/* RISK SCORE */}

              <div
                style={{
                  background:
                    "rgba(255,255,255,0.07)",

                  borderRadius:
                    "12px",

                  padding: "14px",

                  marginBottom:
                    "14px",
                }}
              >

                <span
                  style={{
                    color: "#94a3b8",

                    fontSize: "12px",
                  }}
                >
                  RISK SCORE
                </span>


                <div
                  style={{
                    display: "flex",

                    alignItems:
                      "baseline",

                    gap: "5px",

                    marginTop: "4px",
                  }}
                >

                  <strong
                    style={{
                      fontSize: "34px",

                      color:
                        selectedRisk.color,
                    }}
                  >
                    {Math.round(
                      Number(
                        selectedDistrict.riskScore
                      ) || 0
                    )}
                  </strong>


                  <span
                    style={{
                      color: "#94a3b8",

                      fontSize: "14px",
                    }}
                  >
                    /100
                  </span>

                </div>

              </div>



              {/* RAINFALL */}

              <div
                style={{
                  display: "flex",

                  justifyContent:
                    "space-between",

                  padding:
                    "10px 0",

                  borderBottom:
                    "1px solid rgba(255,255,255,0.08)",
                }}
              >

                <span
                  style={{
                    color: "#94a3b8",

                    fontSize: "13px",
                  }}
                >
                  Rainfall
                </span>


                <strong
                  style={{
                    fontSize: "13px",
                  }}
                >
                  {selectedDistrict.rainfall ??
                    "N/A"}

                  {selectedDistrict.rainfall != null &&
                    " mm"}

                </strong>

              </div>



              {/* UPDATED */}

              <div
                style={{
                  paddingTop:
                    "12px",
                }}
              >

                <span
                  style={{
                    color: "#64748b",

                    fontSize: "11px",
                  }}
                >
                  LAST UPDATED
                </span>


                <p
                  style={{
                    margin:
                      "5px 0 0",

                    fontSize: "12px",

                    color: "#cbd5e1",
                  }}
                >
                  {formatDate(
                    selectedDistrict.lastUpdated ||
                    selectedDistrict.computedAt
                  )}
                </p>

              </div>


            </>

          )}

        </div>


      </div>



      {/* =============================================
          BOTTOM SUMMARY
      ============================================= */}

      <div
        style={{
          maxWidth: "1400px",

          margin: "18px auto 0",

          padding: "0 20px",

          display: "flex",

          gap: "20px",

          flexWrap: "wrap",

          color: "#94a3b8",

          fontSize: "13px",
        }}
      >

        <span>
          🟢 Low: {stats.low}
        </span>

        <span>
          🟡 Medium: {stats.medium}
        </span>

        <span>
          🟠 High: {stats.high}
        </span>

        <span>
          🔴 Severe: {stats.severe}
        </span>

      </div>


    </section>
  );
}


export default Heatmap;