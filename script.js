/* ============================================================
   Alok Systems Tools — Application
   ============================================================ */

/* ---------- Category icon set (inline SVGs, stroke style) ---------- */
const CATEGORY_ICONS = {
  all: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
  "Developer Tools":
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>',
  Productivity:
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
  "Media Tools":
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
  "AI & Chatbots":
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
  "Finance & Business":
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  "Writing Tools":
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>',
  "Games & Fun":
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>',
  "Document Tools":
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
};

/* Every category that exists in the data gets a tab, so no tool is left without
   a category in the filter bar. The order here controls the display order. */
const CATEGORY_ORDER = [
  "Developer Tools",
  "Productivity",
  "Media Tools",
  "AI & Chatbots",
  "Finance & Business",
];

const DEFAULT_ICON_COLORS = [
  "#7c3aed",
  "#0ea5e9",
  "#0d9488",
  "#f59e0b",
  "#ec4899",
  "#3b82f6",
  "#ef4444",
  "#10b981",
];

/* ---------- Helpers ---------- */
function normalize(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function slugify(category) {
  return category.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and");
}

function colorFor(str) {
  if (!str) return DEFAULT_ICON_COLORS[2];
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
  return DEFAULT_ICON_COLORS[sum % DEFAULT_ICON_COLORS.length];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- Application ---------- */
class ToolsApp {
  constructor() {
    this.projects =
      typeof projectsData !== "undefined" && Array.isArray(projectsData)
        ? projectsData
        : [];
    this.filter = "all";
    this.search = "";
    this.init();
  }

  init() {
    this.cacheDom();
    this.buildCategoryPills();
    this.bindEvents();
    this.setupTheme();
    this.setupHash();
    this.setupCategoryScroll();
    this.applyFilters();
    this.updateToolTotal();
    this.setupNavScroll();
  }

  cacheDom() {
    this.navSearch = document.getElementById("search-input");
    this.pillsEl = document.getElementById("category-pills");
    this.toolsGrid = document.getElementById("tools-grid");
    this.noResults = document.getElementById("no-results");
    this.resultsCount = document.getElementById("results-count");
    this.toolsStatus = document.getElementById("tools-status");
    this.toolsTotal = document.getElementById("tools-total");
    this.themeToggle = document.getElementById("theme-toggle");
    this.menuToggle = document.getElementById("menu-toggle");
    this.nav = document.getElementById("site-nav");
    this.form = document.getElementById("feedback-form");
  }

  buildCategoryPills() {
    const categories = new Set(this.projects.map((p) => p.category));
    const known = CATEGORY_ORDER.filter((c) => categories.has(c));
    const extras = [...categories].filter((c) => !CATEGORY_ORDER.includes(c));
    const ordered = ["all", ...known, ...extras];

    this.pillsEl.innerHTML = ordered
      .map((cat) => {
        const isAll = cat === "all";
        const label = isAll ? "All" : cat;
        const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS["all"];
        const count = isAll
          ? this.projects.length
          : this.projects.filter((p) => p.category === cat).length;
        const active = this.filter === cat ? " is-active" : "";
        return `<button class="category-pill${active}" type="button" data-category="${escapeHtml(cat)}" aria-pressed="${this.filter === cat}">
          ${icon}
          <span>${label}</span>
          <span class="category-pill-count">${count}</span>
        </button>`;
      })
      .join("");
  }

  bindEvents() {
    // Category filter
    this.pillsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".category-pill");
      if (!btn) return;
      this.setFilter(btn.dataset.category);
    });

    // Search
    if (this.navSearch) {
      this.navSearch.addEventListener("input", (e) => {
        this.search = e.target.value;
        this.applyFilters();
      });
    }

    // Keyboard: Ctrl/Cmd + K, and forward slash
    document.addEventListener("keydown", (e) => {
      const input = this.visibleSearchInput();
      const sticky = e.ctrlKey || e.metaKey;

      if (sticky && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (input) input.focus();
        return;
      }

      if (e.key === "/" && document.activeElement === document.body) {
        e.preventDefault();
        if (input) input.focus();
      }
    });

    // Theme toggle
    this.themeToggle.addEventListener("click", () => this.toggleTheme());

    // Mobile menu
    this.menuToggle.addEventListener("click", () => {
      const open = this.nav.classList.toggle("is-open");
      this.menuToggle.setAttribute("aria-expanded", open);
    });
    this.nav.addEventListener("click", (e) => {
      if (e.target.closest(".nav-link")) {
        this.nav.classList.remove("is-open");
        this.menuToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Category bar: arrows + edge auto-slide ---------- */
  setupCategoryScroll() {
    const pills = this.pillsEl;
    const prev = document.getElementById("cat-prev");
    const next = document.getElementById("cat-next");
    if (!pills) return;

    const STEP = 240;

    const update = () => {
      if (!prev || !next) return;
      const maxScroll = pills.scrollWidth - pills.clientWidth;
      const overflow = maxScroll > 4;
      prev.hidden = !overflow || pills.scrollLeft <= 2;
      next.hidden = !overflow || pills.scrollLeft >= maxScroll - 2;
    };

    if (prev) {
      prev.addEventListener("click", () =>
        pills.scrollBy({ left: -STEP, behavior: "smooth" }),
      );
    }
    if (next) {
      next.addEventListener("click", () =>
        pills.scrollBy({ left: STEP, behavior: "smooth" }),
      );
    }

    pills.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    // Slide the remaining categories in when the pointer nears an edge.
    const EDGE = 70;
    const SPEED = 7;
    let dir = 0;
    let rafId = null;

    const tick = () => {
      if (!dir) {
        rafId = null;
        return;
      }
      pills.scrollLeft += dir;
      rafId = requestAnimationFrame(tick);
    };

    const stopAuto = () => {
      dir = 0;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    pills.addEventListener("mousemove", (e) => {
      const rect = pills.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < EDGE) dir = -SPEED;
      else if (x > rect.width - EDGE) dir = SPEED;
      else dir = 0;

      if (dir && rafId === null) rafId = requestAnimationFrame(tick);
      if (!dir) stopAuto();
    });

    pills.addEventListener("mouseleave", stopAuto);

    update();
    window.addEventListener("load", update);
    setTimeout(update, 300);
  }

  setFilter(cat) {
    this.filter = cat;
    this.pillsEl.querySelectorAll(".category-pill").forEach((pill) => {
      const active = pill.dataset.category === cat;
      pill.classList.toggle("is-active", active);
      pill.setAttribute("aria-pressed", active);
    });

    // Preserve deep-linkable filter hash
    if (cat === "all") {
      if (window.location.hash.startsWith("#filter=")) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } else {
      history.replaceState(null, "", `#filter=${encodeURIComponent(slugify(cat))}`);
    }

    this.applyFilters();
  }

  matches(project) {
    const filterMatches =
      this.filter === "all" ||
      normalize(project.category) === normalize(this.filter) ||
      normalize(project.category).includes(normalize(this.filter)) ||
      normalize(this.filter).includes(normalize(project.category));

    if (!filterMatches) return false;

    if (!this.search) return true;

    const query = this.search.toLowerCase();
    const haystack = [
      project.name,
      project.description,
      project.category,
      ...(project.tags || []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  }

  applyFilters() {
    const filtered = this.projects.filter((p) => this.matches(p));
    this.renderTools(filtered);

    this.resultsCount.textContent = `${filtered.length} of ${this.projects.length} tools`;
    this.toolsStatus.textContent =
      this.filter === "all"
        ? "Explore every tool in one place."
        : `Showing tools in ${this.filter}.`;

    this.noResults.hidden = filtered.length > 0;
  }

  renderTools(filtered) {
    this.toolsGrid.innerHTML = filtered.map((p) => this.card(p)).join("");
  }

  card(project) {
    const targetUrl = project.demo || project.repo || "#";
    const glyph = escapeHtml(project.icon || (project.name || "?")[0]);
    const color = project.iconColor || colorFor(project.name);

    return `
      <a class="tool-card" href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener" aria-label="Open ${escapeHtml(project.name)}">
        <div class="tool-card-top">
          <span class="tool-icon" style="background:${color}" aria-hidden="true">${glyph}</span>
          <span class="tool-cat">${escapeHtml(project.category)}</span>
        </div>
        <h3 class="tool-title">${escapeHtml(project.name)}</h3>
        <p class="tool-desc">${escapeHtml(project.description)}</p>
      </a>
    `;
  }

  /* ---------- Theme ---------- */
  setupTheme() {
    const saved = localStorage.getItem("tools-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved === "dark" || (!saved && prefersDark) ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    this.updateMetaTheme(theme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tools-theme", next);
    this.updateMetaTheme(next);
  }

  updateMetaTheme(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0b1120" : "#f8fafc");
  }

  /* ---------- Hash (deep links) ---------- */
  setupHash() {
    const hash = window.location.hash;
    if (!hash.startsWith("#filter=")) return;

    let slug;
    try {
      slug = decodeURIComponent(hash.replace("#filter=", ""));
    } catch (e) {
      return;
    }

    let found = false;

    for (const btn of this.pillsEl.querySelectorAll(".category-pill")) {
      const cat = btn.dataset.category;
      if (slugify(cat) === slug || cat === slug) {
        this.setFilter(cat);
        found = true;
        break;
      }
    }

    if (found) {
      const toolsSection = document.getElementById("tools");
      if (toolsSection) {
        setTimeout(() => {
          toolsSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    }
  }

  /* ---------- Nav scroll animation / highlighting ---------- */
  setupNavScroll() {
    const sections = [
      { id: "tools", link: "tools" },
      { id: "about", link: "about" },
    ];
    const navLinks = document.querySelectorAll(".nav-link");

    const setActive = (name) => {
      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.dataset.nav === name);
      });
    };
    setActive("home");
    navLinks.forEach((l) => {
      if (!l.dataset.nav) {
        const href = l.getAttribute("href") || "";
        if (href.charAt(0) === "#") l.dataset.nav = href.slice(1);
      }
    });

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = window.scrollY;
          let current = "home";
          for (const s of sections) {
            const el = document.getElementById(s.id);
            if (el && el.getBoundingClientRect().top + window.scrollY - 140 <= y) {
              current = s.link;
            }
          }
          setActive(current);
          ticking = false;
        });
      },
      { passive: true },
    );
  }

  /* ---------- Search inputs ---------- */
  visibleSearchInput() {
    if (this.navSearch && this.navSearch.offsetParent !== null) {
      return this.navSearch;
    }
    return null;
  }

  /* ---------- Tool counter ---------- */
  updateToolTotal() {
    const counter = document.getElementById("tools-total");
    if (counter) counter.textContent = this.projects.length;

    const statTools = document.getElementById("stat-tools");
    if (statTools) statTools.textContent = this.projects.length;

    const statCategories = document.getElementById("stat-categories");
    if (statCategories) {
      statCategories.textContent = new Set(
        this.projects.map((p) => p.category),
      ).size;
    }
  }
}

/* ============================================================
   Feedback form — FormSubmit.co (preserved)
   ============================================================ */
const FEEDBACK_ENDPOINT = "https://formsubmit.co/ajax/helloalokmail@gmail.com";

function initFeedbackForm() {
  const form = document.getElementById("feedback-form");
  if (!form) return;

  const stars = document.querySelectorAll(".rating-star");
  const ratingInput = document.getElementById("rating-value");
  const statusBox = document.getElementById("form-status");
  const submitBtn = document.getElementById("feedback-submit");
  const typeInput = document.getElementById("feedback-type-value");
  const typeOptions = document.querySelectorAll(".type-option");

  function setType(value) {
    if (typeInput) typeInput.value = value;
    typeOptions.forEach((option) => {
      const active = option.dataset.value === value;
      option.classList.toggle("is-active", active);
      option.setAttribute("aria-pressed", active);
    });
  }

  typeOptions.forEach((option) => {
    option.addEventListener("click", () => setType(option.dataset.value));
  });

  function setRating(value) {
    ratingInput.value = value;
    stars.forEach((star) => {
      const active = Number(star.dataset.value) <= value;
      star.classList.toggle("is-active", active);
      star.setAttribute("aria-pressed", active);
    });
  }

  stars.forEach((star) => {
    star.setAttribute("aria-pressed", "false");
    star.addEventListener("click", () => setRating(Number(star.dataset.value)));
    star.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setRating(Number(star.dataset.value));
      }
    });
  });

  function setStatus(text, isError) {
    statusBox.hidden = false;
    statusBox.textContent = text;
    statusBox.className = isError
      ? "form-status form-status--error"
      : "form-status form-status--success";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("feedback-name").value.trim();
    const message = document.getElementById("feedback-message").value.trim();
    const type = typeInput.value;
    const rating = ratingInput.value;

    statusBox.hidden = true;
    statusBox.textContent = "";

    if (!message) {
      setStatus("Please tell us what you think in the message box.", true);
      document.getElementById("feedback-message").focus();
      return;
    }

    if (FEEDBACK_ENDPOINT.startsWith("YOUR_")) {
      setStatus(
        "Feedback service is not configured yet. Please email us directly at helloalokmail@gmail.com instead.",
        true,
      );
      return;
    }

    submitBtn.disabled = true;
    const original = submitBtn.innerHTML;
    submitBtn.innerHTML = "Sending...";

    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name,
          rating: `${rating}/5`,
          type,
          message,
          _subject: `Tools Feedback: ${type}`,
          _template: "table",
          _captcha: "false",
        }),
      });
      const data = await res.json();

      if (data.success === "true" || data.success === true) {
        setStatus("Thank you! Your feedback has been sent. We read every message.", false);
        form.reset();
        setRating(0);
        setType("General Feedback");
      } else {
        const detail = data && data.message ? data.message : "Something went wrong.";
        setStatus(`${detail} If it keeps failing, email us at helloalokmail@gmail.com.`, true);
      }
    } catch (error) {
      setStatus("Could not reach the server. Please email us at helloalokmail@gmail.com", true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = original;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  new ToolsApp();
  initFeedbackForm();
});