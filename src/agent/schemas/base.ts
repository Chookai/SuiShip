import { z } from "zod";

/**
 * Coerces any numeric-looking value from Haiku to a number.
 * Handles: plain number, numeric string "3", comma-formatted "1,500".
 * Non-parseable strings (e.g. "THREE") fall back to null rather than crashing validation.
 */
export const CoercedNumber = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === "number") return isNaN(val) ? null : val;
    if (typeof val === "string") {
      const n = parseFloat(val.replace(/,/g, "").trim());
      return isNaN(n) ? null : n;
    }
    return null;
  },
  z.number().nullable()
);

/** A measured quantity with its unit, e.g. {value: 3690, unit: "kg"} */
export const WeightValueSchema = z.object({
  value: CoercedNumber,
  unit: z.string().nullable(), // "kg", "lbs", "g", etc.
});
export type WeightValue = z.infer<typeof WeightValueSchema>;

/** A monetary amount with explicit currency separated from the number */
export const MoneyValueSchema = z.object({
  amount: CoercedNumber,
  currency: z.string().nullable(), // "USD", "EUR", etc. ISO 4217
});
export type MoneyValue = z.infer<typeof MoneyValueSchema>;

/** Fully-structured address. Parse multi-line address text into these fields. */
export const AddressSchema = z.object({
  name: z.string().nullable(),
  contact_name: z.string().nullable(),
  street: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postal_code: z.string().nullable(),
  country: z.string().nullable(),       // full name, e.g. "Malaysia"
  country_code: z.string().nullable(),  // ISO 3166-1 alpha-2, e.g. "MY"
  email: z.string().nullable(),
  phone: z.string().nullable(),
  fax: z.string().nullable(),
  tax_id: z.string().nullable(),        // VAT/EIN/Tax ID
  eori: z.string().nullable(),          // EU EORI number
});
export type Address = z.infer<typeof AddressSchema>;

/** Person who signed the document */
export const SignatorySchema = z.object({
  name: z.string().nullable(),
  position: z.string().nullable(),
  organization: z.string().nullable(),
  signature_present: z.boolean(),       // true if a signature is visually present
  stamp_present: z.boolean(),           // true if a company stamp is visually present
});
export type Signatory = z.infer<typeof SignatorySchema>;

/** Document type enum — single source of truth */
export const DocumentTypeSchema = z.enum([
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "certificate_of_origin",
  "other",
  "unknown",
]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;
