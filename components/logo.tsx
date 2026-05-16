import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="SuiShip home">
      <span className="blue-gradient relative flex h-11 w-11 items-center justify-center rounded-2xl shadow-glow">
        <span className="absolute bottom-2 h-1.5 w-6 rounded-full bg-white/80" />
        <span className="h-4 w-5 rounded-b-md rounded-t-sm border border-white/90 bg-white/20" />
      </span>
      <span className="text-xl font-extrabold tracking-tight text-pearl">SuiShip</span>
    </Link>
  );
}
