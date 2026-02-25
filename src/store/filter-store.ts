import { create } from "zustand";

export interface FilterState {
  format: string;
  dateRange: string;
  minRating: string;
  status: string;
  setFormat: (v: string) => void;
  setDateRange: (v: string) => void;
  setMinRating: (v: string) => void;
  setStatus: (v: string) => void;
  clearFilters: () => void;
  activeCount: () => number;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  format: "",
  dateRange: "",
  minRating: "",
  status: "",
  setFormat: (format) => set({ format }),
  setDateRange: (dateRange) => set({ dateRange }),
  setMinRating: (minRating) => set({ minRating }),
  setStatus: (status) => set({ status }),
  clearFilters: () => set({ format: "", dateRange: "", minRating: "", status: "" }),
  activeCount: () => {
    const s = get();
    return [s.format, s.dateRange, s.minRating, s.status].filter(Boolean).length;
  },
}));
