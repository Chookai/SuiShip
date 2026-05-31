"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  SCENARIO_C_EXPORTER,
  SCENARIO_C_FREIGHT_FORWARDER,
  SCENARIO_C_IMPORTER,
} from "@/lib/scenario-c-demo-defaults";

export type MockRole = "Importer" | "Exporter" | "Freight Forwarder";

const roles: MockRole[] = ["Importer", "Exporter", "Freight Forwarder"];

export type CompanyProfile = {
  company: string;
  contact: string;
  email: string;
  phone: string;
  country: string;
  taxId?: string;
  registeredAddress?: string;
  bankBeneficiaryName?: string;
  bankAccountNumber?: string;
};

const defaultProfiles: Record<MockRole, CompanyProfile> = {
  Importer: { ...SCENARIO_C_IMPORTER },
  Exporter: { ...SCENARIO_C_EXPORTER },
  "Freight Forwarder": { ...SCENARIO_C_FREIGHT_FORWARDER },
};

const LEGACY_COMPANY_MARKERS = ["penang micro", "northstar"];

function normalizeCompanyKey(company: string | undefined): string {
  return company?.trim().toLowerCase() ?? "";
}

function isLegacyDemoCompany(company: string | undefined): boolean {
  const normalized = normalizeCompanyKey(company);
  return LEGACY_COMPANY_MARKERS.some((marker) => normalized.includes(marker));
}

function migrateProfiles(
  stored: Partial<Record<MockRole, CompanyProfile>> | null
): Record<MockRole, CompanyProfile> {
  const importerStored = stored?.Importer;
  const exporterStored = stored?.Exporter;
  const ffStored = stored?.["Freight Forwarder"];

  const importerLegacy = isLegacyDemoCompany(importerStored?.company);
  const exporterLegacy = isLegacyDemoCompany(exporterStored?.company);
  const sameCompany =
    Boolean(importerStored?.company && exporterStored?.company) &&
    normalizeCompanyKey(importerStored?.company) === normalizeCompanyKey(exporterStored?.company);

  if (sameCompany || (importerLegacy && exporterLegacy)) {
    return { ...defaultProfiles };
  }

  return {
    Importer:
      importerStored && !importerLegacy
        ? { ...defaultProfiles.Importer, ...importerStored }
        : { ...defaultProfiles.Importer },
    Exporter:
      exporterStored && !exporterLegacy
        ? { ...defaultProfiles.Exporter, ...exporterStored }
        : { ...defaultProfiles.Exporter },
    "Freight Forwarder":
      ffStored && ffStored.company?.trim()
        ? { ...defaultProfiles["Freight Forwarder"], ...ffStored }
        : { ...defaultProfiles["Freight Forwarder"] },
  };
}

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
const STORAGE_PROFILES = "suiship-profiles-v3";
const STORAGE_PROFILES_LEGACY = "suiship-profiles-v2";

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<MockRole>("Exporter");
  const [profiles, setProfiles] = useState<Record<MockRole, CompanyProfile>>(defaultProfiles);

  useEffect(() => {
    const storedRole = window.localStorage.getItem(STORAGE_ROLE);
    if (storedRole && roles.includes(storedRole as MockRole)) {
      setRoleState(storedRole as MockRole);
    }
    const storedProfiles =
      window.localStorage.getItem(STORAGE_PROFILES) ??
      window.localStorage.getItem(STORAGE_PROFILES_LEGACY) ??
      window.localStorage.getItem("suiship-profiles");
    let parsed: Partial<Record<MockRole, CompanyProfile>> | null = null;
    if (storedProfiles) {
      try {
        parsed = JSON.parse(storedProfiles) as Partial<Record<MockRole, CompanyProfile>>;
      } catch {
        parsed = null;
      }
    }

    const migrated = migrateProfiles(parsed);
    setProfiles(migrated);
    window.localStorage.setItem(STORAGE_PROFILES, JSON.stringify(migrated));
    if (window.localStorage.getItem(STORAGE_PROFILES_LEGACY)) {
      window.localStorage.removeItem(STORAGE_PROFILES_LEGACY);
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
      },
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
