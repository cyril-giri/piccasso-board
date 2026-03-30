import { create } from "zustand";

import type { XYWH } from "@/types/canvas";

type SelectionState = {
  aiPrompt: string;
  selectionBounds: XYWH | null;
  isAiSelectionActive: boolean;
  isPromptOpen: boolean;
  isGenerating: boolean;
  error: string | null;
  setAiPrompt: (aiPrompt: string) => void;
  setSelectionBounds: (selectionBounds: XYWH | null) => void;
  setIsAiSelectionActive: (isAiSelectionActive: boolean) => void;
  setIsPromptOpen: (isPromptOpen: boolean) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useSelectionState = create<SelectionState>((set) => ({
  aiPrompt: "",
  selectionBounds: null,
  isAiSelectionActive: false,
  isPromptOpen: false,
  isGenerating: false,
  error: null,
  setAiPrompt: (aiPrompt) => set({ aiPrompt }),
  setSelectionBounds: (selectionBounds) => set({ selectionBounds }),
  setIsAiSelectionActive: (isAiSelectionActive) => set({ isAiSelectionActive }),
  setIsPromptOpen: (isPromptOpen) => set({ isPromptOpen }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      aiPrompt: "",
      selectionBounds: null,
      isAiSelectionActive: false,
      isPromptOpen: false,
      isGenerating: false,
      error: null,
    }),
}));
