import { useEffect, useState } from "react";

import { MapContainer ,TileLayer, useMap, GeoJSON } from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";

import {featureCollection, polygon, union, difference} from "@turf/turf";

import "./heatmap.css"


function Geocoder() {
  const map = useMap();

  useEffect(() => {
    const control = L.Control.geocoder({
      defaultMarkGeocode: true
    }).addTo(map);

    return () => {
      map.removeControl(control);
    };
  }, [map]);

  return null;
}


function Heatmap() {
  const [nerDists, setnerDists] = useState(null);
  const [outsideNER, setOutsideNER] = useState(null);

  useEffect(() => {
    fetch("/ner_districts.geojson")
      .then(response => {
        if (!response.ok) {
          throw new Error("Failed to fetch GeoJSON");
        }

        return response.json();
      })
      .then(data => {
        setnerDists(data);

        const ner = featureCollection(data.features);
        const nerUnion = union(ner);

        const world = polygon([
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85]
          ]
        ]);

        const mask = difference(featureCollection([world, nerUnion]));

        setOutsideNER(mask);
      })
      .catch(error => {
        console.error("Error loading GeoJSON:", error);
      });
  }, []);

  return (
    <div className="map-container">
      <MapContainer
        center={[26, 91]}
        zoom={10}
        maxBounds={[
          [6, 68],
          [37, 98]
        ]}
        maxBoundsViscosity={1.0}
        style={{
          height: "100vh",
          width: "100%"
        }}
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

        {outsideNER && (
          <GeoJSON
            data={outsideNER}
            style={{
              color: "black",
              weight:1,
              fillOpacity: 0.8
            }}
          />
        )}

        {nerDists && (
          <GeoJSON
            data={nerDists}
            style={{
              color: "green",
              weight: 1,
              fillOpacity: 0.2
            }}
          />
        )}

        <Geocoder />
      </MapContainer>

      <div className="risk-panel">
        <div className="district-info">
          <h2>Aizwal</h2>
          <p>Mizoram</p>
        </div>
        
        <div className="risk-info">
          <span>Risk Score </span>
          <strong>82.9/100</strong>
        </div>

        <div>
          <span>Rainfall </span>
          <strong>142 mm</strong>
        </div>

        <div>
          <span>Last Updated: </span>
          <strong>2 mins ago</strong>
        </div>
      </div>
    </div>
  );
}

export default Heatmap;