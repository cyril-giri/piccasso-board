"use client";

import { colorToCSS } from "@/lib/utils";
import type { Color } from "@/types/canvas";

type ColorPickerProps = {
  selectedColor?: Color;
  onChange: (color: Color) => void;
};

const PREDEFINED_COLORS: { color: Color; label: string }[] = [
  { color: { r: 0, g: 0, b: 0 }, label: "Black" },
  { color: { r: 255, g: 0, b: 0 }, label: "Red" },
  { color: { r: 0, g: 255, b: 0 }, label: "Green" },
  { color: { r: 0, g: 0, b: 255 }, label: "Blue" },
  { color: { r: 255, g: 255, b: 0 }, label: "Yellow" },
];

export const ColorPicker = ({ onChange, selectedColor }: ColorPickerProps) => {
  const selectedHex = selectedColor ? colorToCSS(selectedColor) : "#000000";

  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="grid grid-cols-5 gap-2">
        {PREDEFINED_COLORS.map(({ color }) => (
          <ColorButton
            key={colorToCSS(color)}
            color={color}
            isSelected={selectedHex === colorToCSS(color)}
            onClick={onChange}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={selectedHex}
          onChange={(event) =>
            onChange(hexToColor(event.target.value || "#000000"))
          }
          className="h-10 w-10 rounded-md border border-neutral-300 p-0"
          aria-label="Choose custom color"
        />
        <input
          type="text"
          value={selectedHex}
          onChange={(event) => {
            const value = event.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
              onChange(hexToColor(value));
            }
          }}
          className="h-10 min-w-[88px] rounded-md border border-neutral-300 px-2 text-sm"
          placeholder="#RRGGBB"
          aria-label="Enter custom hex color"
        />
      </div>
    </div>
  );
};

type ColorButtonProps = {
  onClick: (color: Color) => void;
  color: Color;
  isSelected?: boolean;
};

const ColorButton = ({ color, onClick, isSelected }: ColorButtonProps) => {
  return (
    <button
      type="button"
      className={`h-10 w-10 rounded-md border transition ${
        isSelected ? "border-black ring-2 ring-black" : "border-neutral-300"
      }`}
      onClick={() => onClick(color)}
      aria-pressed={isSelected}
    >
      <span
        className="block h-full w-full rounded-md"
        style={{ background: colorToCSS(color) }}
        aria-hidden
      />
    </button>
  );
};

function hexToColor(hex: string): Color {
  const sanitized = hex.replace("#", "");
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);

  return {
    r: Number.isNaN(r) ? 0 : r,
    g: Number.isNaN(g) ? 0 : g,
    b: Number.isNaN(b) ? 0 : b,
  };
}
