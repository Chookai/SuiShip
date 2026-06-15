import { NextResponse } from "next/server";
import { z } from "zod";
import type { MockRole } from "@/components/role-context";
import { isMemWalConfigured, isMemWalEnabled } from "@/lib/memwal/client";
import { writeCompanyProfileToMemWal } from "@/lib/profile-memwal";

const bodySchema = z.object({
  role: z.enum(["Importer", "Exporter", "Freight Forwarder"]),
  profileVersion: z.number().int().min(1),
  profile: z.object({
    company: z.string().min(1),
    contact: z.string(),
    email: z.string(),
    phone: z.string(),
    country: z.string(),
    taxId: z.string().optional(),
    registeredAddress: z.string().optional(),
    bankBeneficiaryName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
  }),
});

export async function POST(request: Request) {
  if (!isMemWalEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "MemWal is disabled (ENABLE_MEMWAL=false). Profile saved locally only.",
    });
  }
  if (!isMemWalConfigured()) {
    return NextResponse.json(
      { ok: false, error: "MemWal is enabled but not configured (MEMWAL_ED25519_KEY / MEMWAL_ACCOUNT_ID)." },
      { status: 503 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await writeCompanyProfileToMemWal(
      body.profile,
      body.role as MockRole,
      body.profileVersion
    );
    return NextResponse.json({
      ok: true,
      role: body.role,
      profileVersion: result.profileVersion,
      namespace: result.namespace,
      blobId: result.blobId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "MemWal sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
