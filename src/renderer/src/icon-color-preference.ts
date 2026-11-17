import { type AvatarColor, isAvatarColor } from "@openbot/contracts/ipc";
import { createSignal } from "solid-js";

const ICON_COLOR_STORAGE_KEY = "openbot:icon-color";
const ICON_COLOR_PROPERTY = "--openbot-icon-color";
const ICON_COLOR_ATTRIBUTE = "data-openbot-icon-color";

/** The choice for this page after the browser did not save it. It wins over an older saved value. */
let unsavedPreference: AvatarColor | null | undefined;

/**
 * The colour of the neutral icons, on this device: null keeps the theme's colours. Reading
 * `window.localStorage` throws when the browser blocks storage, so it is read inside the guard.
 */
function readIconColor(): AvatarColor | null {
  if (unsavedPreference !== undefined) return unsavedPreference;
  try {
    const value = window.localStorage.getItem(ICON_COLOR_STORAGE_KEY);
    return isAvatarColor(value) ? value : null;
  } catch {
    return null;
  }
}

function writeIconColor(color: AvatarColor | null): void {
  try {
    if (color === null) window.localStorage.removeItem(ICON_COLOR_STORAGE_KEY);
    else window.localStorage.setItem(ICON_COLOR_STORAGE_KEY, color);
    unsavedPreference = undefined;
  } catch {
    // Blocked or full storage keeps the choice for this page only.
    unsavedPreference = color;
  }
}

/** `primitives.css` paints the neutral icons only while the root has the attribute. */
function applyIconColor(color: AvatarColor | null): void {
  const root = document.documentElement;
  if (color === null) {
    root.style.removeProperty(ICON_COLOR_PROPERTY);
    root.removeAttribute(ICON_COLOR_ATTRIBUTE);
    return;
  }
  root.style.setProperty(ICON_COLOR_PROPERTY, color);
  root.setAttribute(ICON_COLOR_ATTRIBUTE, "");
}

const [iconColor, setIconColorSignal] = createSignal(readIconColor());

function readStorageIntoSignal(event: StorageEvent): void {
  if (event.key !== null && event.key !== ICON_COLOR_STORAGE_KEY) return;
  const color = readIconColor();
  setIconColorSignal(color);
  applyIconColor(color);
}

if (typeof window !== "undefined") {
  // Another window saved a change. One registration per page: addEventListener ignores the same
  // listener twice, and HMR disposal removes it when this module is replaced.
  window.addEventListener("storage", readStorageIntoSignal);
  import.meta.hot?.dispose(() => {
    window.removeEventListener("storage", readStorageIntoSignal);
  });
}

/** Paints the saved colour when a window opens. */
export function syncIconColor(): void {
  applyIconColor(iconColor());
}

/** The shared reactive preference: a Settings change reaches every open window at once. */
export function useIconColor(): () => AvatarColor | null {
  return iconColor;
}

export function setIconColor(color: AvatarColor | null): void {
  writeIconColor(color);
  setIconColorSignal(color);
  applyIconColor(color);
}
