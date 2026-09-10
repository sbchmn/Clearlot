import assert from "node:assert/strict";
import test from "node:test";
import {
  amountCovers,
  normalizeTxid,
  quoteNative,
  addressesMatch,
  tronHexToBase58,
  tronBase58ToHex,
  tronAddressKey,
} from "./server/crypto.ts";

test("normalize btc txid", () => {
  const id = "a".repeat(64);
  assert.equal(normalizeTxid("btc", id), id);
  assert.equal(normalizeTxid("btc", "zz"), null);
});

test("normalize etc txid adds 0x", () => {
  const id = "ab".repeat(32);
  assert.equal(normalizeTxid("etc", id), `0x${id}`);
});

test("amount covers with tolerance", () => {
  assert.equal(amountCovers("1.00000000", "1.00000000"), true);
  assert.equal(amountCovers("1.00000000", "0.99800000"), true);
  assert.equal(amountCovers("1.00000000", "0.99000000"), false);
});

test("quote native btc", () => {
  const q = quoteNative(10000, 100000, 8); // $100 at $100k/BTC
  assert.equal(q, "0.00100000");
});

test("etc addresses match case-insensitively", () => {
  assert.equal(
    addressesMatch("etc", "0xABC", "0xabc"),
    true,
  );
});

test("tron base58 round-trips the zero address", () => {
  const hex = "410000000000000000000000000000000000000000";
  const b58 = tronHexToBase58(hex);
  assert.equal(b58, "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");
  assert.equal(tronBase58ToHex(b58!), hex);
  assert.equal(tronAddressKey(b58!), hex);
  assert.equal(addressesMatch("tron", b58!, hex), true);
  assert.equal(addressesMatch("tron", b58!, "0x" + hex), true);
});
