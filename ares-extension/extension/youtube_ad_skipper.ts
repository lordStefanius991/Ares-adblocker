// youtube_ad_skipper.ts
export {};

const KEY_ENABLED = "ares_enabled";
const KEY_YT_ADS = "ares_yt_ads";

let adActive = false;
let adHandled = false;
let originalPlaybackRate = 1;
let restoreTimeout: number | null = null;

/* ================================
   SETTINGS
================================ */

async function isEnabled(): Promise<boolean> {
  const data = await chrome.storage.local.get([KEY_ENABLED, KEY_YT_ADS]);
  return data[KEY_ENABLED] !== false && data[KEY_YT_ADS] === true;
}

/* ================================
   AD DETECTION (MINIMA, UFFICIALE)
================================ */

function isAdShowing(): boolean {
  const player = document.getElementById("movie_player");
  return !!player && player.classList.contains("ad-showing");
}

/* ================================
   AD HANDLING (STEALTH)
================================ */

function handleAd() {
  const video = document.querySelector("video");
  if (!video) return;

  originalPlaybackRate = video.playbackRate;

  try {
    video.playbackRate = 12; // prudente, umano
  } catch {}

  tryClickSkip();
}

function tryClickSkip() {
  const delay = 300 + Math.random() * 700;

  setTimeout(() => {
    const btn = document.querySelector(
      ".ytp-ad-skip-button"
    ) as HTMLButtonElement | null;

    if (btn) {
      btn.click();
    }
  }, delay);
}

function scheduleRestore() {
  if (restoreTimeout) return;

  restoreTimeout = window.setTimeout(() => {
    const video = document.querySelector("video");
    if (video) {
      video.playbackRate = originalPlaybackRate || 1;
    }

    adActive = false;
    adHandled = false;
    restoreTimeout = null;
  }, 300 + Math.random() * 400);
}

/* ================================
   MAIN LOOP (LOW FREQUENCY)
================================ */

function checkAd() {
  if (!isAdShowing()) {
    if (adActive) scheduleRestore();
    return;
  }

  if (adHandled) return;

  adActive = true;
  adHandled = true;

  const delay = 500 + Math.random() * 1000;
  setTimeout(handleAd, delay);
}

/* ================================
   INIT
================================ */

async function init() {
  if (!window.location.hostname.includes("youtube.com")) return;

  const enabled = await isEnabled();
  if (!enabled) return;

  // controllo lento e umano
  setInterval(checkAd, 900);
}

init();

/* ================================
   SETTINGS CHANGE
================================ */

// NIENTE reload pagina (red flag)
chrome.storage.onChanged.addListener((changes) => {
  if (changes[KEY_ENABLED] || changes[KEY_YT_ADS]) {
    adActive = false;
    adHandled = false;
  }
});
