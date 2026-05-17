"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type MockRole = "Importer" | "Exporter";

const roles: MockRole[] = ["Importer", "Exporter"];

export type CompanyProfile = {
  company: string;
  contact: string;
  email: string;
  phone: string;
  country: string;
};

const defaultProfiles: Record<MockRole, CompanyProfile> = {
  Importer: {
    company: "Northstar Components Inc.",
    contact: "Nathan Cole",
    email: "nathan.cole@northstar.example",
    phone: "+1 415 800 2190",
    country: "United States"
  },
  Exporter: {
    company: "Penang Micro Systems Sdn Bhd",
    contact: "Amanda Lee",
    email: "amanda.lee@penangmicro.example",
    phone: "+60 4 228 9011",
    country: "Malaysia"
  }
};

type RoleContextValue = {
  role: MockRole;
  roles: MockRole[];
  setRole: (role: MockRole) => void;
  profile: CompanyProfile;
  profiles: Record<MockRole, CompanyProfile>;
  updateProfile: (role: MockRole, profile: Partial<CompanyProfile>) => void;
};

const RoleContext = createContext<RoleContextValue | null>(null);

const STORAGE_ROLE = "suiship-role";
const STORAGE_PROFILES = "suiship-profiles";

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<MockRole>("Importer");
  const [profiles, setProfiles] = useState<Record<MockRole, CompanyProfile>>(defaultProfiles);

  useEffect(() => {
    const storedRole = window.localStorage.getItem(STORAGE_ROLE);
    if (storedRole && roles.includes(storedRole as MockRole)) {
      setRoleState(storedRole as MockRole);
    } else if (storedRole && !roles.includes(storedRole as MockRole)) {
      // Migrate any legacy "Freight Forwarder" preference to Importer.
      window.localStorage.setItem(STORAGE_ROLE, "Importer");
    }
    const storedProfiles = window.localStorage.getItem(STORAGE_PROFILES);
    if (storedProfiles) {
      try {
        const parsed = JSON.parse(storedProfiles) as Partial<Record<MockRole, CompanyProfile>>;
        setProfiles((current) => ({
          Importer: { ...current.Importer, ...(parsed.Importer || {}) },
          Exporter: { ...current.Exporter, ...(parsed.Exporter || {}) }
        }));
      } catch {
        // ignore corrupted profile data
      }
    }
  }, []);

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      roles,
      setRole: (nextRole) => {
        setRoleState(nextRole);
        window.localStorage.setItem(STORAGE_ROLE, nextRole);
      },
      profile: profiles[role],
      profiles,
      updateProfile: (targetRole, patch) => {
        setProfiles((current) => {
          const next = { ...current, [targetRole]: { ...current[targetRole], ...patch } };
          window.localStorage.setItem(STORAGE_PROFILES, JSON.stringify(next));
          return next;
        });
      }
    }),
    [role, profiles]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used inside RoleProvider");
  }
  return context;
}
