# SuiShip Move Contract Specification

**Package:** `suiship`  
**Module:** `shipment_passport` (extend existing module)

This document defines exactly what the teammate's Move contract must implement for
`RealSuiPassportClient` (in `lib/sui-passport/real-client.ts`) to work as a drop-in
replacement for `MockSuiPassportClient`. All TypeScript ↔ Move mappings are listed below.

---

## Existing Structs to Extend

### `ShipmentPassport` — add these fields

```move
memwal_space_id: String,          // MemWal space ID written at mint
walrus_blob_ids: vector<String>,  // Walrus blob IDs (manifest + docs + chunks)
manifest_hash: String,            // sha256 hex of canonical manifest JSON
grants: Table<address, GrantRecord>,  // using sui::table
```

### `GrantRecord` — new struct

```move
struct GrantRecord has store {
    grant_id: String,           // UUID or hash
    scope: String,              // "full"|"commercial_fields"|"origin_fields"|"transport_fields"|"document_hashes_only"
    expires_at_ms: Option<u64>, // unix milliseconds; none = no expiry
    revoked: bool,
}
```

---

## Entry Functions

### `create_shipment_passport` — modified signature

**Add parameters:**
```move
memwal_space_id: String,
walrus_blob_ids: vector<String>,
manifest_hash: String,
```

**Remove parameters** (moved to MemWal):
- `ai_score`
- `risk_level`
- `document_hashes`
- `storage_uris`

The existing `shipment_id`, `shipper`, `consignee`, `origin`, `destination`, `carrier`,
`transport_mode`, `clock`, `ctx` parameters remain unchanged.

---

### `grant_access` — new entry function

```move
public entry fun grant_access(
    passport: &mut ShipmentPassport,
    grantee: address,
    scope: String,
    expires_at_ms: Option<u64>,
    clock: &Clock,
    ctx: &mut TxContext
)
```

**Access control:** Caller must be `passport.owner`.  
**Constraint:** Cannot add a second grant for the same grantee without revoking the first.

---

### `revoke_access` — new entry function

```move
public entry fun revoke_access(
    passport: &mut ShipmentPassport,
    grantee: address,
    clock: &Clock,
)
```

Sets `grants[grantee].revoked = true`. Does not delete the record (audit trail).

---

### `transfer_passport` — new entry function

```move
public entry fun transfer_passport(
    passport: ShipmentPassport,
    new_owner: address,
    clock: &Clock,
    ctx: &mut TxContext
)
```

Wraps `public_transfer`. Emits `PassportTransferred` event.

---

## Events

```move
struct PassportMinted has copy, drop {
    passport_id: ID,
    owner: address,
    memwal_space_id: String,
    manifest_hash: String,
    minted_at_ms: u64,
}

struct AccessGranted has copy, drop {
    passport_id: ID,
    grantee: address,
    scope: String,
    expires_at_ms: Option<u64>,
}

struct AccessRevoked has copy, drop {
    passport_id: ID,
    grantee: address,
}

struct PassportTransferred has copy, drop {
    passport_id: ID,
    from: address,
    to: address,
}
```

---

## Access Control Rules

1. All mutation entry functions (`grant_access`, `revoke_access`, `transfer_passport`)
   require `tx_context::sender(ctx) == passport.owner`.
2. `grant_access` reverts if a non-revoked, non-expired grant already exists for `grantee`.
3. A grant with `expires_at_ms < clock::timestamp_ms(clock)` is treated as revoked in all
   on-chain checks.

---

## TypeScript ↔ Move Mapping

| TypeScript type | Move type |
|---|---|
| `string` | `String` (UTF-8) |
| `string[]` | `vector<String>` |
| `number` (timestamp) | `u64` (unix milliseconds) |
| `Record<string, string>` | `VecMap<String, String>` |
| `undefined` / `null` | `Option<T>` |

All timestamps in TypeScript are ISO 8601 strings. Convert to/from unix milliseconds
when calling Move functions: `new Date(isoString).getTime()` → `u64`.

---

## Existing Functions — Unchanged

The following entry functions from the original contract remain unchanged:
- `mark_customs_ready`
- `mark_customs_cleared`
- `update_status`

---

## Integration Checklist for `RealSuiPassportClient`

When the contract is deployed:

1. Set `NEXT_PUBLIC_SUISHIP_PACKAGE_ID` to the deployed package address.
2. Set `SUI_CLIENT=real` in `.env`.
3. Implement `lib/sui-passport/real-client.ts` using `@mysten/sui` `Transaction` builder
   + `SuiClient.signAndExecuteTransaction()` (wallet signing via `@mysten/dapp-kit`).
4. Map each `SuiPassportClient` interface method to the corresponding Move entry function.
5. Verify `mock_sui_passports` rows against on-chain objects as a sanity check.

The `lib/mint-sequence.ts` orchestration, all API routes, and all frontend components
remain unchanged when `SUI_CLIENT` is switched from `mock` to `real`.
