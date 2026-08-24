export const VENDOR_STORE_ANCHOR = 'xk.createRoot(document.getElementById("root"))';

const STORE_BRIDGE_SOURCE = [
  "window.__LAYOUT_TOOLS_STORE__=He;",
  'window.dispatchEvent(new CustomEvent("layouttools:store-ready"));',
].join("");

export function injectVendorStoreBridge(source) {
  const parts = source.split(VENDOR_STORE_ANCHOR);
  if (parts.length !== 2) {
    throw new Error(
      `LayoutTools vendor compatibility anchor must occur exactly once; found ${parts.length - 1}.`,
    );
  }

  return `${parts[0]}${STORE_BRIDGE_SOURCE}${VENDOR_STORE_ANCHOR}${parts[1]}`;
}
