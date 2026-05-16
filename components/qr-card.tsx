"use client";

import { QRCodeSVG } from "qrcode.react";

export function QrCard({ value }: { value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white p-4">
      <QRCodeSVG value={value} size={176} bgColor="#ffffff" fgColor="#07111f" level="M" />
    </div>
  );
}
