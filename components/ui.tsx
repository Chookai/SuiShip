import Link from "next/link";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "blue-gradient text-white shadow-glow hover:brightness-105",
        variant === "secondary" && "border border-blue-100 bg-white text-pearl shadow-sm hover:bg-blue-50 dark:border-slate-700 dark:bg-midnight dark:hover:bg-ink",
        variant === "ghost" && "text-steel hover:bg-blue-50 hover:text-pearl dark:hover:bg-ink dark:hover:text-pearl",
        className
      )}
      {...props}
    />
  );
}

export function LinkButton({
  href,
  className,
  variant = "primary",
  children
}: {
  href: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition",
        variant === "primary" && "blue-gradient text-white shadow-glow hover:brightness-105",
        variant === "secondary" && "border border-blue-100 bg-white text-pearl shadow-sm hover:bg-blue-50 dark:border-slate-700 dark:bg-midnight dark:hover:bg-ink",
        variant === "ghost" && "text-steel hover:bg-blue-50 hover:text-pearl dark:hover:bg-ink dark:hover:text-pearl",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("glass rounded-[1.6rem] p-6", className)}>{children}</section>;
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-steel">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-12 rounded-2xl border border-blue-100 bg-white px-4 text-pearl shadow-sm outline-none transition placeholder:text-steel/55 focus:border-sui/70 focus:bg-blue-50/50 dark:border-slate-700 dark:bg-midnight dark:placeholder:text-steel/60 dark:focus:bg-ink"
      />
    </label>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone = value.includes("Cleared")
    ? "border-emerald-100 bg-emerald-50 text-emerald-600"
    : value.includes("Ready") || value.includes("Verified")
      ? "border-blue-100 bg-blue-50 text-sui"
      : value.includes("Review")
        ? "border-amber-100 bg-amber-50 text-amber-600"
        : "border-slate-100 bg-slate-50 text-steel";
  return <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", tone)}>{value}</span>;
}

export function RiskBadge({ value }: { value: string }) {
  const tone =
    value === "Low"
      ? "border-emerald-100 bg-emerald-50 text-emerald-600"
      : value === "Medium"
        ? "border-amber-100 bg-amber-50 text-amber-600"
        : "border-red-100 bg-red-50 text-red-500";
  return <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", tone)}>{value} risk</span>;
}
