/**
 * Leaflet Canvas Heatmap Layer.
 * Renders smooth continuous thermal gradients locked statically to geographic coordinates.
 * Uses value-based risk color mapping (Green -> Amber -> Red) and zoom-adaptive radius
 * so regional overviews do not blow up into solid discs, and low-risk zones stay green.
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Interpolate linearly between two RGB triples
 */
function interpolateRgb(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

/**
 * Map landslide risk (0.0 to 1.0) to natural thermal color spectrum:
 * 0.00 - 0.30 : Vibrant Green (#22c55e to #4ade80) -> Safe / Low Risk
 * 0.30 - 0.50 : Light Green to Amber Yellow (#facc15) -> Moderate Risk
 * 0.50 - 0.70 : Yellow to Orange (#f97316) -> Elevated / High Risk
 * 0.70 - 0.85 : Orange to Bright Red (#ef4444) -> Severe Risk
 * 0.85 - 1.00 : Red to Deep Crimson (#991b1b) -> Critical Emergency
 */
function getRiskRgb(v) {
  const clamped = Math.max(0, Math.min(1, v));

  if (clamped < 0.30) {
    const t = clamped / 0.30;
    return interpolateRgb([34, 197, 94], [74, 222, 128], t);
  } else if (clamped < 0.50) {
    const t = (clamped - 0.30) / 0.20;
    return interpolateRgb([74, 222, 128], [250, 204, 21], t);
  } else if (clamped < 0.70) {
    const t = (clamped - 0.50) / 0.20;
    return interpolateRgb([250, 204, 21], [249, 115, 22], t);
  } else if (clamped < 0.85) {
    const t = (clamped - 0.70) / 0.15;
    return interpolateRgb([249, 115, 22], [239, 68, 68], t);
  } else {
    const t = (clamped - 0.85) / 0.15;
    return interpolateRgb([239, 68, 68], [153, 27, 27], t);
  }
}

/**
 * Pre-generate offscreen canvas radial stamps for discrete risk levels.
 * Overlapping stamps blend smoothly without accumulating false alpha saturation.
 */
function createRiskStamps(radius, blur) {
  const totalRadius = Math.max(6, Math.round(radius + blur));
  const diameter = totalRadius * 2;
  const numLevels = 32;
  const stamps = [];

  for (let i = 0; i <= numLevels; i++) {
    const risk = i / numLevels;
    const rgb = getRiskRgb(risk);

    const canvas = document.createElement('canvas');
    canvas.width = diameter;
    canvas.height = diameter;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(
      totalRadius,
      totalRadius,
      Math.max(1, radius * 0.25),
      totalRadius,
      totalRadius,
      totalRadius
    );

    // Center opacity scales slightly with risk so severe danger areas pop clearly
    const centerAlpha = risk >= 0.7 ? 0.88 : risk >= 0.4 ? 0.78 : 0.68;
    grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${centerAlpha})`);
    grad.addColorStop(0.5, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${centerAlpha * 0.55})`);
    grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(totalRadius, totalRadius, totalRadius, 0, Math.PI * 2);
    ctx.fill();

    stamps.push({
      canvas,
      totalRadius,
    });
  }

  return stamps;
}

/**
 * Calculate dynamic radius based on current map zoom level.
 * Prevents points from bloating into giant solid discs when zoomed out.
 */
function getZoomMetrics(zoom) {
  if (zoom <= 6) return { radius: 5, blur: 4 };
  if (zoom === 7) return { radius: 8, blur: 6 };
  if (zoom === 8) return { radius: 12, blur: 8 };
  if (zoom === 9) return { radius: 16, blur: 10 };
  if (zoom === 10) return { radius: 22, blur: 14 };
  if (zoom === 11) return { radius: 28, blur: 18 };
  return { radius: 34, blur: 22 };
}

/**
 * HeatmapLayer Component for React Leaflet.
 * True value-based continuous thermal surface locked statically to coordinates.
 */
export function HeatmapLayer({ points = [], opacity = 0.85 }) {
  const map = useMap();
  const canvasRef = useRef(null);
  const stampsCacheRef = useRef({});

  useEffect(() => {
    const canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-canvas');
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '300';

    const pane = map.getPanes().overlayPane;
    pane.appendChild(canvas);
    canvasRef.current = canvas;

    function render() {
      if (!canvas || !map) return;

      // 1. Position canvas anchored to layer coordinate (0, 0)
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);

      const size = map.getSize();
      if (canvas.width !== size.x || canvas.height !== size.y) {
        canvas.width = size.x;
        canvas.height = size.y;
      }

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size.x, size.y);

      if (!points || points.length === 0) return;

      // 2. Compute zoom-appropriate radius
      const currentZoom = map.getZoom();
      const { radius, blur } = getZoomMetrics(currentZoom);
      const cacheKey = `${radius}_${blur}`;

      if (!stampsCacheRef.current[cacheKey]) {
        stampsCacheRef.current[cacheKey] = createRiskStamps(radius, blur);
      }
      const stamps = stampsCacheRef.current[cacheKey];
      const stampRadius = stamps[0].totalRadius;

      // 3. Project geographic coordinates to container screen pixels
      const visiblePoints = [];
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const screenPt = map.latLngToContainerPoint([pt[0], pt[1]]);

        // Viewport cull with padding
        if (
          screenPt.x >= -stampRadius &&
          screenPt.x <= size.x + stampRadius &&
          screenPt.y >= -stampRadius &&
          screenPt.y <= size.y + stampRadius
        ) {
          visiblePoints.push([screenPt.x, screenPt.y, pt[2] || 0]);
        }
      }

      if (visiblePoints.length === 0) return;

      // 4. Sort points ascending so higher-risk hotspots render over safe green baseline
      visiblePoints.sort((a, b) => a[2] - b[2]);

      // 5. Render stamps to canvas
      for (let i = 0; i < visiblePoints.length; i++) {
        const [x, y, risk] = visiblePoints[i];
        const levelIndex = Math.min(32, Math.max(0, Math.round(risk * 32)));
        const stamp = stamps[levelIndex];

        ctx.drawImage(
          stamp.canvas,
          Math.round(x - stampRadius),
          Math.round(y - stampRadius)
        );
      }

      canvas.style.opacity = String(opacity);
    }

    map.on('moveend', render);
    map.on('zoomend', render);
    map.on('resize', render);

    // Initial render
    render();

    return () => {
      map.off('moveend', render);
      map.off('zoomend', render);
      map.off('resize', render);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };
  }, [map, points, opacity]);

  return null;
}
