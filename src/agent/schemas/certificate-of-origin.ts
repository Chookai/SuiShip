import { z } from "zod";
import { AddressSchema, CoercedNumber, SignatorySchema } from "./base";

export const COOGoodsItemSchema = z.object({
  item_number: CoercedNumber,
  hs_code: z.string().nullable(),
  description: z.string().nullable(),
  quantity: CoercedNumber,
  quantity_unit: z.string().nullable(),
  invoice_reference: z.string().nullable(),
});
export type COOGoodsItem = z.infer<typeof COOGoodsItemSchema>;

export const COOTransportSchema = z.object({
  mode: z.string().nullable(),             // "Ocean Freight", "Air", "Road"
  vessel_flight: z.string().nullable(),
  port_of_loading: z.string().nullable(),
  port_of_discharge: z.string().nullable(),
});
export type COOTransport = z.infer<typeof COOTransportSchema>;

export const CertificateOfOriginDataSchema = z.object({
  // Document references
  certificate_number: z.string().nullable(),
  issue_date: z.string().nullable(),
  issuing_authority: z.string().nullable(),  // "Perak Intl Chamber of Commerce"
  certificate_type: z.string().nullable(),   // "Non-Preferential", "Preferential"
  // Parties
  exporter: AddressSchema.nullable(),
  importer: AddressSchema.nullable(),
  // Origin
  country_of_origin: z.string().nullable(),
  country_of_origin_code: z.string().nullable(),  // ISO alpha-2
  // Transport
  transport: COOTransportSchema.nullable(),
  // Goods
  goods: z.array(COOGoodsItemSchema),
  // Sign-off
  declaration_text: z.string().nullable(),
  exporter_signatory: SignatorySchema.nullable(),
  chamber_signatory: SignatorySchema.nullable(),
});
export type CertificateOfOriginData = z.infer<typeof CertificateOfOriginDataSchema>;
