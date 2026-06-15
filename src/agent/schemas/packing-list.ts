import { z } from "zod";
import { AddressSchema, CoercedNumber, WeightValueSchema } from "./base";

export const PackingLineItemSchema = z.object({
  line_range: z.string().nullable(),       // "1-40", "41-60", or single number
  packages: CoercedNumber,                 // count of cartons/bags for this line
  unit: z.string().nullable(),             // "Bag", "Carton", "Pallet"
  description: z.string().nullable(),
  sku: z.string().nullable(),              // optional SKU/product code
  marks_and_numbers: z.string().nullable(),
  gross_weight_lbs: CoercedNumber,
  gross_weight_kg: CoercedNumber,
  net_weight_lbs: CoercedNumber,
  net_weight_kg: CoercedNumber,
  quantity: CoercedNumber,
  cbm: CoercedNumber,                      // cubic meters, often blank/TBD
});
export type PackingLineItem = z.infer<typeof PackingLineItemSchema>;

export const PackingTotalsSchema = z.object({
  total_packages: CoercedNumber,
  total_gross_weight: WeightValueSchema,
  total_net_weight: WeightValueSchema,
  total_quantity: CoercedNumber,
  total_cbm: CoercedNumber,
});
export type PackingTotals = z.infer<typeof PackingTotalsSchema>;

export const PackingListDataSchema = z.object({
  // References
  packing_list_number: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  ship_date: z.string().nullable(),
  reference_number: z.string().nullable(),
  // Order info
  customer_po_number: z.string().nullable(),
  po_date: z.string().nullable(),
  letter_of_credit_number: z.string().nullable(),
  awb_bl_number: z.string().nullable(),
  // Trade terms
  mode_of_transportation: z.string().nullable(),  // "Sea", "Air", "Road"
  currency: z.string().nullable(),
  transportation_terms: z.string().nullable(),    // "FOB"
  payment_terms: z.string().nullable(),           // "Net 30"
  incoterms: z.string().nullable(),               // "EXW", "FOB", etc.
  // Parties
  shipper: AddressSchema.nullable(),
  consignee: AddressSchema.nullable(),
  // Goods
  line_items: z.array(PackingLineItemSchema),
  totals: PackingTotalsSchema,
});
export type PackingListData = z.infer<typeof PackingListDataSchema>;
