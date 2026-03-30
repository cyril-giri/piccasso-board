"use client";

import { LiveObject } from "@liveblocks/client";
import { nanoid } from "nanoid";
import React, { useCallback, useMemo, useState, useEffect } from "react";
import getStroke from "perfect-freehand";

import { useDisableScrollBounce } from "@/hooks/use-disable-scroll-bounce";
import { useDeleteLayers } from "@/hooks/use-delete-layers";
import { useSelectionBounds } from "@/hooks/use-selection-bounds";
import { useSelectionState } from "@/store/selection-state";
import {
  colorToCSS,
  connectionIdToColor,
  findIntersectingLayersWithRectangle,
  getSvgPathFromStroke,
  penPointsToPathLayer,
  pointerEventToCanvasPoint,
  resizeBounds,
} from "@/lib/utils";
import {
  useCanRedo,
  useCanUndo,
  useHistory,
  useMutation,
  useOthersMapped,
  useSelf,
  useStorage,
} from "@/liveblocks.config";
import {
  type Camera,
  CanvasMode,
  type CanvasState,
  type Color,
  LayerType,
  type Layer,
  type Point,
  type Side,
  type XYWH,
} from "@/types/canvas";

import { CursorsPresence } from "./cursors-presence";
import { Info } from "./info";
import { LayerPreview } from "./layer-preview";
import { Participants } from "./participants";
import { Path } from "./path";
import { SelectionBox } from "./selection-box";
import { SelectionTools } from "./selection-tools";
import { SelectionTool } from "@/components/canvas/selection-tool";
import { Toolbar } from "./toolbar";

const MAX_LAYERS = 100;
const MULTISELECTION_THRESHOLD = 5;
const MAX_EXPORT_DIMENSION = 512;

const getSelectionRect = (a: Point, b: Point) => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

const escapeSvgText = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const renderLayerToSvg = (layer: Layer, selectionBounds: XYWH) => {
  const offsetX = layer.x - selectionBounds.x;
  const offsetY = layer.y - selectionBounds.y;

  switch (layer.type) {
    case LayerType.Path: {
      const path = getSvgPathFromStroke(
        getStroke(layer.points, {
          size: 16,
          thinning: 0.5,
          smoothing: 0.5,
          streamline: 0.5,
        }),
      );

      return `<path d="${path}" fill="${colorToCSS(layer.fill)}" transform="translate(${offsetX} ${offsetY})"/>`;
    }
    case LayerType.Rectangle:
      return `<rect x="${offsetX}" y="${offsetY}" width="${layer.width}" height="${layer.height}" fill="${colorToCSS(
        layer.fill,
      )}"/>`;
    case LayerType.Ellipse:
      return `<ellipse cx="${layer.width / 2 + offsetX}" cy="${layer.height / 2 + offsetY}" rx="${layer.width / 2}" ry="${layer.height / 2}" fill="${colorToCSS(
        layer.fill,
      )}"/>`;
    case LayerType.Text: {
      const text = escapeSvgText(layer.value || "Text");
      const fontSize = Math.min(24, layer.height * 0.2);
      return `<text x="${offsetX + 8}" y="${offsetY + fontSize + 4}" fill="${colorToCSS(
        layer.fill,
      )}" font-family="sans-serif" font-size="${fontSize}px">${text}</text>`;
    }
    case LayerType.Note: {
      const text = escapeSvgText(layer.value || "Text");
      const fontSize = Math.min(24, layer.height * 0.15);
      return `<rect x="${offsetX}" y="${offsetY}" width="${layer.width}" height="${layer.height}" fill="${colorToCSS(
        layer.fill,
      )}"/>` +
        `<text x="${offsetX + 8}" y="${offsetY + fontSize + 8}" fill="${colorToCSS(
          layer.fill,
        )}" font-family="sans-serif" font-size="${fontSize}px">${text}</text>`;
    }
    case LayerType.Image:
      return `<image x="${offsetX}" y="${offsetY}" width="${layer.width}" height="${layer.height}" href="${escapeSvgText(
        layer.src,
      )}" preserveAspectRatio="none"/>`;
    default:
      return "";
  }
};

const buildSelectionSvg = (selectedLayers: Layer[], selectionBounds: XYWH) => {
  const content = selectedLayers
    .map((layer) => renderLayerToSvg(layer, selectionBounds))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${selectionBounds.width}" height="${selectionBounds.height}" viewBox="0 0 ${selectionBounds.width} ${selectionBounds.height}">
  <rect width="100%" height="100%" fill="transparent" />
  ${content}
</svg>`;
};

const exportSelectionToPng = async (
  selectedLayers: Layer[],
  selectionBounds: XYWH,
) => {
  if (!selectionBounds?.width || !selectionBounds?.height) return null;

  const svg = buildSelectionSvg(selectedLayers, selectionBounds);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();
  image.src = url;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load selection image."));
  });

  const scale = Math.min(
    1,
    MAX_EXPORT_DIMENSION / selectionBounds.width,
    MAX_EXPORT_DIMENSION / selectionBounds.height,
  );

  const width = Math.max(1, Math.round(selectionBounds.width * scale));
  const height = Math.max(1, Math.round(selectionBounds.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error("Canvas is not supported in this environment.");
  }

  context.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(url);

  return canvas.toDataURL("image/png");
};

type CanvasProps = {
  boardId: string;
};

export const Canvas = ({ boardId }: CanvasProps) => {
  const layerIds = useStorage((root) => root.layerIds);

  const pencilDraft = useSelf((me) => me.presence.pencilDraft);
  const selectedLayerIds = useSelf((me) => me.presence.selection);
  const [canvasState, setCanvasState] = useState<CanvasState>({
    mode: CanvasMode.None,
  });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
  const [lastUsedColor, setLastUsedColor] = useState<Color>({
    r: 0,
    g: 0,
    b: 0,
  });

  const aiPrompt = useSelectionState((state) => state.aiPrompt);
  const isAiSelectionActive = useSelectionState(
    (state) => state.isAiSelectionActive,
  );
  const isPromptOpen = useSelectionState((state) => state.isPromptOpen);
  const isGenerating = useSelectionState((state) => state.isGenerating);
  const aiError = useSelectionState((state) => state.error);
  const selectionBounds = useSelectionState((state) => state.selectionBounds);
  const setAiPrompt = useSelectionState((state) => state.setAiPrompt);
  const setSelectionBounds = useSelectionState(
    (state) => state.setSelectionBounds,
  );
  const setIsAiSelectionActive = useSelectionState(
    (state) => state.setIsAiSelectionActive,
  );
  const setIsPromptOpen = useSelectionState((state) => state.setIsPromptOpen);
  const setIsGenerating = useSelectionState((state) => state.setIsGenerating);
  const setError = useSelectionState((state) => state.setError);
  const resetAiSelection = useSelectionState((state) => state.reset);
  const selectedLayers = useStorage((root) =>
    selectedLayerIds
      .map((id) => root.layers.get(id))
      .filter((layer): layer is Layer => Boolean(layer)),
  );
  const selectedLayerBounds = useSelectionBounds();

  useDisableScrollBounce();
  const history = useHistory();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const insertLayer = useMutation(
    (
      { storage, setMyPresence },
      layerType:
        | LayerType.Ellipse
        | LayerType.Rectangle
        | LayerType.Text
        | LayerType.Note,
      position: Point,
    ) => {
      const liveLayers = storage.get("layers");

      if (liveLayers.size >= MAX_LAYERS) return;

      const liveLayerIds = storage.get("layerIds");
      const layerId = nanoid();
      const layer = new LiveObject({
        type: layerType,
        x: position.x,
        y: position.y,
        height: 100,
        width: 100,
        fill: lastUsedColor,
      });

      liveLayerIds.push(layerId);
      liveLayers.set(layerId, layer);

      setMyPresence({ selection: [layerId] }, { addToHistory: true });
      setCanvasState({ mode: CanvasMode.None });
    },
    [lastUsedColor],
  );

  const translateSelectedLayers = useMutation(
    ({ storage, self }, point: Point) => {
      if (canvasState.mode !== CanvasMode.Translating) return;

      const offset = {
        x: point.x - canvasState.current.x,
        y: point.y - canvasState.current.y,
      };

      const liveLayers = storage.get("layers");

      for (const id of self.presence.selection) {
        const layer = liveLayers.get(id);

        if (layer)
          layer.update({
            x: layer.get("x") + offset.x,
            y: layer.get("y") + offset.y,
          });
      }

      setCanvasState({ mode: CanvasMode.Translating, current: point });
    },
    [canvasState],
  );

  const unselectLayers = useMutation(({ self, setMyPresence }) => {
    if (self.presence.selection.length > 0) {
      setMyPresence({ selection: [] }, { addToHistory: true });
    }
  }, []);

  const updateSelectionNet = useMutation(
    ({ storage, setMyPresence }, current: Point, origin: Point) => {
      const layers = storage.get("layers").toImmutable();
      setCanvasState({
        mode: CanvasMode.SelectionNet,
        origin,
        current,
      });

      const ids = findIntersectingLayersWithRectangle(
        layerIds,
        layers,
        origin,
        current,
      );

      setMyPresence({ selection: ids });
    },
    [layerIds],
  );

  const updateAiSelectionNet = useMutation(
    ({ storage, setMyPresence }, current: Point, origin: Point) => {
      const layers = storage.get("layers").toImmutable();
      const selectionRect = getSelectionRect(origin, current);

      setCanvasState({
        mode: CanvasMode.AISelectionNet,
        origin,
        current,
      });

      const ids = findIntersectingLayersWithRectangle(
        layerIds,
        layers,
        origin,
        current,
      );

      setMyPresence({ selection: ids });
      setSelectionBounds(selectionRect);
    },
    [layerIds, setSelectionBounds],
  );

  const startMultiSelection = useCallback((current: Point, origin: Point) => {
    if (
      Math.abs(current.x - origin.x) + Math.abs(current.y - origin.y) >
      MULTISELECTION_THRESHOLD
    ) {
      setCanvasState({
        mode: CanvasMode.SelectionNet,
        origin,
        current,
      });
    }
  }, []);

  const startAiSelection = useCallback(
    (current: Point, origin: Point) => {
      if (
        Math.abs(current.x - origin.x) + Math.abs(current.y - origin.y) >
        MULTISELECTION_THRESHOLD
      ) {
        updateAiSelectionNet(current, origin);
      }
    },
    [updateAiSelectionNet],
  );

  const continueDrawing = useMutation(
    ({ self, setMyPresence }, point: Point, e: React.PointerEvent) => {
      const { pencilDraft } = self.presence;

      if (
        canvasState.mode !== CanvasMode.Pencil ||
        e.buttons !== 1 ||
        pencilDraft == null
      )
        return;

      setMyPresence({
        cursor: point,
        pencilDraft:
          pencilDraft.length === 1 &&
          pencilDraft[0][0] === point.x &&
          pencilDraft[0][1] === point.y
            ? pencilDraft
            : [...pencilDraft, [point.x, point.y, e.pressure]],
      });
    },
    [canvasState.mode],
  );

  const insertPath = useMutation(
    ({ storage, self, setMyPresence }) => {
      const liveLayers = storage.get("layers");
      const { pencilDraft } = self.presence;

      if (
        pencilDraft == null ||
        pencilDraft.length < 2 ||
        liveLayers.size >= MAX_LAYERS
      ) {
        setMyPresence({ pencilDraft: null });
        return;
      }

      const id = nanoid();
      liveLayers.set(
        id,
        new LiveObject(penPointsToPathLayer(pencilDraft, lastUsedColor)),
      );

      const liveLayerIds = storage.get("layerIds");
      liveLayerIds.push(id);

      setMyPresence({ pencilDraft: null });
      setCanvasState({ mode: CanvasMode.Pencil });
    },
    [lastUsedColor],
  );

  const insertImageLayer = useMutation(
    (
      { storage, setMyPresence },
      src: string,
      bounds: XYWH,
    ) => {
      const liveLayers = storage.get("layers");

      if (liveLayers.size >= MAX_LAYERS) return;

      const liveLayerIds = storage.get("layerIds");
      const layerId = nanoid();
      liveLayers.set(
        layerId,
        new LiveObject({
          type: LayerType.Image,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          src,
        }),
      );

      liveLayerIds.push(layerId);
      setMyPresence({ selection: [layerId] }, { addToHistory: true });
    },
    [],
  );

  const startDrawing = useMutation(
    ({ setMyPresence }, point: Point, pressure: number) => {
      setMyPresence({
        pencilDraft: [[point.x, point.y, pressure]],
        penColor: lastUsedColor,
      });
    },
    [lastUsedColor],
  );

  const resizeSelectedLayer = useMutation(
    ({ storage, self }, point: Point) => {
      if (canvasState.mode !== CanvasMode.Resizing) return;

      const bounds = resizeBounds(
        canvasState.initialBounds,
        canvasState.corner,
        point,
      );

      const liveLayers = storage.get("layers");
      const layer = liveLayers.get(self.presence.selection[0]);

      if (layer) layer.update(bounds);
    },
    [canvasState],
  );

  const onResizeHandlePointerDown = useCallback(
    (corner: Side, initialBounds: XYWH) => {
      history.pause();

      setCanvasState({
        mode: CanvasMode.Resizing,
        initialBounds,
        corner,
      });
    },
    [history],
  );

  const onWheel = useCallback((e: React.WheelEvent) => {
    setCamera((camera) => ({
      x: camera.x - e.deltaX,
      y: camera.y - e.deltaY,
    }));
  }, []);

  const onPointerMove = useMutation(
    ({ setMyPresence }, e: React.PointerEvent) => {
      e.preventDefault();

      const current = pointerEventToCanvasPoint(e, camera);

      if (canvasState.mode === CanvasMode.Pressing) {
        startMultiSelection(current, canvasState.origin);
      } else if (canvasState.mode === CanvasMode.SelectionNet) {
        updateSelectionNet(current, canvasState.origin);
      } else if (canvasState.mode === CanvasMode.AISelectionPressing) {
        startAiSelection(current, canvasState.origin);
      } else if (canvasState.mode === CanvasMode.AISelectionNet) {
        updateAiSelectionNet(current, canvasState.origin);
      } else if (canvasState.mode === CanvasMode.Translating) {
        translateSelectedLayers(current);
      } else if (canvasState.mode === CanvasMode.Resizing) {
        resizeSelectedLayer(current);
      } else if (canvasState.mode === CanvasMode.Pencil) {
        continueDrawing(current, e);
      }

      setMyPresence({ cursor: current });
    },
    [
      startMultiSelection,
      updateSelectionNet,
      continueDrawing,
      canvasState,
      resizeSelectedLayer,
      camera,
      translateSelectedLayers,
    ],
  );

  const onPointerLeave = useMutation(({ setMyPresence }) => {
    setMyPresence({
      cursor: null,
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const point = pointerEventToCanvasPoint(e, camera);

      if (canvasState.mode === CanvasMode.Inserting) return;

      if (canvasState.mode === CanvasMode.Pencil) {
        startDrawing(point, e.pressure);
        return;
      }

      if (isAiSelectionActive) {
        setCanvasState({
          mode: CanvasMode.AISelectionPressing,
          origin: point,
        });
        return;
      }

      setCanvasState({ origin: point, mode: CanvasMode.Pressing });
    },
    [camera, canvasState.mode, setCanvasState, startDrawing, isAiSelectionActive],
  );

  const onPointerUp = useMutation(
    ({}, e) => {
      const point = pointerEventToCanvasPoint(e, camera);

      if (
        canvasState.mode === CanvasMode.None ||
        canvasState.mode === CanvasMode.Pressing
      ) {
        if (isAiSelectionActive) {
          setIsAiSelectionActive(false);
        }

        unselectLayers();
        setCanvasState({
          mode: CanvasMode.None,
        });
      } else if (canvasState.mode === CanvasMode.AISelectionNet) {
        setIsAiSelectionActive(false);

        if (canvasState.origin && canvasState.current) {
          setSelectionBounds(getSelectionRect(canvasState.origin, canvasState.current));
          setIsPromptOpen(true);
        }

        setCanvasState({
          mode: CanvasMode.None,
        });
      } else if (canvasState.mode === CanvasMode.Pencil) {
        insertPath();
      } else if (canvasState.mode === CanvasMode.Inserting) {
        insertLayer(canvasState.layerType, point);
      } else {
        setCanvasState({
          mode: CanvasMode.None,
        });
      }

      history.resume();
    },
    [
      setCanvasState,
      camera,
      canvasState,
      history,
      insertLayer,
      unselectLayers,
      insertPath,
    ],
  );

  const selections = useOthersMapped((other) => other.presence.selection);

  const onLayerPointerDown = useMutation(
    ({ self, setMyPresence }, e: React.PointerEvent, layerId: string) => {
      if (
        canvasState.mode === CanvasMode.Pencil ||
        canvasState.mode === CanvasMode.Inserting
      )
        return;

      history.pause();
      e.stopPropagation();

      const point = pointerEventToCanvasPoint(e, camera);

      if (!self.presence.selection.includes(layerId)) {
        setMyPresence({ selection: [layerId] }, { addToHistory: true });
      }

      setCanvasState({ mode: CanvasMode.Translating, current: point });
    },
    [setCanvasState, camera, history, canvasState.mode],
  );

  const layerIdsToColorSelection = useMemo(() => {
    const layerIdsToColorSelection: Record<string, string> = {};

    for (const user of selections) {
      const [connectionId, selection] = user;

      for (const layerId of selection) {
        layerIdsToColorSelection[layerId] = connectionIdToColor(connectionId);
      }
    }

    return layerIdsToColorSelection;
  }, [selections]);

  const deleteLayers = useDeleteLayers();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "z":
          if (e.ctrlKey || e.metaKey) {
            if (e.shiftKey || e.altKey) history.redo();
            else history.undo();

            break;
          }
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [deleteLayers, history]);

  const handleGenerateAiImage = useCallback(async () => {
    const prompt = aiPrompt.trim();
    const bounds = selectionBounds ?? selectedLayerBounds;

    if (prompt.length === 0) {
      setError("Please enter a prompt for your AI image.");
      return;
    }

    if (!bounds || selectedLayers.length === 0) {
      setError("Please select an area to generate from first.");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const imageBase64 = await exportSelectionToPng(selectedLayers, bounds);

      if (!imageBase64) {
        throw new Error("Unable to export selected area.");
      }

      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          imageBase64,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "AI generation failed.");
      }

      if (!result.url) {
        throw new Error("AI provider did not return an image URL.");
      }

      insertImageLayer(result.url, bounds);
      resetAiSelection();
      setIsPromptOpen(false);
      setCanvasState({ mode: CanvasMode.None });
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to generate the AI image.",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [
    aiPrompt,
    selectedLayerBounds,
    selectionBounds,
    selectedLayers,
    insertImageLayer,
    resetAiSelection,
    setCanvasState,
    setError,
    setIsGenerating,
    setIsPromptOpen,
  ]);

  return (
    <main className="h-full w-full relative bg-neutral-100 touch-none">
      <Info boardId={boardId} />
      <Participants />
      <Toolbar
        canvasState={canvasState}
        setCanvasState={setCanvasState}
        onAiSelection={() => {
          resetAiSelection();
          setIsAiSelectionActive(true);
          setIsPromptOpen(false);
          setSelectionBounds(null);
          setAiPrompt("");
          setError(null);
          setIsGenerating(false);
          setCanvasState({ mode: CanvasMode.None });
        }}
        canRedo={canRedo}
        canUndo={canUndo}
        undo={history.undo}
        redo={history.redo}
      />
      <SelectionTools camera={camera} setLastUsedColor={setLastUsedColor} />
      <SelectionTool
        camera={camera}
        isActive={isAiSelectionActive}
        selectionBounds={selectionBounds}
        isPromptOpen={isPromptOpen}
        promptValue={aiPrompt}
        onPromptChange={setAiPrompt}
        onSubmit={handleGenerateAiImage}
        disabled={isGenerating}
        error={aiError}
        onCancel={() => {
          resetAiSelection();
          setIsPromptOpen(false);
          setCanvasState({ mode: CanvasMode.None });
        }}
      />

      <svg
        className="h-[100vh] w-[100vw]"
        onWheel={onWheel}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <g
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px)`,
          }}
        >
          {layerIds.map((layerId) => (
            <LayerPreview
              key={layerId}
              id={layerId}
              onLayerPointerDown={onLayerPointerDown}
              selectionColor={layerIdsToColorSelection[layerId]}
            />
          ))}
          <SelectionBox onResizeHandlePointerDown={onResizeHandlePointerDown} />
          {(canvasState.mode === CanvasMode.SelectionNet ||
            canvasState.mode === CanvasMode.AISelectionNet) &&
            canvasState.current != null && (
              <rect
                className="fill-blue-500/5 stroke-blue-500 stroke-1"
                x={Math.min(canvasState.origin.x, canvasState.current.x)}
                y={Math.min(canvasState.origin.y, canvasState.current.y)}
                width={Math.abs(canvasState.origin.x - canvasState.current.x)}
                height={Math.abs(canvasState.origin.y - canvasState.current.y)}
              />
            )}
          <CursorsPresence />
          {pencilDraft != null && pencilDraft.length > 0 && (
            <Path
              points={pencilDraft}
              fill={colorToCSS(lastUsedColor)}
              x={0}
              y={0}
            />
          )}
        </g>
      </svg>
    </main>
  );
};
