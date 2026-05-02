import { type ClassValue, clsx } from "clsx";
import React from "react";
import { twMerge } from "tailwind-merge";

import {
  type Color,
  type Camera,
  type XYWH,
  Side,
  type Point,
  type Layer,
  type PathLayer,
  LayerType,
} from "@/types/canvas";

const COLORS = ["#DC2626", "#D97706", "#059669", "#7C3AED", "#DB2777"];

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function connectionIdToColor(connectionId: number): string {
  return COLORS[connectionId % COLORS.length];
}

export function pointerEventToCanvasPoint(
  e: React.PointerEvent,
  camera: Camera,
) {
  return {
    x: Math.round(e.clientX) - camera.x,
    y: Math.round(e.clientY) - camera.y,
  };
}

export function colorToCSS(color: Color) {
  return `#${color.r.toString(16).padStart(2, "0")}${color.g
    .toString(16)
    .padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`;
}

export function resizeBounds(bounds: XYWH, corner: Side, point: Point): XYWH {
  const result = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };

  if ((corner & Side.Left) === Side.Left) {
    result.x = Math.min(point.x, bounds.x + bounds.width);
    result.width = Math.abs(bounds.x + bounds.width - point.x);
  }

  if ((corner & Side.Right) === Side.Right) {
    result.x = Math.min(point.x, bounds.x);
    result.width = Math.abs(point.x - bounds.x);
  }

  if ((corner & Side.Top) === Side.Top) {
    result.y = Math.min(point.y, bounds.y + bounds.height);
    result.height = Math.abs(bounds.y + bounds.height - point.y);
  }

  if ((corner & Side.Bottom) === Side.Bottom) {
    result.y = Math.min(point.y, bounds.y);
    result.height = Math.abs(point.y - bounds.y);
  }

  return result;
}

export function findIntersectingLayersWithRectangle(
  layerIds: readonly string[],
  layers: ReadonlyMap<string, Layer>,
  a: Point,
  b: Point,
) {
  const rect = {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };

  const ids = [];

  for (const layerId of layerIds) {
    const layer = layers.get(layerId);

    if (layer == null) continue;

    const { x, y, height, width } = layer;

    if (
      rect.x + rect.width > x &&
      rect.x < x + width &&
      rect.y + rect.height > y &&
      rect.y < y + height
    )
      ids.push(layerId);
  }

  return ids;
}

export function getElementAtPosition(
  layerIds: readonly string[],
  layers: ReadonlyMap<string, Layer>,
  point: Point,
) {
  for (let index = layerIds.length - 1; index >= 0; index -= 1) {
    const layer = layers.get(layerIds[index]);

    if (!layer) continue;

    if (isPointInsideLayer(point, layer)) {
      return layerIds[index];
    }
  }

  return null;
}

function isPointInsideLayer(point: Point, layer: Layer) {
  const px = point.x;
  const py = point.y;

  switch (layer.type) {
    case LayerType.Rectangle:
    case LayerType.Text:
    case LayerType.Note:
    case LayerType.Image:
      return (
        px >= layer.x &&
        px <= layer.x + layer.width &&
        py >= layer.y &&
        py <= layer.y + layer.height
      );
    case LayerType.Ellipse: {
      const rx = layer.width / 2;
      const ry = layer.height / 2;
      const cx = layer.x + rx;
      const cy = layer.y + ry;
      const dx = px - cx;
      const dy = py - cy;
      return dx * dx / (rx * rx) + dy * dy / (ry * ry) <= 1;
    }
    case LayerType.Path:
      return (
        px >= layer.x &&
        px <= layer.x + layer.width &&
        py >= layer.y &&
        py <= layer.y + layer.height
      );
    default:
      return false;
  }
}

export function getContrastingTextColor(color: Color) {
  const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;

  return luminance > 182 ? "black" : "white";
}

export function penPointsToPathLayer(
  points: number[][],
  color: Color,
): PathLayer {
  if (points.length < 2)
    throw new Error("Cannot transform points with less than 2 points.");

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const [x, y] = point;

    if (left > x) left = x;
    if (top > y) top = y;
    if (right < x) right = x;
    if (bottom < y) bottom = y;
  }

  return {
    type: LayerType.Path,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    fill: color,
    points: points.map(([x, y, pressure]) => [x - left, y - top, pressure]),
  };
}

export function getDistancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    const pxDx = px - x1;
    const pyDy = py - y1;
    return Math.sqrt(pxDx * pxDx + pyDy * pyDy);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const projectionX = x1 + t * dx;
  const projectionY = y1 + t * dy;
  const distX = px - projectionX;
  const distY = py - projectionY;

  return Math.sqrt(distX * distX + distY * distY);
}

export function isPointNearLine(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
) {
  return getDistancePointToSegment(px, py, x1, y1, x2, y2) <= radius;
}

export function splitPathByEraserRadius(
  points: number[][],
  layerX: number,
  layerY: number,
  eraserX: number,
  eraserY: number,
  radius: number,
) {
  if (points.length < 2) return [];

  const radiusSq = radius * radius;
  const keepSegments: number[][][] = [];
  let currentSegment: number[][] = [];

  const pointIsErased = points.map((point, index) => {
    const [x, y] = point;
    const absoluteX = x + layerX;
    const absoluteY = y + layerY;
    const dx = absoluteX - eraserX;
    const dy = absoluteY - eraserY;
    const isWithinPoint = dx * dx + dy * dy <= radiusSq;

    if (isWithinPoint) return true;

    const next = points[index + 1];

    if (next) {
      const [nx, ny] = next;
      if (
        isPointNearLine(
          eraserX,
          eraserY,
          absoluteX,
          absoluteY,
          nx + layerX,
          ny + layerY,
          radius,
        )
      )
        return true;
    }

    return false;
  });

  for (let index = 0; index < points.length; index++) {
    if (pointIsErased[index]) {
      if (currentSegment.length > 1) {
        keepSegments.push(currentSegment);
      }
      currentSegment = [];
      continue;
    }

    currentSegment.push(points[index]);
  }

  if (currentSegment.length > 1) {
    keepSegments.push(currentSegment);
  }

  return keepSegments;
}

export function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return "";

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"],
  );

  d.push("Z");
  return d.join(" ");
}
