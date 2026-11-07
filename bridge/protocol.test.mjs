import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFrame } from "./protocol.mjs";

test("reads the browser's 320x240 RGBA frame", () => {
  const frame = Buffer.alloc(4 + 320 * 240 * 4);
  frame.writeUInt16LE(320, 0);
  frame.writeUInt16LE(240, 2);
  const decoded = decodeFrame(frame);
  assert.equal(decoded?.width, 320);
  assert.equal(decoded?.height, 240);
  assert.equal(decoded?.pixels.length, 320 * 240 * 4);
});
test("rejects short, empty, truncated and oversized frames", () => {
  for (const frame of [Buffer.alloc(0), Buffer.alloc(3), Buffer.alloc(4)]) {
    assert.equal(decodeFrame(frame), null);
  }
  const truncated = Buffer.alloc(8);
  truncated.writeUInt16LE(320, 0);
  truncated.writeUInt16LE(240, 2);
  assert.equal(decodeFrame(truncated), null);
  const oversized = Buffer.alloc(4);
  oversized.writeUInt16LE(1921, 0);
  oversized.writeUInt16LE(1081, 2);
  assert.equal(decodeFrame(oversized), null);
});