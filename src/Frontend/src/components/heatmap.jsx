import { useEffect, useState } from "react";

import { MapContainer ,TileLayer, useMap, GeoJSON } from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";

import {featureCollection, polygon, union, difference} from "@turf/turf";


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
  const [indianStates, setIndianStates] = useState(null);
  const [outsideNER, setOutsideNER] = useState(null);

  useEffect(() => {
    fetch("/indianStates.geojson")
      .then(response => {
        if (!response.ok) {
          throw new Error("Failed to fetch GeoJSON");
        }

        return response.json();
      })
      .then(data => {
        setIndianStates(data);

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
    <MapContainer
      center={[26, 91]}
      zoom={8}
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

      {indianStates && (
        <GeoJSON
          data={indianStates}
          style={{
            color: "green",
            weight: 1,
            fillOpacity: 0.2
          }}
        />
      )}

      <Geocoder />
    </MapContainer>
  );
}

export default Heatmap;