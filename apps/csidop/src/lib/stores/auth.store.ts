"use client";

import { create } from "zustand";
import type { CapacityScope, Role } from "@/lib/types/api";

export interface MeResponse {
  staffId: string;
  staffCode: string;
  name: string;
  email: string;
  roleCode: string;
  roleName: string;
  role: Role;
  deptCode: string;
  departmentId: string;
  subTeam: string | null;
  capacityScope: CapacityScope;
  systemConfigFlag: boolean;
}

interface AuthState {
  user: MeResponse | null;
  isLoading: boolean;
  setUser: (user: MeResponse | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
