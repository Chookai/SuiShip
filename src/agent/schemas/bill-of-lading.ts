import { z } from "zod";
import { AddressSchema, CoercedNumber, SignatorySchema, WeightValueSchema } from "./base";

export const CargoItemSchema = z.object({
  marks_and_numbers: z.string().nullable(),
  number_of_packages: CoercedNumber,
  package_type: z.string().nullable(),     // "Cartons", "Bags", "Pallets"
  description: z.string().nullable(),
  hs_code: z.string().nullable(),
  gross_weight: WeightValueSchema,
  measurement_cbm: CoercedNumber,
  freight: z.string().nullable(),          // "Prepaid", "Collect"
});
export type CargoItem = z.infer<typeof CargoItemSchema>;

export const BillOfLadingDataSchema = z.object({
  // References
  bl_number: z.string().nullable(),
  bl_type: z.string().nullable(),          // "House", "Master", "Through"
  booking_number: z.string().nullable(),
  invoice_reference: z.string().nullable(),
  // Parties
  shipper: AddressSchema.nullable(),
  consignee: AddressSchema.nullable(),
  notify_party: AddressSchema.nullable(),             // may be "Same as Consignee" string in raw
  // Carrier & vessel
  carrier: z.string().nullable(),
  vessel_voyage: z.string().nullable(),
  port_of_loading: z.string().nullable(),
  port_of_discharge: z.string().nullable(),
  place_of_receipt: z.string().nullable(),
  place_of_delivery: z.string().nullable(),
  shipment_date: z.string().nullable(),    // "shipped on board" date
  // Service & payment
  service_type: z.string().nullable(),     // "Priority", "Expedited", "Ground"
  freight_payment: z.string().nullable(),  // "Prepaid", "Collect", "Third Party"
  place_of_issue: z.string().nullable(),
  number_of_originals: CoercedNumber,
  // Cargo
  cargo: z.array(CargoItemSchema),
  // Misc
  special_instructions: z.string().nullable(),
  shipper_signature: SignatorySchema.nullable(),
  carrier_signature: SignatorySchema.nullable(),
});
export type BillOfLadingData = z.infer<typeof BillOfLadingDataSchema>;
