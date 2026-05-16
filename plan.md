# SuiShip Prototype Plan

## 1. Product Vision

**SuiShip** is an AI-ready, on-chain shipment document passport platform.

The prototype will show how exporters, importers, freight forwarders, and customs officers can turn fragmented shipping documents into one verified shipment passport anchored on **Sui blockchain**.

The positioning:

> SuiShip turns shipping paperwork into an AI-verified, blockchain-backed digital passport for every shipment.

For the prototype, the AI layer will be simulated conceptually. The on-chain layer should be real enough to demonstrate shipment object creation, document hash anchoring, status updates, and retrieval.

---

## 2. Prototype Goal

Build a premium full-stack prototype that proves the core product experience:

1. User creates a shipment.
2. User uploads or enters document metadata.
3. App simulates AI document extraction and verification.
4. App stores document references and hashes.
5. App creates an on-chain shipment passport on Sui.
6. App generates a QR-style shipment link.
7. Customs-style viewer scans/searches the shipment object.
8. App retrieves and displays the verified shipment passport.

---

## 3. What Will Be Truly On-Chain

The prototype should create a Sui Move smart contract with a **ShipmentPassport** object.

The object should store:

- Shipment ID
- Shipper name
- Consignee name
- Origin country
- Destination country
- Carrier
- Transport mode
- Status
- AI verification score
- Risk level
- Document count
- Document hashes
- Storage URIs or placeholder Walrus URIs
- Created timestamp
- Last updated timestamp
- Owner / creator address

The contract should support:

- `create_shipment_passport`
- `update_status`
- `add_document_hash`
- `mark_customs_ready`
- `mark_customs_cleared`

Important: actual PDFs will not be stored on-chain. Only hashes and storage references are stored on-chain.

---

## 4. What Will Be Mocked in the Prototype

The following parts will be simulated first:

### AI extraction

Instead of connecting a real LLM API, the app will generate realistic extracted fields from sample documents.

Example simulated extraction:

- Invoice number
- HS code
- Quantity
- Declared value
- Country of origin
- Incoterm
- Weight
- Consignee
- Shipper

### AI verification

The app will simulate checks such as:

- Invoice quantity matches packing list
- HS code exists
- Country of origin is consistent
- Required documents are complete
- No mismatch found

### Walrus storage

The first version can store placeholder URIs like:

`walrus://demo-commercial-invoice-abc123`

Later, this can be replaced with real Walrus upload integration.

### memWal

The prototype will include a visible “Memory Layer” concept panel showing:

- good extraction examples
- corrected document templates
- route-specific customs rules
- supplier-specific document patterns
- fraud patterns

The first version does not need real memWal integration.

---

## 5. Recommended Tech Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- Framer Motion
- shadcn/ui style components
- lucide-react icons
- Sui wallet integration

### Blockchain

- Sui Move smart contract
- Sui TypeScript SDK
- Sui testnet or devnet

### Storage

- Prototype: local mock document records and placeholder Walrus URIs
- Later: Walrus storage integration

### QR / scanning

- Prototype: generate QR code from Sui object ID or shipment ID
- Later: scan QR with camera and resolve shipment object

---

## 6. UI Direction

The UI should feel premium, clean, high-standard, and infrastructure-grade, inspired by the polish of Base’s website but branded as SuiShip.

Design direction:

- Deep navy / near-black premium background
- Watery Sui blue accent
- Clean white typography
- Large hero section
- Subtle grid / globe / route-line visuals
- Rounded glass panels
- Minimal but high-end dashboard cards
- Smooth motion transitions
- Strong empty space
- Enterprise SaaS quality

Brand feeling:

- trusted
- clean
- global
- secure
- logistics infrastructure
- on-chain but not crypto-gimmicky

The logo should use the SuiShip logo previously created by the user. If the logo file is already in the repo, reference it from `/public` or the existing asset path. If not available, create a temporary wordmark + simple ship/water icon placeholder until the user provides the file.

---

## 7. Main App Pages

### 1. Landing Page

Purpose: explain SuiShip clearly and impress judges/users.

Sections:

- Hero: “The shipment passport for global trade”
- One-line pitch
- CTA buttons: “Create Passport” and “View Demo Shipment”
- Workflow visual
- Product modules
- Why on-chain
- AI-ready document intelligence
- Sui + Walrus + memWal architecture

### 2. Dashboard

Purpose: show all shipment passports.

Features:

- Shipment cards
- Status filters
- Risk level labels
- Search by shipment ID
- Create shipment button

### 3. Create Shipment

Purpose: create a new shipment passport.

Form fields:

- Shipment ID
- Shipper
- Consignee
- Origin
- Destination
- Carrier
- Transport mode
- Incoterm
- Declared value
- Document references

Flow:

1. Enter shipment details
2. Add documents
3. Click “Run AI Verification”
4. See simulated extraction results
5. Click “Mint Shipment Passport”
6. Wallet signs Sui transaction
7. App returns Sui object ID

### 4. Shipment Passport Detail

Purpose: show one verified shipment passport.

Sections:

- Shipment overview
- On-chain object ID
- Customs readiness
- AI verification score
- Risk assessment
- Document list
- Hash verification
- Timeline
- QR code
- Actions: update status, mark customs cleared

### 5. Customs Viewer

Purpose: allow customs/logistics user to retrieve shipment quickly.

Features:

- Search by shipment ID or Sui object ID
- QR code demo scanner input
- View verified docs
- Show authenticity proof
- Show risk summary
- Mark as cleared

### 6. Memory Layer Demo

Purpose: show how memWal will improve AI over time.

Sections:

- Good extraction examples
- Human correction history
- Route-specific rules
- Supplier document templates
- Fraud pattern memory

---

## 8. Smart Contract Shape

Suggested Move module:

`suiship::shipment_passport`

Core struct:

```move
public struct ShipmentPassport has key, store {
    id: UID,
    shipment_id: String,
    shipper: String,
    consignee: String,
    origin: String,
    destination: String,
    carrier: String,
    transport_mode: String,
    status: String,
    ai_score: u64,
    risk_level: String,
    document_hashes: vector<String>,
    storage_uris: vector<String>,
    created_at_ms: u64,
    updated_at_ms: u64,
}
```

Functions:

```move
public entry fun create_shipment_passport(...)
public entry fun add_document(...)
public entry fun update_status(...)
public entry fun mark_customs_ready(...)
public entry fun mark_customs_cleared(...)
```

---

## 9. Demo Data

Use realistic sample shipments:

### Shipment 1

- ID: SS-MY-US-0001
- Route: Malaysia → United States
- Cargo: Semiconductor components
- Carrier: DHL Global Forwarding
- Status: Customs Ready
- AI Score: 96
- Risk: Low

### Shipment 2

- ID: SS-SG-DE-0002
- Route: Singapore → Germany
- Cargo: Medical devices
- Carrier: Maersk
- Status: Needs Review
- AI Score: 81
- Risk: Medium

### Shipment 3

- ID: SS-CN-AE-0003
- Route: China → UAE
- Cargo: Consumer electronics
- Carrier: FedEx
- Status: Documents Uploaded
- AI Score: 89
- Risk: Low

---

## 10. Folder Structure

Recommended project structure:

```text
suiship/
  apps/
    web/
      app/
      components/
      lib/
      public/
      package.json
  contracts/
    suiship/
      Move.toml
      sources/
        shipment_passport.move
  README.md
  PLAN.md
```

For a simpler hackathon build, use:

```text
suiship/
  app/
  components/
  lib/
  public/
  move/
  package.json
  README.md
  PLAN.md
```

---

## 11. Milestones

### Milestone 1: UI prototype

- Landing page
- Dashboard
- Create shipment form
- Passport detail page
- Customs viewer
- Memory layer page

### Milestone 2: Sui contract

- Move package
- ShipmentPassport object
- Create shipment function
- Add document function
- Update status function

### Milestone 3: Frontend on-chain integration

- Connect wallet
- Mint shipment passport
- Read shipment object
- Update status

### Milestone 4: Demo polish

- QR code generation
- Sample demo data
- Premium animations
- Judge-friendly explanation panels
- README setup guide

---

## 12. Success Criteria

The prototype is successful if a user can:

1. Open SuiShip landing page.
2. Connect Sui wallet.
3. Create a shipment passport.
4. Simulate AI extraction and verification.
5. Mint the shipment passport on Sui.
6. See on-chain object details.
7. Generate or view a QR shipment link.
8. Retrieve the shipment in a customs viewer.
9. Update customs status on-chain.

---

## 13. Non-Goals for First Prototype

Do not build these in the first version:

- Real LLM API integration
- Real OCR pipeline
- Real customs API integration
- Real ERP/WMS/TMS integration
- Real Walrus upload flow
- Production identity/KYC
- Production access control
- Legal customs certification

These can be described as future roadmap items.

---

## 14. Risks and Fixes

### Risk: judges think it is just NFT documents

Fix: position it as a shipment passport and compliance infrastructure, not NFT paperwork.

### Risk: blockchain feels unnecessary

Fix: show why immutable hashes, document provenance, status history, and shared verification matter across parties that do not fully trust each other.

### Risk: AI is mocked

Fix: clearly label it as AI-ready and show realistic extraction/verification flow. The core hackathon proof is on-chain shipment passporting.

### Risk: customs adoption is hard

Fix: focus first on exporters, importers, forwarders, and customs brokers. Customs viewer is a demo of the future workflow.

---

## 15. Final Prototype Narrative

SuiShip creates a trusted digital passport for global shipments.

A shipper uploads documents, AI extracts and verifies key fields, the documents are stored off-chain, and the proof is anchored on Sui. Anyone with permission can scan a shipment label, verify authenticity, retrieve the document set, and see customs readiness instantly.

This makes global trade documentation faster, safer, and more trustworthy.

