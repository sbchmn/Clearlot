import { createHash } from "node:crypto";
/**
 * Chain adapters + quote math. Pure helpers are exported for unit tests.
 * Network I/O always fail-closed: never treat a transport error as paid.
 */

export const CHAINS = ["btc", "etc", "sol", "tron"] as const;
export type Chain = (typeof CHAINS)[number];

export const MANUAL_RAILS = ["cashapp", "venmo"] as const;
export type ManualRail = (typeof MANUAL_RAILS)[number];

export const ASSET_BY_CHAIN: Record<Chain, string> = {
  btc: "bitcoin",
  etc: "ethereum-classic",
  sol: "solana",
  tron: "tron",
};

const TXID_RE: Record<Chain, RegExp> = {
  btc: /^[0-9a-fA-F]{64}$/,
  etc: /^(0x)?[0-9a-fA-F]{64}$/,
  sol: /^[1-9A-HJ-NP-Za-km-z]{43,88}$/,
  tron: /^(0x)?[0-9a-fA-F]{64}$/,
};

export function normalizeTxid(chain: Chain, raw: string): string | null {
  const txid = raw.trim();
  if (!TXID_RE[chain].test(txid)) return null;
  if (chain === "etc") return txid.startsWith("0x") ? txid.toLowerCase() : `0x${txid.toLowerCase()}`;
  if (chain === "btc" || chain === "tron") return txid.replace(/^0x/i, "").toLowerCase();
  return txid;
}

export function normalizeAddress(chain: Chain, address: string): string {
  const a = address.trim();
  if (chain === "etc") return a.toLowerCase();
  if (chain === "tron" || chain === "sol" || chain === "btc") return a;
  return a;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function sha256d(buf: Buffer): Buffer {
  return createHash("sha256").update(createHash("sha256").update(buf).digest()).digest();
}

function toBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const size = Math.ceil((bytes.length * Math.log(256)) / Math.log(58)) + 1;
  const b = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]!;
    let j = 0;
    for (let k = b.length - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * b[k]!;
      b[k] = carry % 58;
      carry = (carry / 58) | 0;
    }
    length = j;
  }
  let k = b.length - length;
  while (k < b.length && b[k] === 0) k += 1;
  let str = "1".repeat(zeros);
  for (; k < b.length; k++) str += B58[b[k]!];
  return str;
}

function fromBase58(s: string): Buffer | null {
  let zeros = 0;
  while (zeros < s.length && s[zeros] === "1") zeros += 1;
  const size = Math.ceil((s.length * Math.log(58)) / Math.log(256)) + 1;
  const b = new Uint8Array(size);
  for (let i = zeros; i < s.length; i++) {
    let carry = B58.indexOf(s[i]!);
    if (carry < 0) return null;
    for (let k = b.length - 1; k >= 0; k--) {
      carry += 58 * b[k]!;
      b[k] = carry & 0xff;
      carry >>= 8;
    }
    if (carry) return null;
  }
  let k = 0;
  while (k < b.length && b[k] === 0) k += 1;
  const out = Buffer.alloc(zeros + (b.length - k));
  for (let i = 0; i < b.length - k; i++) out[zeros + i] = b[k + i]!;
  return out;
}

/** TronGrid returns 21-byte 0x41-prefixed hex; admins paste base58 T-addresses. */
export function tronHexToBase58(hex: string): string | null {
  const clean = hex.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2) return null;
  let payload = Buffer.from(clean, "hex");
  if (payload.length === 20) payload = Buffer.concat([Buffer.from([0x41]), payload]);
  if (payload.length !== 21 || payload[0] !== 0x41) return null;
  const checksum = sha256d(payload).subarray(0, 4);
  return toBase58(Buffer.concat([payload, checksum]));
}

export function tronBase58ToHex(addr: string): string | null {
  const decoded = fromBase58(addr.trim());
  if (!decoded || decoded.length !== 25) return null;
  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);
  if (!sha256d(payload).subarray(0, 4).equals(checksum)) return null;
  if (payload[0] !== 0x41) return null;
  return payload.toString("hex");
}

export function tronAddressKey(address: string): string | null {
  const a = address.trim();
  if (!a) return null;
  if (a.startsWith("T")) return tronBase58ToHex(a);
  const hex = a.replace(/^0x/i, "").toLowerCase();
  if (/^41[0-9a-f]{40}$/.test(hex)) return hex;
  if (/^[0-9a-f]{40}$/.test(hex)) return `41${hex}`;
  return null;
}

export function addressesMatch(chain: Chain, expected: string, observed: string): boolean {
  if (chain === "tron") {
    const a = tronAddressKey(expected);
    const b = tronAddressKey(observed);
    return Boolean(a && b && a === b);
  }
  const a = normalizeAddress(chain, expected);
  const b = normalizeAddress(chain, observed);
  if (chain === "etc") return a === b.toLowerCase();
  return a === b;
}

/** Amounts as decimal strings in native units. Observed must cover expected within 0.3%. */
export function amountCovers(expected: string, observed: string, tolerance = 0.003): boolean {
  const exp = Number(expected);
  const obs = Number(observed);
  if (!Number.isFinite(exp) || !Number.isFinite(obs) || exp <= 0) return false;
  return obs + 1e-12 >= exp * (1 - tolerance);
}

export function quoteNative(usdCents: number, usdPerCoin: number, decimals: number): string {
  if (!(usdPerCoin > 0) || usdCents < 0) throw new Error("Invalid quote inputs");
  const coins = usdCents / 100 / usdPerCoin;
  return coins.toFixed(decimals);
}

export function decimalsFor(chain: Chain): number {
  if (chain === "btc") return 8;
  if (chain === "sol") return 9;
  return 6;
}

export type VerifyOk = {
  ok: true;
  observedAmount: string;
  toAddress: string;
  confirmations: number;
};
export type VerifyFail = {
  ok: false;
  reason: "not_found" | "mismatch" | "unconfirmed" | "error";
  detail: string;
  observedAmount?: string;
  toAddress?: string;
};
export type VerifyResult = VerifyOk | VerifyFail;

const FETCH_MS = 8000;

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

function satToBtc(sats: number): string {
  return (sats / 1e8).toFixed(8);
}

async function verifyBtc(txid: string, expectedAddress: string): Promise<VerifyResult> {
  const { status, json } = await fetchJson(`https://mempool.space/api/tx/${txid}`);
  if (status === 404) return { ok: false, reason: "not_found", detail: "Transaction not found on Bitcoin." };
  if (status >= 400 || !json || typeof json !== "object") {
    return { ok: false, reason: "error", detail: "Bitcoin explorer unavailable." };
  }
  const tx = json as {
    status?: { confirmed?: boolean, block_height?: number };
    vout?: Array<{ scriptpubkey_address?: string; value?: number }>;
  };
  const outs = tx.vout ?? [];
  let observed = 0;
  for (const o of outs) {
    if (o.scriptpubkey_address && addressesMatch("btc", expectedAddress, o.scriptpubkey_address)) {
      observed += Number(o.value || 0);
    }
  }
  if (observed <= 0) {
    return { ok: false, reason: "mismatch", detail: "No output pays the configured BTC address.", observedAmount: "0", toAddress: expectedAddress };
  }
  return {
    ok: true,
    observedAmount: satToBtc(observed),
    toAddress: expectedAddress,
    confirmations: tx.status?.confirmed ? 1 : 0,
  };
}

async function verifyEtc(txid: string, expectedAddress: string): Promise<VerifyResult> {
  const hash = txid.startsWith("0x") ? txid : `0x${txid}`;
  const { status, json } = await fetchJson(`https://etc.blockscout.com/api/v2/transactions/${hash}`);
  if (status === 404) return { ok: false, reason: "not_found", detail: "Transaction not found on Ethereum Classic." };
  if (status >= 400 || !json || typeof json !== "object") {
    return { ok: false, reason: "error", detail: "ETC explorer unavailable." };
  }
  const tx = json as { to?: { hash?: string } | string; value?: string; result?: string; status?: string };
  const to = typeof tx.to === "string" ? tx.to : tx.to?.hash || "";
  if (!addressesMatch("etc", expectedAddress, to)) {
    return { ok: false, reason: "mismatch", detail: "Transaction destination does not match the ETC wallet.", toAddress: to };
  }
  const wei = BigInt(tx.value || "0");
  const observed = Number(wei) / 1e18;
  return { ok: true, observedAmount: observed.toFixed(6), toAddress: to, confirmations: 1 };
}

async function verifySol(txid: string, expectedAddress: string): Promise<VerifyResult> {
  const { status, json } = await fetchJson("https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [txid, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
    }),
  });
  if (status >= 400 || !json || typeof json !== "object") {
    return { ok: false, reason: "error", detail: "Solana RPC unavailable." };
  }
  const body = json as { result?: { meta?: { postTokenBalances?: unknown; postBalances?: number[] }; transaction?: { message?: { accountKeys?: Array<string | { pubkey?: string }> } } } | null; error?: unknown };
  if (!body.result) return { ok: false, reason: "not_found", detail: "Transaction not found on Solana." };
  const keys = (body.result.transaction?.message?.accountKeys ?? []).map((k) => (typeof k === "string" ? k : k.pubkey || ""));
  const idx = keys.findIndex((k) => k === expectedAddress);
  if (idx < 0) {
    return { ok: false, reason: "mismatch", detail: "Configured SOL address is not in this transaction.", toAddress: expectedAddress };
  }
  const post = body.result.meta?.postBalances?.[idx] ?? 0;
  // Native SOL received ≈ post balance; we also look at pre to compute delta.
  const pre = (body.result as { meta?: { preBalances?: number[] } }).meta?.preBalances?.[idx] ?? 0;
  const lamports = Math.max(0, post - pre);
  return { ok: true, observedAmount: (lamports / 1e9).toFixed(9), toAddress: expectedAddress, confirmations: 1 };
}

async function verifyTron(txid: string, expectedAddress: string): Promise<VerifyResult> {
  const { status, json } = await fetchJson("https://api.trongrid.io/wallet/gettransactionbyid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: txid }),
  });
  if (status >= 400 || !json || typeof json !== "object") {
    return { ok: false, reason: "error", detail: "TRON API unavailable." };
  }
  const tx = json as {
    txID?: string;
    raw_data?: {
      contract?: Array<{
        parameter?: { value?: { amount?: number; to_address?: string; owner_address?: string } };
        type?: string;
      }>;
    };
  };
  if (!tx.txID) return { ok: false, reason: "not_found", detail: "Transaction not found on TRON." };
  const contracts = tx.raw_data?.contract ?? [];
  let sun = 0;
  let toHex = "";
  for (const c of contracts) {
    const v = c.parameter?.value;
    if (!v) continue;
    if (typeof v.amount === "number") sun += v.amount;
    if (v.to_address) toHex = v.to_address;
  }
  const match = addressesMatch("tron", expectedAddress, toHex);
  if (!match) {
    return { ok: false, reason: "mismatch", detail: "Transaction destination does not match the TRON wallet.", toAddress: tronHexToBase58(toHex) || toHex };
  }
  return { ok: true, observedAmount: (sun / 1e6).toFixed(6), toAddress: expectedAddress, confirmations: 1 };
}


export async function verifyChainPayment(opts: {
  chain: Chain;
  txid: string;
  expectedAddress: string;
  expectedAmount: string;
  minConfirmations: number;
}): Promise<VerifyResult> {
  const txid = normalizeTxid(opts.chain, opts.txid);
  if (!txid) return { ok: false, reason: "mismatch", detail: "Transaction ID format is invalid for this chain." };
  const address = opts.expectedAddress.trim();
  if (!address) return { ok: false, reason: "error", detail: "No wallet configured for this chain." };

  let result: VerifyResult;
  try {
    if (opts.chain === "btc") result = await verifyBtc(txid, address);
    else if (opts.chain === "etc") result = await verifyEtc(txid, address);
    else if (opts.chain === "sol") result = await verifySol(txid, address);
    else result = await verifyTron(txid, address);
  } catch (err) {
    return { ok: false, reason: "error", detail: err instanceof Error ? err.message : "Chain lookup failed." };
  }

  if (!result.ok) return result;
  if (opts.minConfirmations > 0 && result.confirmations < opts.minConfirmations) {
    return { ok: false, reason: "unconfirmed", detail: "Transaction is not yet confirmed.", observedAmount: result.observedAmount, toAddress: result.toAddress };
  }
  if (!amountCovers(opts.expectedAmount, result.observedAmount)) {
    return {
      ok: false,
      reason: "mismatch",
      detail: `Amount ${result.observedAmount} is below the quoted ${opts.expectedAmount}.`,
      observedAmount: result.observedAmount,
      toAddress: result.toAddress,
    };
  }
  return result;
}

export async function fetchUsdRates(): Promise<Record<string, number>> {
  const { status, json } = await fetchJson(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum-classic,solana,tron&vs_currencies=usd",
  );
  if (status >= 400 || !json || typeof json !== "object") {
    throw new Error("FX provider unavailable");
  }
  const body = json as Record<string, { usd?: number }>;
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(body)) {
    if (v && typeof v.usd === "number" && v.usd > 0) out[id] = v.usd;
  }
  if (Object.keys(out).length === 0) throw new Error("FX provider returned empty rates");
  return out;
}
