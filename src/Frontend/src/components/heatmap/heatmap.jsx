import { useEffect, useState } from "react";

import { MapContainer ,TileLayer, useMap, GeoJSON, useMapEvents, Marker } from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";

import {featureCollection, polygon, union, difference, point, booleanPointInPolygon} from "@turf/turf";

import "./heatmap.css"

function EventClickHandler({  nerDists,  setSelectedDistrict,  setSelectedPoint}) {

  useMapEvents({
    click(e) {

      const { lat, lng } = e.latlng;
      const clickedPoint = point([lng, lat]);
      const district = nerDists.features.find(feature =>
        booleanPointInPolygon(clickedPoint, feature)
      );

      if (district) {
        setSelectedDistrict(district.properties);
        setSelectedPoint([lat, lng]);
      }
    }
  });
  return null;
}

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

  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);

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
        center={[26.11667, 92.86667]}
        zoom={7}
        minZoom={6}
        maxBounds={[
          [21, 88],
          [30, 98]
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

        {nerDists && (
          <EventClickHandler
            nerDists={nerDists}
            setSelectedDistrict={setSelectedDistrict}
            setSelectedPoint={setSelectedPoint}
          />
        )}

        {selectedPoint && (
          <Marker position={selectedPoint} />
        )}

        <Geocoder />
      </MapContainer>

      {selectedDistrict && (
        <div className="risk-panel">

          <div className="district-info">
            <h2>{selectedDistrict.DISTRICT}</h2>
            <p>{selectedDistrict.ST_NM}</p>
          </div>

          <div className="risk-info">
            <span>Risk Score: </span>
            <strong>82.9/100</strong>
          </div>

          <div>
            <span>Rainfall: </span>
            <strong>142 mm</strong>
          </div>

          <div>
            <span>Last Updated: </span>
            <strong>2 mins ago</strong>
          </div>

        </div>
      )}
    </div>
  );
}

export default Heatmap;