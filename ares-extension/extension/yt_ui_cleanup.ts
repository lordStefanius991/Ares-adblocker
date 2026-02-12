// yt_ui_cleanup.ts
export {};

function initUiCleanup() {
  const player = document.getElementById("movie_player");
  if (!player) {
    return;
  }

  const SAFE_SELECTORS = [
    ".ytp-ad-overlay-container",
    ".ytp-ad-text",
    ".ytp-ad-simple-ad-badge",
    ".ytp-ad-image-overlay"
  ];

  const observer = new MutationObserver(() => {
    for (const selector of SAFE_SELECTORS) {
      const nodes = player.querySelectorAll(selector);
      nodes.forEach(el => {
        (el as HTMLElement).style.display = "none";
      });
    }
  });

  observer.observe(player, {
    childList: true,
    subtree: true
  });

  // stop osserving dopo un po’ (comportamento umano)
  setTimeout(() => {
    observer.disconnect();
  }, 10_000);
}

// ⚠️ NOTA CRITICA:
// A TOP LEVEL NON DEVE ESISTERE *NESSUN* return
setTimeout(initUiCleanup, 1500);
