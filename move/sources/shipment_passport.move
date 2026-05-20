#[allow(duplicate_alias, lint(public_entry))]
module suiship::shipment_passport {
    use std::option::Option;
    use std::string::{Self, String};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    const MIN_VERIFICATION_SCORE: u64 = 90;

    const E_NOT_AUTHORIZED: u64 = 0;
    const E_LOW_VERIFICATION_SCORE: u64 = 1;
    const E_EMPTY_WALRUS_BLOB_ID: u64 = 2;
    const E_EMPTY_DOCUMENT_PACKAGE: u64 = 3;

    /// Final Sui proof that a shipment's verified document package was created.
    ///
    /// The actual PDFs live in one ZIP package on Walrus. The AI validation and
    /// audit trail live in MemWal progress manifests. This object keeps the
    /// minimum on-chain proof: who signed, which shipment, where to retrieve the
    /// package/validation, and the final validation score.
    public struct ShipmentPassport has key, store {
        id: UID,
        shipment_id: String,
        importer: address,
        exporter: address,
        owner: address,
        uploaded_by: address,
        status: String,
        walrus_blob_id: String,
        memwal_space_id: String,
        final_validation_memwal_id: String,
        package_hash: Option<vector<u8>>,
        verification_score: u64,
        document_count: u64,
        created_at_ms: u64,
        updated_at_ms: u64,
    }

    public struct PassportCreated has copy, drop {
        passport_id: ID,
        shipment_id: String,
        owner: address,
        uploaded_by: address,
        walrus_blob_id: String,
        memwal_space_id: String,
        final_validation_memwal_id: String,
        verification_score: u64,
        document_count: u64,
        created_at_ms: u64,
    }

    public struct PassportStatusUpdated has copy, drop {
        passport_id: ID,
        status: String,
        updated_at_ms: u64,
    }

    public entry fun create_shipment_passport(
        shipment_id: String,
        importer: address,
        exporter: address,
        walrus_blob_id: String,
        memwal_space_id: String,
        final_validation_memwal_id: String,
        package_hash: Option<vector<u8>>,
        verification_score: u64,
        document_count: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(is_authorized(sender, importer, exporter), E_NOT_AUTHORIZED);
        assert!(verification_score >= MIN_VERIFICATION_SCORE, E_LOW_VERIFICATION_SCORE);
        assert!(string::length(&walrus_blob_id) > 0, E_EMPTY_WALRUS_BLOB_ID);
        assert!(document_count > 0, E_EMPTY_DOCUMENT_PACKAGE);

        let now = clock::timestamp_ms(clock);

        let passport = ShipmentPassport {
            id: object::new(ctx),
            shipment_id,
            importer,
            exporter,
            owner: sender,
            uploaded_by: sender,
            status: string::utf8(b"AI Verified"),
            walrus_blob_id,
            memwal_space_id,
            final_validation_memwal_id,
            package_hash,
            verification_score,
            document_count,
            created_at_ms: now,
            updated_at_ms: now,
        };

        event::emit(PassportCreated {
            passport_id: object::id(&passport),
            shipment_id: passport.shipment_id,
            owner: passport.owner,
            uploaded_by: passport.uploaded_by,
            walrus_blob_id: passport.walrus_blob_id,
            memwal_space_id: passport.memwal_space_id,
            final_validation_memwal_id: passport.final_validation_memwal_id,
            verification_score: passport.verification_score,
            document_count: passport.document_count,
            created_at_ms: passport.created_at_ms,
        });

        transfer::public_transfer(passport, sender);
    }

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

    public entry fun mark_customs_ready(passport: &mut ShipmentPassport, clock: &Clock, ctx: &TxContext) {
        update_status(passport, string::utf8(b"Customs Ready"), clock, ctx);
    }

    public entry fun mark_customs_cleared(passport: &mut ShipmentPassport, clock: &Clock, ctx: &TxContext) {
        update_status(passport, string::utf8(b"Customs Cleared"), clock, ctx);
    }

    public fun is_authorized(sender: address, importer: address, exporter: address): bool {
        sender == importer || sender == exporter
    }

    public fun get_shipment_id(passport: &ShipmentPassport): String {
        passport.shipment_id
    }

    public fun get_importer(passport: &ShipmentPassport): address {
        passport.importer
    }

    public fun get_exporter(passport: &ShipmentPassport): address {
        passport.exporter
    }

    public fun get_owner(passport: &ShipmentPassport): address {
        passport.owner
    }

    public fun get_uploaded_by(passport: &ShipmentPassport): address {
        passport.uploaded_by
    }

    public fun get_status(passport: &ShipmentPassport): String {
        passport.status
    }

    public fun get_walrus_blob_id(passport: &ShipmentPassport): String {
        passport.walrus_blob_id
    }

    public fun get_memwal_space_id(passport: &ShipmentPassport): String {
        passport.memwal_space_id
    }

    public fun get_final_validation_memwal_id(passport: &ShipmentPassport): String {
        passport.final_validation_memwal_id
    }

    public fun get_package_hash(passport: &ShipmentPassport): Option<vector<u8>> {
        passport.package_hash
    }

    public fun get_verification_score(passport: &ShipmentPassport): u64 {
        passport.verification_score
    }

    public fun get_document_count(passport: &ShipmentPassport): u64 {
        passport.document_count
    }

    public fun get_created_at_ms(passport: &ShipmentPassport): u64 {
        passport.created_at_ms
    }

    public fun get_updated_at_ms(passport: &ShipmentPassport): u64 {
        passport.updated_at_ms
    }
}
