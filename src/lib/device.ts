export type DeviceMode = "mobile" | "desktop";

const STORAGE_KEY = "fireprom-device-mode";

export function isWeakDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua);
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as any).deviceMemory ?? 4;
  return isMobile || cores <= 4 || mem <= 4;
}

export function detectDevice(): DeviceMode {
  if (typeof navigator === "undefined") return "desktop";
  const isMobile = isWeakDevice();
  const narrow = typeof window !== "undefined" && window.innerWidth < 900;
  return isMobile || narrow ? "mobile" : "desktop";
}

export function loadMode(): DeviceMode {
  if (typeof localStorage === "undefined") return detectDevice();
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "mobile" || saved === "desktop") return saved;
  return detectDevice();
}

export function saveMode(mode: DeviceMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* noop */
  }
}
