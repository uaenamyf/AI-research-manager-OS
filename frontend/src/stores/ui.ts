/** 全局 UI 状态（侧边栏开合、当前项目等）。 */
"use client";

import { create } from "zustand";
import type { ResearchProject } from "@/types";

interface UIState {
  sidebarOpen: boolean;
  currentProject: ResearchProject | null;
  toggleSidebar: () => void;
  setCurrentProject: (project: ResearchProject | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  currentProject: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setCurrentProject: (project) => set({ currentProject: project }),
}));