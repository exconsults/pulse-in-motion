/** Reject malformed or oversized frames before entering the native SDK. */
export function decodeFrame(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  const width = buffer.readUInt16LE(0);
  const height = buffer.readUInt16LE(2);
  if (!width || !height || width > 1920 || height > 1080) return null;
  if (buffer.length !== 4 + width * height * 4) return null;
  return { width, height, pixels: buffer.subarray(4) };
}