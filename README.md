# SuiShip

SuiShip is a premium hackathon prototype for AI-ready, on-chain shipment document passports on Sui.

The app demonstrates the end-to-end flow:

1. Create a shipment.
2. Add document references.
3. Run mocked AI extraction and verification.
4. Mint a Sui `ShipmentPassport` object.
5. View object IDs, hashes, Walrus-style URIs, QR links, and customs status.
6. Search a customs viewer.
7. Explore the conceptual memWal memory layer.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Useful commands

```bash
npm run typecheck
npm run lint
npm run build
```

## Publish the Move package

Install the Sui CLI, configure a testnet wallet, then publish:

```bash
cd move
sui client publish --gas-budget 100000000
```

Copy the published package ID and run the web app with:

```bash
NEXT_PUBLIC_SUISHIP_PACKAGE_ID=0xYOUR_PACKAGE_ID npm run dev
```

## What is real

- Next.js, TypeScript, Tailwind UI.
- Sui wallet connection through `@mysten/dapp-kit`.
- Sui TypeScript SDK transaction builders for creating a passport and updating customs status.
- Sui Move package at `move/sources/shipment_passport.move`.
- On-chain object fields for shipment ID, parties, route, carrier, status, AI score, risk, document hashes, storage URIs, timestamps, and owner.
- QR rendering for shipment passport links.

## What is mocked

- AI extraction and verification are simulated with deterministic demo fields.
- Walrus storage is represented as `walrus://demo-*` placeholder URIs.
- memWal is a visible concept demo showing future memory categories.
- Demo shipments use shortened object IDs until you publish the package and mint real objects.

## Pages

- `/` landing page.
- `/dashboard` shipment passport dashboard.
- `/create` create and mint flow.
- `/shipments/SS-MY-US-0001` shipment passport detail.
- `/customs` customs viewer.
- `/memory` memory layer demo.
