"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useMember } from "./useMember";

interface AdminModeContextType {
  isAdmin: boolean;
  isAdminMode: boolean;
  setAdminMode: (mode: boolean) => void;
  toggleAdminMode: () => void;
}

const AdminModeContext = createContext<AdminModeContextType>({
  isAdmin: false,
  isAdminMode: false,
  setAdminMode: () => {},
  toggleAdminMode: () => {},
});

export function AdminModeProvider({ children }: { children: ReactNode }) {
  const { profile } = useMember();
  const isAdmin = Boolean(profile?.is_admin);
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined" && isAdmin) {
      const saved = localStorage.getItem("reinforce_admin_mode");
      if (saved === "true") {
        setIsAdminMode(true);
      }
    }
  }, [isAdmin]);

  const setAdminMode = (mode: boolean) => {
    if (!isAdmin) return;
    setIsAdminMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("reinforce_admin_mode", String(mode));
    }
  };

  const toggleAdminMode = () => {
    setAdminMode(!isAdminMode);
  };

  return (
    <AdminModeContext.Provider
      value={{
        isAdmin,
        isAdminMode: isAdmin && isAdminMode,
        setAdminMode,
        toggleAdminMode,
      }}
    >
      {children}
    </AdminModeContext.Provider>
  );
}

export function useAdminMode() {
  return useContext(AdminModeContext);
}
