import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function usd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function formatCrypto(amount: string, code: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${code.toUpperCase()}`;
  const digits = code === "btc" ? 8 : code === "sol" ? 6 : 6;
  return `${n.toFixed(digits)} ${code.toUpperCase()}`;
}
