#[allow(duplicate_alias, lint(public_entry))]
module suiship::shipment_passport {
    use std::string::{Self, String};
    use std::vector;
    use sui::clock::{Self, Clock};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

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
        document_count: u64,
        document_hashes: vector<String>,
        storage_uris: vector<String>,
        created_at_ms: u64,
        updated_at_ms: u64,
        owner: address,
    }

    public entry fun create_shipment_passport(
        shipment_id: String,
        shipper: String,
        consignee: String,
        origin: String,
        destination: String,
        carrier: String,
        transport_mode: String,
        ai_score: u64,
        risk_level: String,
        document_hashes: vector<String>,
        storage_uris: vector<String>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let document_count = vector::length(&document_hashes);

        let passport = ShipmentPassport {
            id: object::new(ctx),
            shipment_id,
            shipper,
            consignee,
            origin,
            destination,
            carrier,
            transport_mode,
            status: string::utf8(b"AI Verified"),
            ai_score,
            risk_level,
            document_count,
            document_hashes,
            storage_uris,
            created_at_ms: now,
            updated_at_ms: now,
            owner: tx_context::sender(ctx),
        };

        transfer::public_transfer(passport, tx_context::sender(ctx));
    }

    public entry fun add_document_hash(
        passport: &mut ShipmentPassport,
        document_hash: String,
        storage_uri: String,
        clock: &Clock,
    ) {
        vector::push_back(&mut passport.document_hashes, document_hash);
        vector::push_back(&mut passport.storage_uris, storage_uri);
        passport.document_count = vector::length(&passport.document_hashes);
        passport.updated_at_ms = clock::timestamp_ms(clock);
    }

    public entry fun update_status(
        passport: &mut ShipmentPassport,
        status: String,
        clock: &Clock,
    ) {
        passport.status = status;
        passport.updated_at_ms = clock::timestamp_ms(clock);
    }

    public entry fun mark_customs_ready(passport: &mut ShipmentPassport, clock: &Clock) {
        passport.status = string::utf8(b"Customs Ready");
        passport.updated_at_ms = clock::timestamp_ms(clock);
    }

    public entry fun mark_customs_cleared(passport: &mut ShipmentPassport, clock: &Clock) {
        passport.status = string::utf8(b"Customs Cleared");
        passport.updated_at_ms = clock::timestamp_ms(clock);
    }
}
