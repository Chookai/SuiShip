import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Clock3, FileCheck2, Fingerprint, Globe2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PassportActions } from "@/components/passport-actions";
import { QrCard } from "@/components/qr-card";
import { Panel, RiskBadge, StatusBadge } from "@/components/ui";
import { findShipment } from "@/lib/demo-data";

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shipment = findShipment(decodeURIComponent(id));
  if (!shipment) notFound();

  const qrValue = `suiship://passport/${shipment.objectId || shipment.id}`;

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-steel hover:text-pearl">
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-sui">Shipment passport</p>
          <h1 className="mt-3 text-4xl font-semibold text-pearl">{shipment.id}</h1>
          <p className="mt-3 text-steel">{shipment.cargo} from {shipment.origin} to {shipment.destination}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={shipment.status} />
          <RiskBadge value={shipment.riskLevel} />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-6">
          <Panel>
            <div className="grid gap-4 md:grid-cols-4">
              {[
                ["AI score", `${shipment.aiScore}%`, ShieldCheck],
                ["Documents", `${shipment.documents.length}`, FileCheck2],
                ["Transport", shipment.transportMode, Globe2],
                ["Updated", shipment.updatedAt, Clock3]
              ].map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-lg border border-white/10 bg-white/6 p-4">
                  <Icon className="h-5 w-5 text-sui" />
                  <p className="mt-4 text-sm text-steel">{label as string}</p>
                  <p className="mt-1 font-semibold text-pearl">{value as string}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <h2 className="text-xl font-semibold text-pearl">Passport overview</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Shipper", shipment.shipper],
                ["Consignee", shipment.consignee],
                ["Carrier", shipment.carrier],
                ["Incoterm", shipment.incoterm],
                ["Declared value", shipment.declaredValue],
                ["Owner", shipment.owner]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-white/6 p-4">
                  <p className="text-sm text-steel">{label}</p>
                  <p className="mt-1 font-medium text-pearl">{value}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <h2 className="text-xl font-semibold text-pearl">Document hash verification</h2>
            <div className="mt-5 grid gap-3">
              {shipment.documents.map((document) => (
                <div key={document.hash} className="rounded-lg border border-white/10 bg-white/6 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-pearl">{document.name}</p>
                      <p className="mt-1 text-sm text-steel">{document.kind} stored off-chain</p>
                    </div>
                    <StatusBadge value={document.verified ? "Hash Verified" : "Pending"} />
                  </div>
                  <p className="mt-3 break-all rounded-lg bg-black/20 px-3 py-2 text-xs text-steel">{document.hash}</p>
                  <p className="mt-2 break-all text-xs text-sui">{document.storageUri}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <h2 className="text-xl font-semibold text-pearl">Timeline</h2>
            <div className="mt-5 grid gap-4">
              {["Documents uploaded", "AI extraction completed", "Passport anchored on Sui", "Customs ready status set"].map((item, index) => (
                <div key={item} className="flex gap-4">
                  <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full border border-sui/40 bg-sui/10 text-xs text-sui">{index + 1}</span>
                  <div>
                    <p className="font-medium text-pearl">{item}</p>
                    <p className="text-sm text-steel">{index === 0 ? shipment.createdAt : shipment.updatedAt}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="grid h-fit gap-6">
          <Panel>
            <div className="flex items-center gap-3">
              <Boxes className="h-5 w-5 text-sui" />
              <h2 className="text-xl font-semibold text-pearl">On-chain proof</h2>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <p className="text-steel">Sui object ID</p>
              <p className="break-all rounded-lg bg-white/6 p-3 text-pearl">{shipment.objectId}</p>
              <p className="text-steel">Shipment object type</p>
              <p className="break-all rounded-lg bg-white/6 p-3 text-pearl">suiship::shipment_passport::ShipmentPassport</p>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center gap-3">
              <Fingerprint className="h-5 w-5 text-sui" />
              <h2 className="text-xl font-semibold text-pearl">QR shipment link</h2>
            </div>
            <div className="mt-5 flex justify-center">
              <QrCard value={qrValue} />
            </div>
            <p className="mt-4 break-all text-center text-xs text-steel">{qrValue}</p>
          </Panel>

          <Panel>
            <h2 className="text-xl font-semibold text-pearl">Customs action</h2>
            <p className="mt-2 text-sm text-steel">For a real minted object, this signs a Sui status update transaction.</p>
            <div className="mt-5">
              <PassportActions objectId={shipment.objectId} />
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
