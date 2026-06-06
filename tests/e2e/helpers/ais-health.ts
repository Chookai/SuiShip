/**
 * Confirms the AIS stub server is running before the suite starts.
 * Fails fast with a clear actionable message.
 */
export async function checkAis(): Promise<void> {
  const base = process.env.AIS_BASE_URL ?? "http://localhost:8081";
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { status?: string };
    if (data.status !== "ok") throw new Error(`status=${data.status}`);
    console.log(`[ais-health] AIS stub healthy at ${base}`);
  } catch (err) {
    throw new Error(
      `AIS stub not responding at ${base}: ${err instanceof Error ? err.message : String(err)}\n` +
      `Run in a separate terminal: npm run ais:stub`
    );
  }
}
