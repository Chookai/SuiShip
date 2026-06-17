import JSZip from "jszip";
import { NextResponse } from "next/server";
import type { CompanyProfile, MockRole } from "@/components/role-context";
import { isMemWalConfigured } from "@/lib/memwal/client";
import { recallLatestCompanyProfile, writeCompanyProfileToMemWal } from "@/lib/profile-memwal";
import { buildDemoSession, type DemoSession, type DemoVariant } from "@/lib/demo-docs/session";

export const runtime = "nodejs";

function parseVariant(value: unknown): DemoVariant {
  return value === "fraud" ? "fraud" : "happy";
}

/**
 * Idempotently ensure the catalog exporter+importer company profiles exist in
 * MemWal so the deterministic payment-diversion check has a baseline to compare
 * against. This is a quick profile write (NOT the heavy Sui-account refresh) and
 * is safe to call on every request — it only writes when the profile is missing.
 */
async function ensureCompanyProfiles(session: DemoSession): Promise<boolean> {
  if (!isMemWalConfigured()) return false;
  await Promise.all([
    ensureProfile(session.exporterProfile, "Exporter"),
    ensureProfile(session.importerProfile, "Importer"),
  ]);
  return true;
}

async function ensureProfile(profile: CompanyProfile, role: MockRole): Promise<void> {
  const existing = await recallLatestCompanyProfile({
    company: profile.company,
    taxId: profile.taxId ?? "",
  });
  if (existing) return;
  await writeCompanyProfileToMemWal(profile, role, 1);
}

export async function POST(request: Request) {
  let variant: DemoVariant = "happy";
  try {
    const body = (await request.json().catch(() => ({}))) as { variant?: unknown };
    variant = parseVariant(body.variant);
  } catch {
    variant = "happy";
  }

  const session = buildDemoSession(variant);

  let memwalSeeded = false;
  try {
    memwalSeeded = await ensureCompanyProfiles(session);
  } catch (err) {
    // Seeding failures should never block the download — the happy path still
    // works without MemWal; fraud detection just won't have a baseline.
    console.error("[documents/generate] MemWal profile seed failed:", err);
  }

  const zip = new JSZip();
  for (const doc of session.docs) {
    zip.file(doc.fileName, doc.buffer);
  }
  zip.file(
    "README.txt",
    [
      `SuiShip test documents — ${variant === "fraud" ? "FRAUD" : "CLEAN"} scenario (set ${session.sid})`,
      "",
      session.expectedOutcome,
      "",
      "HOW TO USE:",
      "1. Go to the Create Shipment page.",
      "2. Upload all four PDFs in this archive at the document-upload step.",
      "3. Let the agent extract and cross-validate, then review the result.",
      "",
      memwalSeeded
        ? "MemWal company profile is seeded and ready."
        : "Note: MemWal is not configured on this deployment, so cross-shipment memory checks are skipped.",
    ].join("\n")
  );

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="suiship-${variant}-${session.sid}.zip"`,
      "X-Demo-Variant": variant,
      "X-Demo-Sid": session.sid,
      "X-Memwal-Seeded": memwalSeeded ? "1" : "0",
      "Cache-Control": "no-store",
    },
  });
}
