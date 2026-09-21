"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type PatientNavState = {
  onCheck?: () => void;
  checking?: boolean;
};

type PatientNavContextValue = PatientNavState & {
  setNavState: (state: PatientNavState) => void;
};

const PatientNavContext = createContext<PatientNavContextValue | null>(null);

export function PatientNavProvider({ children }: { children: ReactNode }) {
  const [navState, setNavState] = useState<PatientNavState>({});

  return (
    <PatientNavContext.Provider value={{ ...navState, setNavState }}>
      {children}
    </PatientNavContext.Provider>
  );
}

export function usePatientNav() {
  const ctx = useContext(PatientNavContext);
  if (!ctx) throw new Error("usePatientNav must be used within PatientNavProvider");
  return ctx;
}
