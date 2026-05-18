import { z } from "zod";
import { AddressSchema, CoercedNumber, MoneyValueSchema, SignatorySchema, WeightValueSchema } from "./base";

export const InvoiceLineItemSchema = z.object({
  line_number: CoercedNumber,
  quantity: CoercedNumber,
  quantity_unit: z.string().nullable(),    // "PCS", "BAG", "BOX", etc.
  country_of_origin: z.string().nullable(),
  description: z.string().nullable(),
  hs_code: z.string().nullable(),          // Harmonised System code, keep as string (leading zeros)
  unit_weight: WeightValueSchema,
  unit_value: CoercedNumber,               // per-unit price, no currency symbol
  subtotal: CoercedNumber,                 // line total, no currency symbol
});
export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;

export const InvoiceTotalsSchema = z.object({
  total_net_weight: WeightValueSchema,
  total_gross_weight: WeightValueSchema,
  total_pieces: CoercedNumber,
  declared_value: CoercedNumber,
  freight_insurance: CoercedNumber,
  other_charges: CoercedNumber,
  total_invoice_amount: CoercedNumber,
});
export type InvoiceTotals = z.infer<typeof InvoiceTotalsSchema>;

export const CommercialInvoiceDataSchema = z.object({
  // Document references
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),     // ISO 8601 YYYY-MM-DD if parseable
  currency: z.string().nullable(),
  payment_terms: z.string().nullable(),
  incoterms: z.string().nullable(),        // "FOB", "CIF", "EXW", etc.
  terms_of_trade: z.string().nullable(),   // longer "FCA - Free Carrier" form
  type_of_export: z.string().nullable(),   // "Permanent", "Temporary"
  reason_for_export: z.string().nullable(),
  city_of_liability: z.string().nullable(),
  // Parties — invoice often has 3 distinct roles
  sender: AddressSchema.nullable(),                    // = exporter/shipper
  sold_to: AddressSchema.nullable(),                   // = bill-to party
  recipient: AddressSchema.nullable(),                 // = ship-to party (may equal sold_to)
  // Carrier/waybill info
  carrier: z.string().nullable(),
  waybill_number: z.string().nullable(),
  sender_reference: z.string().nullable(),  // often the BL number
  recipient_reference: z.string().nullable(),
  // Goods
  line_items: z.array(InvoiceLineItemSchema),
  totals: InvoiceTotalsSchema,
  // Sign-off
  signatory: SignatorySchema.nullable(),
  general_notes: z.string().nullable(),
});
export type CommercialInvoiceData = z.infer<typeof CommercialInvoiceDataSchema>;

// Suppress unused import warnings
void MoneyValueSchema;
