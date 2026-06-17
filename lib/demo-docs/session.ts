/**
 * Builds a self-contained demo document set for judges to upload.
 *
 * Design (see docs / plan):
 * - Party IDENTITY is constant every run (= the Scenario-C catalog), so the
 *   create form's auto-enrichment (enrichPartyWithCompanyCatalog) stays
 *   consistent and the happy path never spuriously mismatches.
 * - Only the DOCUMENT NUMBERS are regenerated per session, so re-running never
 *   trips the duplicate-document fraud check — no MemWal reset needed, ever.
 * - The "fraud" variant diverges only the invoice beneficiary bank account from
 *   the catalog baseline, producing a clean, deterministic payment-diversion
 *   finding against the recalled company profile.
 */
import { randomBytes } from "node:crypto";
import type { CompanyProfile } from "@/components/role-context";
import {
  SCENARIO_C_CARGO,
  SCENARIO_C_EXPORTER,
  SCENARIO_C_IMPORTER,
  SCENARIO_C_SHIPMENT_DETAILS,
} from "@/lib/scenario-c-demo-defaults";
import { buildShipmentDocs, type GeneratedDoc, type ShipmentDocParams } from "./generate";

export type DemoVariant = "happy" | "fraud";

export type DemoSession = {
  sid: string;
  variant: DemoVariant;
  /** Catalog company profiles to (idempotently) seed into MemWal before validation. */
  exporterProfile: CompanyProfile;
  importerProfile: CompanyProfile;
  docs: GeneratedDoc[];
  baselineBankAccount: string;
  /** Present only for the fraud variant — the diverted account on the invoice. */
  divertedBankAccount?: string;
  expectedOutcome: string;
};

const BANK_NAME = "Pacific National Bank";

function newSid(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

export function buildDemoSession(variant: DemoVariant): DemoSession {
  const sid = newSid();
  const exporter = SCENARIO_C_EXPORTER;
  const importer = SCENARIO_C_IMPORTER;

  const baselineBankAccount = exporter.bankAccountNumber;
  const divertedBankAccount = variant === "fraud" ? `DIVERT-${sid}` : undefined;
  const bankAccount = divertedBankAccount ?? baselineBankAccount;

  const docParams: ShipmentDocParams = {
    exporter: {
      company: exporter.company,
      taxId: exporter.taxId,
      address: exporter.registeredAddress,
    },
    importer: {
      company: importer.company,
      taxId: importer.taxId,
      address: importer.registeredAddress,
    },
    invoice: `INV-${sid}`,
    bol: `BL-${sid}`,
    payment: "Telegraphic Transfer (T/T), Net 30",
    hs: SCENARIO_C_CARGO.hsCode,
    value: SCENARIO_C_SHIPMENT_DETAILS.declaredValue,
    description: SCENARIO_C_CARGO.description,
    bankName: BANK_NAME,
    bankBeneficiary: exporter.bankBeneficiaryName,
    bankAccount,
  };

  const expectedOutcome =
    variant === "fraud"
      ? [
          "EXPECTED RESULT: This shipment should be FLAGGED.",
          "",
          `The commercial invoice routes payment to a NEW beneficiary bank account (${bankAccount})`,
          `that differs from ${exporter.company}'s account on record in MemWal (${baselineBankAccount}).`,
          "SuiShip's memory agent recalls the company profile and raises a critical",
          "payment-diversion (Business Email Compromise) finding.",
        ].join("\n")
      : [
          "EXPECTED RESULT: This shipment should PASS.",
          "",
          "All four documents are internally consistent and every party detail matches",
          `${exporter.company}'s company profile remembered in MemWal. The passport can be minted.`,
        ].join("\n");

  return {
    sid,
    variant,
    exporterProfile: { ...exporter },
    importerProfile: { ...importer },
    docs: buildShipmentDocs(docParams),
    baselineBankAccount,
    divertedBankAccount,
    expectedOutcome,
  };
}
