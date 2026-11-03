/**
 * Leaflet Canvas Heatmap Layer.
 * Renders smooth continuous thermal density gradients locked statically to geographic coordinates.
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Fast HTML5 canvas radial gradient heat generator
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

  // Thermal heat gradient matching Image 2:
  // Pale creamy yellow -> Golden Amber -> Rich Orange -> Deep Crimson -> Dark Maroon
  const defaultGradient = {
    0.05: '#fef9c3', // Pale cream yellow
    0.20: '#fde047', // Warm yellow
    0.40: '#f59e0b', // Amber / golden
    0.60: '#ea580c', // Bright orange-red
    0.80: '#dc2626', // Deep red
    0.95: '#7f1d1d', // Dark maroon / critical
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

  function setRadius(r = 34, blur = 22) {
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
    if (!circleCanvas) setRadius(34, 22);
    if (!gradPixels) setGradient(defaultGradient);

    ctx.clearRect(0, 0, width, height);

    // 1. Draw alpha mask of all points
    for (let i = 0; i < dataPoints.length; i++) {
      const p = dataPoints[i];
      const x = p[0];
      const y = p[1];
      const val = p[2];

      if (x < -circleRadius || x > width + circleRadius || y < -circleRadius || y > height + circleRadius) {
        continue;
      }

      ctx.globalAlpha = Math.min(Math.max(val / maxVal, minOpacity), 1.0);
      ctx.drawImage(circleCanvas, x - circleRadius, y - circleRadius);
    }

    // 2. Colorize based on alpha intensity
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
 * HeatmapLayer Component for React Leaflet
 * Statically locked to geographic coordinates without drifting during pan/zoom.
 */
export function HeatmapLayer({
  points = [],
  radius = 34,
  blur = 22,
  max = 1.0,
  opacity = 0.82,
}) {
  const map = useMap();
  const canvasRef = useRef(null);
  const heatRef = useRef(null);

  useEffect(() => {
    // Canvas element inside overlayPane
    const canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-canvas');
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '300';

    const pane = map.getPanes().overlayPane;
    pane.appendChild(canvas);
    canvasRef.current = canvas;

    const heat = createSimpleHeat(canvas);
    heatRef.current = heat;

    function reset() {
      // Position canvas at layerPoint of (0,0) so Leaflet moves it automatically during pan
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);

      const size = map.getSize();
      if (canvas.width !== size.x || canvas.height !== size.y) {
        heat.resize(size.x, size.y);
      }

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

      const size = map.getSize();
      const r = radius + blur;
      const pixelPoints = [];

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const containerPt = map.latLngToContainerPoint([pt[0], pt[1]]);

        // Filter points within viewport + padding
        if (
          containerPt.x >= -r &&
          containerPt.x <= size.x + r &&
          containerPt.y >= -r &&
          containerPt.y <= size.y + r
        ) {
          pixelPoints.push([containerPt.x, containerPt.y, pt[2] || 0.3]);
        }
      }

      heat.setData(pixelPoints);
      heat.draw(0.04);
      canvas.style.opacity = String(opacity);
    }

    // Leaflet moves overlayPane during pan; we reset on moveend and zoomend
    map.on('moveend', reset);
    map.on('zoomend', reset);
    map.on('resize', reset);

    reset();

    return () => {
      map.off('moveend', reset);
      map.off('zoomend', reset);
      map.off('resize', reset);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };
  }, [map, points, radius, blur, max, opacity]);

  return null;
}
