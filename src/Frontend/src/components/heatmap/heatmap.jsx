import { useEffect, useState } from "react";
import { MapContainer, TileLayer, useMap, GeoJSON, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";

import { featureCollection, polygon, union, difference } from "@turf/turf";
import "./heatmap.css";

function Geocoder() {
  const map = useMap();

  useEffect(() => {
    const control = L.Control.geocoder({
      defaultMarkGeocode: true,
    }).addTo(map);

    return () => {
      map.removeControl(control);
    };
  }, [map]);

  return null;
}

function Heatmap() {
  const [nerDists, setnerDists] = useState(null);
  const [riskDists, setRiskDists] = useState(null);
  const [outsideNER, setOutsideNER] = useState(null);

  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);

  useEffect(() => {
    fetch("/ner_districts.geojson")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to fetch GeoJSON");
        return response.json();
      })
      .then((data) => {
        setnerDists(data);

        try {
          const ner = featureCollection(data.features);
          const nerUnion = union(ner);

          const world = polygon([
            [
              [-180, -85],
              [180, -85],
              [180, 85],
              [-180, 85],
              [-180, -85],
            ],
          ]);

          // Handle Turf v6 / v7 difference API variations safely
          const mask = difference(
            featureCollection ? featureCollection([world, nerUnion]) : world,
            nerUnion
          );

          setOutsideNER(mask);
        } catch (e) {
          console.warn("Could not compute outside mask:", e);
        }
      })
      .catch((error) => console.error("Error loading GeoJSON:", error));
  }, []);

  useEffect(() => {
    fetch("/dummy-heat.json")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to fetch dummy heat data");
        return response.json();
      })
      .then((data) => setRiskDists(data))
      .catch((error) => console.error("Error loading dummy heat data:", error));
  }, []);

  // Directly handle interaction on risk geometries without point-in-polygon loops
  const onEachRiskFeature = (feature, layer) => {
    layer.on({
      click: (e) => {
        const { lat, lng } = e.latlng;
        const clickedName = feature.properties?.name || feature.properties?.DISTRICT;

        // Find corresponding risk district safely
        const riskDistrict = riskDists?.features?.find(
          (f) =>
            f.properties?.name?.trim().toLowerCase() ===
            clickedName?.trim().toLowerCase()
        );

        if (riskDistrict) {
          setSelectedDistrict(riskDistrict.properties);
        } else {
          setSelectedDistrict(feature.properties);
        }

        setSelectedPoint([lat, lng]);
      },
    });
  };

  return (
    <div className="map-container">
      <MapContainer
        center={[26.11667, 92.86667]}
        zoom={7}
        minZoom={6}
        maxBounds={[
          [21, 88],
          [30, 98],
        ]}
        maxBoundsViscosity={1.0}
        style={{ height: "100vh", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <TileLayer
          attribution="&copy; Esri"
          url={`https://ibasemaps-api.arcgis.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}?token=${import.meta.env.VITE_ARCGIS_API_KEY}`}
          opacity={0.6}
        />

        {/* MASK LAYER: Set interactive={false} so it never steals pointer events */}
        {outsideNER && (
          <GeoJSON
            data={outsideNER}
            interactive={false}
            style={{
              color: "black",
              weight: 1,
              fillOpacity: 0.8,
            }}
          />
        )}

        {/* RISK HEATMAP LAYER: Set interactive={true} to handle direct clicks */}
        {riskDists && (
          <GeoJSON
            data={riskDists}
            interactive={true}
            onEachFeature={onEachRiskFeature}
            style={(feature) => {
              const riskLevel = feature.properties?.riskLevel;
              let fillColor = "gray";

              if (riskLevel === "low") fillColor = "green";
              else if (riskLevel === "medium") fillColor = "yellow";
              else if (riskLevel === "high") fillColor = "orange";
              else if (riskLevel === "severe") fillColor = "red";

              return {
                color: "black",
                weight: 1,
                fillColor: fillColor,
                fillOpacity: 0.6,
              };
            }}
          />
        )}

        {selectedPoint && <Marker position={selectedPoint} />}

        <Geocoder />
      </MapContainer>

      {selectedDistrict && (
        <div className="risk-panel">
          <div className="district-info">
            <h2>{selectedDistrict.name || selectedDistrict.DISTRICT}</h2>
            <p>{selectedDistrict.state}</p>
          </div>

          <div className="risk-info">
            <span>Risk Score: </span>
            <strong>{selectedDistrict.riskScore ?? "N/A"}/100</strong>
          </div>

          <div>
            <span>Risk Level: </span>
            <strong>{selectedDistrict.riskLevel ?? "Unknown"}</strong>
          </div>

          <div>
            <span>Rainfall: </span>
            <strong>142 mm</strong>
          </div>

          <div>
            <span>Last Updated: </span>
            <strong>
              {selectedDistrict.lastUpdated
                ? new Date(selectedDistrict.lastUpdated).toLocaleString()
                : "N/A"}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default Heatmap;