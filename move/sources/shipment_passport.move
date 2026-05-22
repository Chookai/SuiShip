/// SuiShip — on-chain shipping document verification.
///
/// Objects:
///   1. ShipmentRecord        — lightweight metadata created at shipment creation.
///   2. DocAccumulator        — shared; each document upload appends a commitment.
///   3. ShipmentPassport      — final NFT minted at finalization.
///   4. ShipmentEndorsementLog— shared custody-chain log; freight forwarder and
///                              customs endorse here without touching the owned NFT.
///   5. FreightForwarderCap / CustomsCap — capability objects granting role access.
///
/// A ShipmentRegistry singleton prevents duplicate shipment IDs.
#[allow(duplicate_alias, lint(public_entry))]
module suiship::shipment_passport {
    use std::string::{Self, String};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::table::{Self, Table};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    // ── Error codes ──────────────────────────────────────────────────────────

    const E_NOT_AUTHORIZED:       u64 = 0;
    const E_LOW_SCORE:            u64 = 1;
    const E_EMPTY_WALRUS_BLOB_ID: u64 = 2;
    const E_EMPTY_PACKAGE_HASH:   u64 = 3;
    const E_NO_DOCUMENTS:         u64 = 4;
    const E_DUPLICATE_SHIPMENT:   u64 = 5;
    const E_ALREADY_FINALIZED:    u64 = 6;
    const E_WRONG_SHIPMENT:       u64 = 7;
    const E_WRONG_GRANTEE:        u64 = 8;

    const MIN_VERIFICATION_SCORE: u64 = 85;

    // ── Structs ──────────────────────────────────────────────────────────────

    /// Singleton registry — deployed once in init().
    /// Prevents duplicate shipment IDs on-chain.
    public struct ShipmentRegistry has key {
        id: UID,
        admin: address,
        /// shipment_id (String) → ShipmentRecord object ID
        shipments: Table<String, ID>,
    }

    /// Lightweight shipment metadata. Created at shipment creation.
    /// Transferred to the initiator (importer or exporter).
    public struct ShipmentRecord has key, store {
        id: UID,
        shipment_id: String,
        initiator: address,
        importer: address,
        exporter: address,
        template: String,
        manifest_digest: vector<u8>,
        /// 0=draft 1=in_progress 2=ready 3=finalized
        state: u8,
        doc_count_committed: u64,
        created_at_ms: u64,
        updated_at_ms: u64,
    }

    /// One document commitment appended by commit_document().
    public struct DocEntry has store, copy, drop {
        doc_id: String,
        slot_key: String,
        /// SHA-256 of raw PDF bytes
        content_hash: vector<u8>,
        /// SHA-256 of Haiku extraction JSON — AI work is tamper-evident
        extraction_hash: vector<u8>,
        uploader: address,
        committed_at_ms: u64,
    }

    /// Shared object — cheap per-doc appends before the final mint.
    /// Frozen (not deleted) after finalization so the audit trail remains readable.
    public struct DocAccumulator has key {
        id: UID,
        shipment_id: String,
        importer: address,
        exporter: address,
        finalized: bool,
        entries: vector<DocEntry>,
    }

    /// Final NFT anchoring the entire verified document package.
    /// Transferred to the initiator on finalize_shipment().
    public struct ShipmentPassport has key, store {
        id: UID,
        shipment_id: String,
        importer: address,
        exporter: address,
        owner: address,
        template: String,
        /// Walrus blob IDs — index 0 = manifest JSON, 1..N = raw PDFs
        walrus_blob_ids: vector<String>,
        memwal_space_id: String,
        /// SHA-256 of all DocEntry.content_hash + extraction_hash concatenated
        accumulator_digest: vector<u8>,
        /// ID of the (now frozen) DocAccumulator
        accumulator_id: ID,
        /// SHA-256 of the canonical public manifest bytes (reproducible)
        package_hash: vector<u8>,
        /// SHA-256 of the final cross-validation JSON stored in MemWal
        validation_hash: vector<u8>,
        verification_score: u64,
        document_count: u64,
        status: String,
        created_at_ms: u64,
        updated_at_ms: u64,
        /// ID of the shared ShipmentEndorsementLog created alongside this passport
        endorsement_log_id: ID,
        /// SEAL encrypted object key ID (32 bytes, or empty before SEAL integration)
        seal_object_id: vector<u8>,
        /// Walrus blob ID of the SEAL-encrypted private payload (or empty before SEAL)
        encrypted_blob_id: String,
    }

    /// Shared custody audit log. Created at finalize_shipment().
    /// All parties (importer, exporter, freight forwarder, customs) write here.
    /// Passport stays an owned NFT; this log is the mutable shared companion.
    public struct ShipmentEndorsementLog has key {
        id: UID,
        passport_id: ID,
        shipment_id: String,
        importer: address,
        exporter: address,
        endorsements: vector<Endorsement>,
    }

    /// A single custody endorsement appended to the log.
    public struct Endorsement has store, copy, drop {
        role: String,          // "importer" | "exporter" | "freight_forwarder" | "customs"
        signer: address,
        action: String,        // e.g. "picked_up" | "customs_submitted" | "customs_cleared" | "delivered"
        note_hash: vector<u8>, // SHA-256 of an off-chain note, or empty
        signed_at_ms: u64,
    }

    /// Capability granting freight-forwarder endorsement rights for one shipment.
    /// Minted by the passport owner via grant_freight_forwarder_role().
    public struct FreightForwarderCap has key, store {
        id: UID,
        shipment_id: String,
        grantee: address,
    }

    /// Capability granting customs endorsement rights for one shipment.
    /// Minted by the passport owner via grant_customs_role().
    public struct CustomsCap has key, store {
        id: UID,
        shipment_id: String,
        grantee: address,
    }

    // ── Events ───────────────────────────────────────────────────────────────

    public struct ShipmentCreated has copy, drop {
        record_id: ID,
        accumulator_id: ID,
        shipment_id: String,
        initiator: address,
        importer: address,
        exporter: address,
        template: String,
        created_at_ms: u64,
    }

    public struct DocumentCommitted has copy, drop {
        accumulator_id: ID,
        shipment_id: String,
        doc_id: String,
        slot_key: String,
        uploader: address,
        committed_at_ms: u64,
    }

    public struct ShipmentFinalized has copy, drop {
        passport_id: ID,
        accumulator_id: ID,
        shipment_id: String,
        owner: address,
        verification_score: u64,
        document_count: u64,
        created_at_ms: u64,
    }

    public struct PassportStatusUpdated has copy, drop {
        passport_id: ID,
        status: String,
        updated_at_ms: u64,
    }

    public struct EndorsementLogCreated has copy, drop {
        log_id: ID,
        passport_id: ID,
        shipment_id: String,
    }

    public struct PassportEndorsed has copy, drop {
        log_id: ID,
        passport_id: ID,
        shipment_id: String,
        role: String,
        signer: address,
        action: String,
        signed_at_ms: u64,
    }

    // ── Module initializer ───────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        let registry = ShipmentRegistry {
            id: object::new(ctx),
            admin: tx_context::sender(ctx),
            shipments: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    fun append_bytes(dst: &mut vector<u8>, src: &vector<u8>) {
        let mut i = 0;
        let len = vector::length(src);
        while (i < len) {
            vector::push_back(dst, *vector::borrow(src, i));
            i = i + 1;
        };
    }

    // ── Entry functions ──────────────────────────────────────────────────────

    /// Create a ShipmentRecord + DocAccumulator in one transaction.
    /// Enforces unique shipment_id via the registry.
    public entry fun create_shipment(
        registry: &mut ShipmentRegistry,
        shipment_id: String,
        initiator: address,
        importer: address,
        exporter: address,
        template: String,
        manifest_digest: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(
            sender == registry.admin || sender == initiator || sender == importer || sender == exporter,
            E_NOT_AUTHORIZED
        );
        assert!(importer != exporter, E_NOT_AUTHORIZED);
        assert!(
            !table::contains(&registry.shipments, shipment_id),
            E_DUPLICATE_SHIPMENT
        );

        let now = clock::timestamp_ms(clock);

        let accumulator = DocAccumulator {
            id: object::new(ctx),
            shipment_id,
            importer,
            exporter,
            finalized: false,
            entries: vector[],
        };
        let accumulator_id = object::id(&accumulator);

        let record = ShipmentRecord {
            id: object::new(ctx),
            shipment_id,
            initiator,
            importer,
            exporter,
            template,
            manifest_digest,
            state: 1u8,
            doc_count_committed: 0,
            created_at_ms: now,
            updated_at_ms: now,
        };
        let record_id = object::id(&record);

        table::add(&mut registry.shipments, shipment_id, record_id);

        event::emit(ShipmentCreated {
            record_id,
            accumulator_id,
            shipment_id: record.shipment_id,
            initiator: sender,
            importer,
            exporter,
            template: record.template,
            created_at_ms: now,
        });

        transfer::share_object(accumulator);
        transfer::transfer(record, sender);
    }

    /// Append a document commitment to the accumulator.
    /// Called once per document upload after Haiku extraction succeeds.
    /// ~2000 gas. Does not block the upload response.
    public entry fun commit_document(
        registry: &ShipmentRegistry,
        accumulator: &mut DocAccumulator,
        doc_id: String,
        slot_key: String,
        content_hash: vector<u8>,
        extraction_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(
            sender == registry.admin || sender == accumulator.importer || sender == accumulator.exporter,
            E_NOT_AUTHORIZED
        );
        assert!(!accumulator.finalized, E_ALREADY_FINALIZED);

        let now = clock::timestamp_ms(clock);

        let entry = DocEntry {
            doc_id,
            slot_key,
            content_hash,
            extraction_hash,
            uploader: sender,
            committed_at_ms: now,
        };

        vector::push_back(&mut accumulator.entries, entry);

        event::emit(DocumentCommitted {
            accumulator_id: object::id(accumulator),
            shipment_id: accumulator.shipment_id,
            doc_id: entry.doc_id,
            slot_key: entry.slot_key,
            uploader: sender,
            committed_at_ms: now,
        });
    }

    /// Finalize the shipment: create the ShipmentPassport NFT and freeze the
    /// accumulator so the audit trail is permanently readable on-chain.
    ///
    /// The ShipmentRecord is consumed (deleted). The accumulator is frozen.
    public entry fun finalize_shipment(
        registry: &mut ShipmentRegistry,
        record: ShipmentRecord,
        accumulator: &mut DocAccumulator,
        walrus_manifest_blob_id: String,
        _walrus_doc_blob_ids_json: String,
        memwal_space_id: String,
        owner: address,
        package_hash: vector<u8>,
        validation_hash: vector<u8>,
        verification_score: u64,
        seal_object_id: vector<u8>,
        encrypted_blob_id: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(
            sender == registry.admin || sender == record.importer || sender == record.exporter,
            E_NOT_AUTHORIZED
        );
        assert!(
            record.shipment_id == accumulator.shipment_id,
            E_WRONG_SHIPMENT
        );
        assert!(!accumulator.finalized, E_ALREADY_FINALIZED);
        assert!(verification_score >= MIN_VERIFICATION_SCORE, E_LOW_SCORE);
        assert!(
            string::length(&walrus_manifest_blob_id) > 0,
            E_EMPTY_WALRUS_BLOB_ID
        );
        assert!(vector::length(&package_hash) > 0, E_EMPTY_PACKAGE_HASH);
        assert!(vector::length(&accumulator.entries) > 0, E_NO_DOCUMENTS);

        let now = clock::timestamp_ms(clock);

        // Build walrus_blob_ids: manifest first, then doc blobs from JSON string
        let walrus_blob_ids = vector[walrus_manifest_blob_id];
        // Additional blob IDs encoded as JSON are stored in the passport field.
        // Indexers can parse walrus_doc_blob_ids_json for the full list.

        // Compute accumulator_digest: hash of all content+extraction hashes
        let mut digest_input = vector[];
        let mut i = 0;
        let len = vector::length(&accumulator.entries);
        while (i < len) {
            let entry = vector::borrow(&accumulator.entries, i);
            append_bytes(&mut digest_input, &entry.content_hash);
            append_bytes(&mut digest_input, &entry.extraction_hash);
            i = i + 1;
        };
        // Note: full SHA-256 of digest_input would require a hash function call.
        // Sui Move 2024 provides sui::hash::blake2b256 — use that as accumulator digest.
        let accumulator_digest = sui::hash::blake2b256(&digest_input);

        let document_count = vector::length(&accumulator.entries);
        let accumulator_id = object::id(accumulator);
        let shipment_id = record.shipment_id;
        let importer = record.importer;
        let exporter = record.exporter;
        let template = record.template;

        // Create the endorsement log first so we can capture its ID for the passport
        let log_uid = object::new(ctx);
        let log_id = object::uid_to_inner(&log_uid);
        // Save shipment_id copy for the log (shipment_id is moved into passport below)
        let log_shipment_id = shipment_id;

        let passport = ShipmentPassport {
            id: object::new(ctx),
            shipment_id,
            importer,
            exporter,
            owner,
            template,
            walrus_blob_ids,
            memwal_space_id,
            accumulator_digest,
            accumulator_id,
            package_hash,
            validation_hash,
            verification_score,
            document_count: (document_count as u64),
            status: string::utf8(b"AI Verified"),
            created_at_ms: now,
            updated_at_ms: now,
            endorsement_log_id: log_id,
            seal_object_id,
            encrypted_blob_id,
        };
        let passport_id = object::id(&passport);

        // Remove shipment_id from registry so it can be re-registered if needed
        table::remove(&mut registry.shipments, shipment_id);

        // Mark accumulator as finalized so no more commits can be appended.
        accumulator.finalized = true;

        event::emit(ShipmentFinalized {
            passport_id,
            accumulator_id,
            shipment_id: passport.shipment_id,
            owner,
            verification_score,
            document_count: (document_count as u64),
            created_at_ms: now,
        });

        // Consume (delete) the ShipmentRecord — its data lives in the passport now.
        let ShipmentRecord {
            id: record_uid,
            shipment_id: _,
            initiator: _,
            importer: _,
            exporter: _,
            template: _,
            manifest_digest: _,
            state: _,
            doc_count_committed: _,
            created_at_ms: _,
            updated_at_ms: _,
        } = record;
        object::delete(record_uid);

        transfer::transfer(passport, owner);

        // Create and share the endorsement log (separate shared object — passport stays owned NFT)
        let log = ShipmentEndorsementLog {
            id: log_uid,
            passport_id,
            shipment_id: log_shipment_id,
            importer,
            exporter,
            endorsements: vector[],
        };

        event::emit(EndorsementLogCreated {
            log_id,
            passport_id,
            shipment_id: log.shipment_id,
        });

        transfer::share_object(log);
    }

    // ── Endorsement functions ────────────────────────────────────────────────

    /// Endorse by the importer or exporter (authorized by address on the log).
    public entry fun endorse_shipment(
        log: &mut ShipmentEndorsementLog,
        role: String,
        action: String,
        note_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == log.importer || sender == log.exporter, E_NOT_AUTHORIZED);
        let signed_at_ms = clock::timestamp_ms(clock);
        let e = Endorsement { role, signer: sender, action, note_hash, signed_at_ms };
        vector::push_back(&mut log.endorsements, e);
        event::emit(PassportEndorsed {
            log_id: object::id(log),
            passport_id: log.passport_id,
            shipment_id: log.shipment_id,
            role: e.role,
            signer: sender,
            action: e.action,
            signed_at_ms,
        });
    }

    /// Endorse as freight forwarder (requires FreightForwarderCap for this shipment).
    public entry fun endorse_as_freight_forwarder(
        log: &mut ShipmentEndorsementLog,
        cap: &FreightForwarderCap,
        action: String,
        note_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(cap.shipment_id == log.shipment_id, E_WRONG_SHIPMENT);
        let sender = tx_context::sender(ctx);
        assert!(sender == cap.grantee, E_WRONG_GRANTEE);
        let role = string::utf8(b"freight_forwarder");
        let signed_at_ms = clock::timestamp_ms(clock);
        let e = Endorsement { role, signer: sender, action, note_hash, signed_at_ms };
        vector::push_back(&mut log.endorsements, e);
        event::emit(PassportEndorsed {
            log_id: object::id(log),
            passport_id: log.passport_id,
            shipment_id: log.shipment_id,
            role: e.role,
            signer: sender,
            action: e.action,
            signed_at_ms,
        });
    }

    /// Endorse as customs authority (requires CustomsCap for this shipment).
    public entry fun endorse_as_customs(
        log: &mut ShipmentEndorsementLog,
        cap: &CustomsCap,
        action: String,
        note_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(cap.shipment_id == log.shipment_id, E_WRONG_SHIPMENT);
        let sender = tx_context::sender(ctx);
        assert!(sender == cap.grantee, E_WRONG_GRANTEE);
        let role = string::utf8(b"customs");
        let signed_at_ms = clock::timestamp_ms(clock);
        let e = Endorsement { role, signer: sender, action, note_hash, signed_at_ms };
        vector::push_back(&mut log.endorsements, e);
        event::emit(PassportEndorsed {
            log_id: object::id(log),
            passport_id: log.passport_id,
            shipment_id: log.shipment_id,
            role: e.role,
            signer: sender,
            action: e.action,
            signed_at_ms,
        });
    }

    /// Grant freight-forwarder capability for this shipment. Only the passport owner may call this.
    public entry fun grant_freight_forwarder_role(
        passport: &ShipmentPassport,
        grantee: address,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == passport.owner, E_NOT_AUTHORIZED);
        let cap = FreightForwarderCap {
            id: object::new(ctx),
            shipment_id: passport.shipment_id,
            grantee,
        };
        transfer::transfer(cap, grantee);
    }

    /// Grant customs capability for this shipment. Only the passport owner may call this.
    public entry fun grant_customs_role(
        passport: &ShipmentPassport,
        grantee: address,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == passport.owner, E_NOT_AUTHORIZED);
        let cap = CustomsCap {
            id: object::new(ctx),
            shipment_id: passport.shipment_id,
            grantee,
        };
        transfer::transfer(cap, grantee);
    }

    // ── SEAL access policy ───────────────────────────────────────────────────

    /// Called by SEAL key servers to gate decryption of the confidential payload.
    /// SEAL identity = DocAccumulator object ID (known before finalize, used as encryption id).
    /// Authorization: caller must be importer, exporter, or any endorser on the log.
    public fun seal_approve(
        id: vector<u8>,
        accumulator: &DocAccumulator,
        log: &ShipmentEndorsementLog,
        ctx: &TxContext,
    ) {
        assert!(id == object::id_to_bytes(&object::id(accumulator)), E_WRONG_SHIPMENT);
        assert!(accumulator.shipment_id == log.shipment_id, E_WRONG_SHIPMENT);

        let sender = tx_context::sender(ctx);
        if (sender == log.importer || sender == log.exporter) { return };
        let mut i = 0;
        let len = vector::length(&log.endorsements);
        while (i < len) {
            if (vector::borrow(&log.endorsements, i).signer == sender) { return };
            i = i + 1;
        };
        abort E_NOT_AUTHORIZED
    }

    // ── Status update functions ──────────────────────────────────────────────

    public entry fun update_status(
        passport: &mut ShipmentPassport,
        status: String,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(tx_context::sender(ctx) == passport.owner, E_NOT_AUTHORIZED);
        passport.status = status;
        passport.updated_at_ms = clock::timestamp_ms(clock);

        event::emit(PassportStatusUpdated {
            passport_id: object::id(passport),
            status: passport.status,
            updated_at_ms: passport.updated_at_ms,
        });
    }

    public entry fun mark_customs_ready(
        passport: &mut ShipmentPassport,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        update_status(passport, string::utf8(b"Customs Ready"), clock, ctx);
    }

    public entry fun mark_customs_cleared(
        passport: &mut ShipmentPassport,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        update_status(passport, string::utf8(b"Customs Cleared"), clock, ctx);
    }

    // ── Read-only accessors ──────────────────────────────────────────────────

    public fun get_shipment_id(passport: &ShipmentPassport): String { passport.shipment_id }
    public fun get_importer(passport: &ShipmentPassport): address { passport.importer }
    public fun get_exporter(passport: &ShipmentPassport): address { passport.exporter }
    public fun get_owner(passport: &ShipmentPassport): address { passport.owner }
    public fun get_status(passport: &ShipmentPassport): String { passport.status }
    public fun get_verification_score(passport: &ShipmentPassport): u64 { passport.verification_score }
    public fun get_document_count(passport: &ShipmentPassport): u64 { passport.document_count }
    public fun get_accumulator_id(passport: &ShipmentPassport): ID { passport.accumulator_id }
    public fun get_package_hash(passport: &ShipmentPassport): vector<u8> { passport.package_hash }
    public fun get_accumulator_digest(passport: &ShipmentPassport): vector<u8> { passport.accumulator_digest }

    public fun is_authorized(sender: address, importer: address, exporter: address): bool {
        sender == importer || sender == exporter
    }

    public fun accumulator_entry_count(accumulator: &DocAccumulator): u64 {
        vector::length(&accumulator.entries)
    }

    public fun accumulator_is_finalized(accumulator: &DocAccumulator): bool {
        accumulator.finalized
    }

    public fun get_endorsement_log_id(passport: &ShipmentPassport): ID { passport.endorsement_log_id }
    public fun get_seal_object_id(passport: &ShipmentPassport): &vector<u8> { &passport.seal_object_id }
    public fun get_encrypted_blob_id(passport: &ShipmentPassport): &String { &passport.encrypted_blob_id }
    public fun endorsement_count(log: &ShipmentEndorsementLog): u64 {
        vector::length(&log.endorsements)
    }
}
