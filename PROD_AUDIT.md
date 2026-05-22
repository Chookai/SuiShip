# SuiShip — Deployment & Run Guide

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 | `nvm install 20` |
| Sui CLI | latest | See https://docs.sui.io/build/install |
| Sui client configured | testnet | `sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443` |

---

## Part 1: Deploy the SUI Move Contract

### Step 1 — Get testnet SUI gas

```bash
sui client faucet
sui client balance
```

### Step 2 — Deploy the package

```bash
cd /home/donaldlimdy/projects/SuiShip/suiShip/move
sui move build
sui client publish --gas-budget 100000000
```

Copy from the publish output:
- `PACKAGE_ID` — the newly published package object ID
- `REGISTRY_ID` — the `ShipmentRegistry` shared object ID

### Step 3 — Export your deployer keypair

```bash
sui client active-address
sui keytool export --key-identity <YOUR_ADDRESS>
# Outputs: suiprivkey1...
```

---

## Part 2: Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# SUI Contract
SUI_CLIENT=real
SUI_NETWORK=testnet
NEXT_PUBLIC_SUISHIP_PACKAGE_ID=0x<PACKAGE_ID>
NEXT_PUBLIC_REGISTRY_ID=0x<REGISTRY_ID>
SUI_PRIVATE_KEY=suiprivkey1<your_key>

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-...

# MemWal (optional — leave blank to use mock)
MEMWAL_ED25519_KEY=
MEMWAL_ACCOUNT_ID=
MEMWAL_SERVER_URL=https://relayer.staging.memwal.ai

# App
SQLITE_DB_PATH=./data/suiship.db
MOCK_DOC_AI=false
MOCK_DOC_PASS=false
```

**For quick demo without real AI:** set `MOCK_DOC_AI=true` `MOCK_DOC_PASS=true`
**For mock SUI:** set `SUI_CLIENT=mock`

---

## Part 3: Run the App

```bash
mkdir -p data
npm install
npm run dev
```

Open: `http://localhost:3000`

---

## Part 4: Demo Flow — Scenario A (Happy Path)

PDFs: `test/Scenario_A_happy_path/`

1. **Create shipment** → `/create` → pick **Sea Freight FOB** → fill addresses → Create
   - SUI: `create_shipment` tx → `ShipmentRecord` + `DocAccumulator` on testnet

2. **Upload exporter docs** (Exporter View):
   - `commercial_invoice_DHL.pdf` → slot `commercial_invoice`
   - `packing_list_DHL.pdf` → slot `packing_list`
   - `certificate_of_origin_DHL.pdf` → slot `certificate_of_origin`
   - Each upload: Haiku extracts → `commit_document` SUI tx fires per doc

3. **Copy counterparty link** → paste in new tab (or toggle to Importer View)

4. **Upload importer doc** (Importer View):
   - `bill_of_lading_DHL.pdf` → slot `bill_of_lading`
   - Auto cross-validation fires after 4th doc

5. **Validate** → `POST /api/shipments/{id}/validate` → `aligned` → no errors

6. **Mint** → Walrus upload → MemWal write → SUI `finalize_shipment`
   - `ShipmentPassport` NFT minted → view on Explorer
   - `DocAccumulator` frozen → all 4 doc commitments permanently on-chain

---

## Part 5: Demo Flow — Scenario B (Conflict Detection)

PDFs: `test/Scenario_B_validation_mismatch/`

Same flow — but after validation:
- `overallVerdict: "mismatched"` — AI detected field conflicts
- Mint is **blocked** — demonstrates fraud prevention

---

## Part 6: Verifying On-Chain

**Sui Testnet Explorer:** `https://suiscan.xyz/testnet/object/<OBJECT_ID>`

Show judges:
1. `ShipmentPassport` — `verification_score`, `document_count`, `accumulator_id`
2. `DocAccumulator` at `accumulator_id` — `entries[]` with content + extraction hashes per doc
3. Original `create_shipment` tx — `ShipmentRecord` + `DocAccumulator` in one tx
4. 4× `commit_document` txs — one per doc, timestamped before mint

---

## Part 7: Environment Variable Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (real AI) | — | Claude Haiku/Sonnet API key |
| `SUI_CLIENT` | Yes | `mock` | `real` or `mock` |
| `SUI_NETWORK` | If real | `testnet` | `testnet` / `mainnet` / `devnet` |
| `NEXT_PUBLIC_SUISHIP_PACKAGE_ID` | If real | — | Published Move package object ID |
| `NEXT_PUBLIC_REGISTRY_ID` | If real | — | ShipmentRegistry shared object ID |
| `SUI_PRIVATE_KEY` | If real | — | Server signing key (suiprivkey... or 32-byte hex) |
| `MEMWAL_ED25519_KEY` | Optional | — | MemWal signing key |
| `MEMWAL_ACCOUNT_ID` | Optional | — | MemWal account ID |
| `WALRUS_EPOCHS` | Optional | `24` | Blob lifetime epochs |
| `SQLITE_DB_PATH` | Optional | `./data/suiship.db` | SQLite path |
| `MOCK_DOC_AI` | Optional | `false` | `true` to skip Haiku calls |
| `MOCK_DOC_PASS` | Optional | `false` | `true` for mock passing results |

---

## Part 8: Troubleshooting

**"insufficient gas"** → `sui client faucet`

**"NEXT_PUBLIC_SUISHIP_PACKAGE_ID env var is not set"** → Restart `npm run dev` after editing `.env.local`

**"Mint blocked: No validation run found"** → Run `POST /api/shipments/{id}/validate` first

**"Manifest cache is empty"** → Re-run `/validate` then `/mint`

**"commitDocument failed"** → Doc still usable. Retry: `POST /api/shipments/{id}/documents/{docId}/commit`

**Move build errors** → Update Sui CLI to latest

---

## Part 9: Architecture Summary

```
UPLOAD PIPELINE (per document):
  POST /api/shipments/{id}/documents
    ↓ SHA256 dedup (SQLite)
    ↓ Grounding context injected (prior docs from same shipment)
    ↓ Haiku 4.5: extract structured fields + confidence scores
    ↓ Rule-based verify (required fields, confidence ≥ 0.4)
    ↓ [async] MemWal doc event (audit trail before mint)
    ↓ [async] SUI commit_document (~2000 gas per doc)
    ↓ Auto cross-validate if ≥2 doc types present

VALIDATION:
  POST /api/shipments/{id}/validate
    ↓ Compact manifest from SQLite
    ↓ Haiku 4.5 (escalates to Sonnet 4.6 if conflicts exist)
    ↓ Findings written to validation_findings
    ↓ doc_set_hash computed (staleness guard for mint)

MINT:
  POST /api/shipments/{id}/mint
    ↓ 4-check gate: manifest complete, docs valid, hash matches, no errors
    ↓ Walrus: upload all PDFs + manifest JSON
    ↓ MemWal: final manifest written
    ↓ SUI: finalize_shipment → ShipmentPassport NFT
    ↓ DocAccumulator frozen (audit trail permanent)
    ↓ All docs marked committed in SQLite

ON-CHAIN AFTER MINT:
  ShipmentPassport ──→ DocAccumulator (frozen, all 4 doc commitments)
                   ──→ Walrus blobs (manifest + PDFs)
                   ──→ MemWal space (full audit trail)
```
