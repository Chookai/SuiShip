export type MemWalAccessScope =
  | "full"
  | "commercial_fields"
  | "origin_fields"
  | "transport_fields"
  | "document_hashes_only";

export interface MemWalManifest {
  schema_version: "1.0";
  shipment_id: string;
  passport_id: string;
  manifest_hash: string;
  created_at: string;

  parties: {
    shipper: { name: string; address?: string; tax_id?: string };
    consignee: { name: string; address?: string; tax_id?: string };
    notify_party?: { name: string };
    broker?: string;
    freight_forwarder?: string;
  };

  shipment: {
    origin: string;
    origin_port: string;
    destination: string;
    destination_port: string;
    carrier: string;
    transport_mode: string;
    incoterm: string;
    etd: string;
    eta: string;
    booking_ref?: string;
    bl_number?: string;
    bl_type?: string;
    payment_terms?: string;
  };

  cargo: {
    description: string;
    hs_code: string;
    quantity: string;
    gross_weight: string;
    net_weight: string;
    country_of_origin: string;
    declared_value: string;
    currency: string;
    dangerous_goods: boolean;
    temperature_controlled: boolean;
  };

  documents: Array<{
    doc_type:
      | "commercial_invoice"
      | "packing_list"
      | "bill_of_lading"
      | "certificate_of_origin";
    file_name: string;
    sha256: string;
    walrus_blob_id: string;
    confidence: number;
    extracted_ref?: string;
  }>;

  ai_verification: {
    score: number;
    risk_level: "Low" | "Medium" | "High";
    ran_at: string;
  };
}

export interface MemWalReasoningTrace {
  schema_version: "1.0";
  shipment_id: string;
  passport_id: string;
  run_id: string;
  overall_verdict: "aligned" | "mismatched" | "insufficient_data";
  verdict_reason: string;
  ran_at: string;
  documents_compared: string[];

  issues: Array<{
    severity: "error" | "warning" | "info";
    field: string;
    message: string;
    documents_affected: string[];
    values: Record<string, unknown>;
  }>;

  token_efficiency: {
    strategy: "compact_manifest" | "full_resubmit";
    input_tokens: number;
    output_tokens: number;
    compact_manifest_tokens: number;
    new_extraction_tokens: number;
    retrieved_chunk_tokens: number;
  };
}

export interface MemWalDocumentChunk {
  schema_version: "1.0";
  shipment_id: string;
  doc_type: string;
  walrus_blob_id: string;
  chunk_index: number;
  chunk_text: string;
  field_tags: string[];
  embedding?: number[];
}

export interface MemWalAccessPolicy {
  schema_version: "1.0";
  passport_id: string;
  owner_address: string;
  policy_type: "owner" | "grant";
  grantee_address?: string;
  scope: MemWalAccessScope;
  expires_at?: string;
  grant_id?: string;
}

export interface MemWalSpaceDescriptor {
  space_id: string;
  shipment_id: string;
  passport_id: string;
  manifest_record_id: string;
  reasoning_record_id: string;
  chunk_record_ids: string[];
  access_policy_record_id: string;
  created_at: string;
}
