(() => {
  const REPO = "Engazan/KimaiTray";

  // Detect the visitor's OS to highlight the matching download.
  const ua = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.userAgent;
  const os = /mac|iphone|ipad/i.test(ua) ? "mac" : /win/i.test(ua) ? "win" : /linux|x11|cros/i.test(ua) ? "linux" : null;
  const osLabel = { mac: "macOS", win: "Windows", linux: "Linux" };
  const heroAsset = { mac: "dmg", win: "exe", linux: "appimage" };

  if (os) {
    document.getElementById("hero-download-label").textContent = `Download for ${osLabel[os]}`;
    document.querySelector(`.dl-card[data-os="${os}"]`)?.classList.add("is-current");
  }

  // Resolve direct asset links from the latest GitHub release; links fall back to the releases page.
  const matchers = {
    dmg: (n) => n.endsWith(".dmg"),
    exe: (n) => n.endsWith("-setup.exe"),
    msi: (n) => n.endsWith(".msi"),
    appimage: (n) => n.endsWith(".AppImage"),
    deb: (n) => n.endsWith(".deb"),
    rpm: (n) => n.endsWith(".rpm"),
  };

  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((release) => {
      const assets = release.assets || [];
      const urlFor = (key) => assets.find((a) => matchers[key](a.name))?.browser_download_url;

      document.querySelectorAll("[data-version]").forEach((el) => (el.textContent = release.tag_name));
      document.querySelectorAll("[data-asset]").forEach((a) => {
        const url = urlFor(a.dataset.asset);
        if (url) { a.href = url; a.removeAttribute("target"); }
      });
      const heroUrl = os && urlFor(heroAsset[os]);
      if (heroUrl) {
        const hero = document.getElementById("hero-download");
        hero.href = heroUrl;
        hero.removeAttribute("target");
      }
    })
    .catch(() => {});

  // Ticking timer badge in the hero.
  const ticker = document.getElementById("ticker");
  let seconds = 2 * 3600 + 14 * 60 + 7;
  const pad = (n) => String(n).padStart(2, "0");
  const render = () => {
    ticker.textContent = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  };
  render();
  setInterval(() => { seconds++; render(); }, 1000);

  // Cursor-following glow on feature cards.
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  // Reveal on scroll.
  const targets = document.querySelectorAll(".section-head, .card, .split > *, .wide-shot, .dl-card, .strip");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    targets.forEach((el) => { el.classList.add("reveal"); io.observe(el); });
  }
})();
