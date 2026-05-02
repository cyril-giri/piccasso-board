"use client";

import { Button } from "@/components/ui/button";
import { PromptInput } from "@/components/canvas/prompt-input";
import type { Camera, XYWH } from "@/types/canvas";

type SelectionToolProps = {
  camera: Camera;
  isActive: boolean;
  selectionBounds: XYWH | null;
  isPromptOpen: boolean;
  promptValue: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  error?: string | null;
  onCancel: () => void;
};

export const SelectionTool = ({
  camera,
  isActive,
  selectionBounds,
  isPromptOpen,
  promptValue,
  onPromptChange,
  onSubmit,
  disabled = false,
  error,
  onCancel,
}: SelectionToolProps) => {
  if (!isActive && !isPromptOpen) return null;

  if (isPromptOpen && selectionBounds) {
    return (
      <div
        className="absolute"
        style={{
          transform: `translate(${selectionBounds.x + camera.x}px, ${selectionBounds.y + camera.y}px)`,
        }}
      >
        <PromptInput
          value={promptValue}
          onChange={onPromptChange}
          onSubmit={onSubmit}
          disabled={disabled}
          error={error}
          onCancel={onCancel}
        />
      </div>
    );
  }

  return (
    <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">
      <div className="max-w-sm rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-lg">
        <p className="font-medium text-slate-900">AI Selection</p>
        <p className="mt-1 text-slate-600">
          Drag on the board to choose the area you want to transform into an AI image.
        </p>
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};
