/**
 * High-performance HTML5 Canvas Heatmap Layer for Leaflet & React Leaflet.
 * Based on the radial density coloring algorithm (simpleheat / Leaflet.heat).
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Lightweight canvas heat renderer
 */
function createSimpleHeat(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let width = canvas.width;
  let height = canvas.height;
  let maxVal = 1.0;
  let dataPoints = [];
  let circleCanvas = null;
  let circleRadius = 0;
  let gradPixels = null;

  // Default color gradient matching critical disaster thresholds
  let defaultGradient = {
    0.10: '#3b82f6', // blue (Low)
    0.30: '#10b981', // green (Moderate)
    0.55: '#eab308', // yellow (Elevated)
    0.75: '#f97316', // orange (High)
    0.90: '#ef4444', // red (Severe/Critical)
  };

  function setGradient(grad = defaultGradient) {
    const paletteCanvas = document.createElement('canvas');
    paletteCanvas.width = 1;
    paletteCanvas.height = 256;
    const pCtx = paletteCanvas.getContext('2d');
    const linearGrad = pCtx.createLinearGradient(0, 0, 0, 256);

    for (const key in grad) {
      linearGrad.addColorStop(parseFloat(key), grad[key]);
    }

    pCtx.fillStyle = linearGrad;
    pCtx.fillRect(0, 0, 1, 256);
    gradPixels = pCtx.getImageData(0, 0, 1, 256).data;
  }

  function setRadius(r = 25, blur = 18) {
    circleRadius = r + blur;
    circleCanvas = document.createElement('canvas');
    circleCanvas.width = circleCanvas.height = circleRadius * 2;
    const cCtx = circleCanvas.getContext('2d');

    const radialGrad = cCtx.createRadialGradient(
      circleRadius,
      circleRadius,
      r,
      circleRadius,
      circleRadius,
      circleRadius
    );
    radialGrad.addColorStop(0, 'rgba(0,0,0,1)');
    radialGrad.addColorStop(1, 'rgba(0,0,0,0)');

    cCtx.fillStyle = radialGrad;
    cCtx.beginPath();
    cCtx.arc(circleRadius, circleRadius, circleRadius, 0, Math.PI * 2, true);
    cCtx.closePath();
    cCtx.fill();
  }

  function resize(w, h) {
    width = canvas.width = w;
    height = canvas.height = h;
  }

  function setData(data) {
    dataPoints = data;
  }

  function setMax(max) {
    maxVal = max || 1.0;
  }

  function draw(minOpacity = 0.05) {
    if (!circleCanvas) setRadius(25, 18);
    if (!gradPixels) setGradient(defaultGradient);

    ctx.clearRect(0, 0, width, height);

    // 1. Draw grayscale alpha mask of all points
    for (let i = 0; i < dataPoints.length; i++) {
      const p = dataPoints[i];
      const x = p[0];
      const y = p[1];
      const val = p[2];

      if (x < -circleRadius || x > width + circleRadius || y < -circleRadius || y > height + circleRadius) {
        continue;
      }

      ctx.globalAlpha = Math.min(Math.max(val / maxVal, minOpacity), 1);
      ctx.drawImage(circleCanvas, x - circleRadius, y - circleRadius);
    }

    // 2. Colorize canvas pixels based on alpha channel
    const img = ctx.getImageData(0, 0, width, height);
    const pixels = img.data;
    const len = pixels.length;

    for (let i = 0; i < len; i += 4) {
      const alpha = pixels[i + 3];
      if (alpha) {
        const offset = alpha * 4;
        pixels[i] = gradPixels[offset];
        pixels[i + 1] = gradPixels[offset + 1];
        pixels[i + 2] = gradPixels[offset + 2];
      }
    }

    ctx.putImageData(img, 0, 0);
  }

  return {
    resize,
    setData,
    setMax,
    setRadius,
    setGradient,
    draw,
  };
}

/**
 * React Leaflet Canvas Heatmap Component
 * 
 * @param {Object} props
 * @param {Array<Array<number>>} props.points - [[lat, lng, intensity], ...]
 * @param {number} [props.radius=26] - Point radius in pixels
 * @param {number} [props.blur=18] - Blur spread in pixels
 * @param {number} [props.max=1.0] - Maximum intensity normalization ceiling
 * @param {number} [props.opacity=0.82] - Overall layer opacity
 * @param {Object} [props.gradient] - Custom color gradient
 */
export function HeatmapLayer({
  points = [],
  radius = 26,
  blur = 18,
  max = 1.0,
  opacity = 0.82,
  gradient,
}) {
  const map = useMap();
  const canvasRef = useRef(null);
  const heatRef = useRef(null);

  useEffect(() => {
    // Create dedicated canvas element inside Leaflet overlay pane
    const canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-layer');
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '350'; // Over OSM tiles, under popups/UI

    const pane = map.getPanes().overlayPane;
    pane.appendChild(canvas);
    canvasRef.current = canvas;

    const heat = createSimpleHeat(canvas);
    heatRef.current = heat;

    function reset() {
      const size = map.getSize();
      const origin = map.getPixelOrigin();
      const panePos = L.DomUtil.getPosition(pane) || { x: 0, y: 0 };

      canvas.style.transform = `translate3d(${-panePos.x}px, ${-panePos.y}px, 0)`;
      heat.resize(size.x, size.y);
      redraw();
    }

    function redraw() {
      if (!points || points.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      heat.setMax(max);
      heat.setRadius(radius, blur);
      if (gradient) heat.setGradient(gradient);

      // Convert lat/lng to container pixel coordinates
      const pixelPoints = [];
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const latLng = L.latLng(pt[0], pt[1]);
        const containerPt = map.latLngToContainerPoint(latLng);
        pixelPoints.push([containerPt.x, containerPt.y, pt[2] || 0.5]);
      }

      heat.setData(pixelPoints);
      heat.draw(0.05);
      canvas.style.opacity = String(opacity);
    }

    map.on('move', reset);
    map.on('moveend', reset);
    map.on('zoomend', reset);
    map.on('resize', reset);

    reset();

    return () => {
      map.off('move', reset);
      map.off('moveend', reset);
      map.off('zoomend', reset);
      map.off('resize', reset);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };
  }, [map]);

  // Handle dynamic prop updates (sliders, points change)
  useEffect(() => {
    if (!canvasRef.current || !heatRef.current) return;

    canvasRef.current.style.opacity = String(opacity);
    heatRef.current.setRadius(radius, blur);
    heatRef.current.setMax(max);
    if (gradient) heatRef.current.setGradient(gradient);

    const pixelPoints = [];
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const latLng = L.latLng(pt[0], pt[1]);
      const containerPt = map.latLngToContainerPoint(latLng);
      pixelPoints.push([containerPt.x, containerPt.y, pt[2] || 0.5]);
    }

    heatRef.current.setData(pixelPoints);
    heatRef.current.draw(0.05);
  }, [map, points, radius, blur, max, opacity, gradient]);

  return null;
}
