import { NextRequest, NextResponse } from "next/server";
import { extract } from "../../../../src/index";
import type { PdfFile } from "../../../../src/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const fileEntries = formData.getAll("files");
  if (fileEntries.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const pdfFiles: PdfFile[] = [];
  for (const entry of fileEntries) {
    if (!(entry instanceof File)) continue;
    const buffer = Buffer.from(await entry.arrayBuffer());
    pdfFiles.push({
      id: entry.name,
      name: entry.name,
      buffer,
      sizeBytes: entry.size,
    });
  }

  if (pdfFiles.length === 0) {
    return NextResponse.json({ error: "No valid file entries found" }, { status: 400 });
  }

  try {
    const result = await extract(pdfFiles);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
