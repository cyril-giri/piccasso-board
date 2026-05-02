"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CSSProperties } from "react";

type PromptInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  error?: string | null;
  onCancel: () => void;
  style?: CSSProperties;
};

export const PromptInput = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  error,
  onCancel,
  style,
}: PromptInputProps) => {
  return (
    <div
      className="w-80 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg"
      style={style}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="space-y-3"
      >
        <label className="text-sm font-medium text-slate-900">
          Describe the image
        </label>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="A friendly sketch of a cat in neon lights"
          disabled={disabled}
        />
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-slate-500">
            Generate an AI image from the selected sketch.
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button type="submit" variant="default" size="sm" disabled={disabled}>
            {disabled ? "Generating…" : "Generate"}
            <Check className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};
