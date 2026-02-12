// extension/yt_ui_cleanup.ts
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
      nodes.forEach((el) => {
        el.style.display = "none";
      });
    }
  });
  observer.observe(player, {
    childList: true,
    subtree: true
  });
  setTimeout(() => {
    observer.disconnect();
  }, 1e4);
}
setTimeout(initUiCleanup, 1500);
