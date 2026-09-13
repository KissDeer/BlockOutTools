/**
 * FNV-1a：同步、确定、跨浏览器与 Node 一致。
 * 用于"内容有没有变"的指纹，不是安全哈希，所以不需要异步的 SubtleCrypto。
 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
