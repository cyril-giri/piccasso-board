"use client";

import React from "react";

import type { ImageLayer } from "@/types/canvas";

type ImageProps = {
  id: string;
  layer: ImageLayer;
  onPointerDown: (e: React.PointerEvent, layerId: string) => void;
  selectionColor?: string;
};

export const BoardImage = ({
  id,
  layer,
  onPointerDown,
  selectionColor,
}: ImageProps) => {
  return (
    <image
      className="drop-shadow-md"
      href={layer.src}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      preserveAspectRatio="none"
      onPointerDown={(e) => onPointerDown(e, id)}
      style={{ outline: selectionColor ? `1px solid ${selectionColor}` : "none" }}
    />
  );
};
