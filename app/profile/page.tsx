"use client";

import { useEffect, useMemo, useState } from "react";
import { useRole, type CompanyProfile, type MockRole } from "@/components/role-context";
import { Button, Panel } from "@/components/ui";

const profileFields: Array<{
  key: keyof CompanyProfile;
  label: string;
  fullWidth?: boolean;
}> = [
  { key: "company", label: "Company" },
  { key: "contact", label: "Contact person" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "country", label: "Country" },
  { key: "taxId", label: "Tax ID" },
  { key: "registeredAddress", label: "Registered address", fullWidth: true },
  { key: "bankBeneficiaryName", label: "Bank beneficiary name" },
  { key: "bankAccountNumber", label: "Bank account / reference" },
];

const STORAGE_PROFILE_VERSIONS = "suiship-profile-versions-v1";

function readProfileVersions(): Record<MockRole, number> {
  const empty = { Importer: 0, Exporter: 0, "Freight Forwarder": 0 };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_PROFILE_VERSIONS);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Record<MockRole, number>>;
    return {
      Importer: parsed.Importer ?? 0,
      Exporter: parsed.Exporter ?? 0,
      "Freight Forwarder": parsed["Freight Forwarder"] ?? 0,
    };
  } catch {
    return empty;
  }
}

function writeProfileVersion(role: MockRole, version: number) {
  const current = readProfileVersions();
  current[role] = version;
  window.localStorage.setItem(STORAGE_PROFILE_VERSIONS, JSON.stringify(current));
}

export default function ProfilePage() {
  const { role, profile, updateProfile } = useRole();
  const [draft, setDraft] = useState<CompanyProfile>(profile);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);

  useEffect(() => {
    setDraft(profile);
    setSaved(false);
    setSyncError(null);
    const versions = readProfileVersions();
    setProfileVersion(versions[role] ?? 0);
  }, [profile, role]);

  const hasChanges = useMemo(
    () => profileFields.some(({ key }) => (draft[key] ?? "") !== (profile[key] ?? "")),
    [draft, profile]
  );

  async function saveProfile() {
    updateProfile(role, draft);
    const nextVersion = (readProfileVersions()[role] ?? 0) + 1;
    writeProfileVersion(role, nextVersion);
    setProfileVersion(nextVersion);
    setSyncing(true);
    setSyncError(null);

    try {
      const res = await fetch("/api/profile/memwal-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          profileVersion: nextVersion,
          profile: { ...draft },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; skipped?: boolean };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "MemWal sync failed");
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "MemWal sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold text-pearl">Profile</h1>
        <p className="mt-2 text-sm text-steel">
          {role} account · MemWal profile version {profileVersion || "not synced yet"}
        </p>
      </div>

      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="blue-gradient h-14 w-14 rounded-2xl" />
            <div>
              <h2 className="text-2xl font-extrabold text-pearl">{draft.company || "Company profile"}</h2>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {saved && <span className="text-xs font-bold text-emerald-600">Saved & synced to MemWal</span>}
            {syncError && <span className="max-w-xs text-right text-xs font-bold text-red-600">{syncError}</span>}
            <Button onClick={saveProfile} disabled={(!hasChanges && profileVersion > 0) || syncing}>
              {syncing ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {profileFields.map(({ key, label, fullWidth }) => (
            <label
              key={key}
              className={`grid gap-2 text-sm font-medium text-steel ${fullWidth ? "md:col-span-2" : ""}`}
            >
              <span>{label}</span>
              <input
                value={draft[key] ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                className="min-h-12 rounded-2xl border border-blue-100 bg-white px-4 text-pearl shadow-sm outline-none transition placeholder:text-steel/55 focus:border-sui/70 focus:bg-blue-50/50"
              />
            </label>
          ))}
        </div>
      </Panel>
    </div>
  );
}
