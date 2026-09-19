class ToolHubManager {
  constructor() {
    this.projects = projectsData;
    this.filteredProjects = [...this.projects];
    this.currentFilter = 'all';
    this.searchTerm = '';
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupTheme();
    this.checkUrlForFilter();
    this.renderProjects();
    this.animateOnScroll();
    this.addHeaderAnimation();
    this.setupNavigation();
  }

  setupEventListeners() {
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', () => this.toggleTheme());

    const searchInput = document.getElementById('search-input');
    const clearSearch = document.getElementById('clear-search');

    searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    clearSearch.addEventListener('click', () => this.clearSearch());

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('role', 'button');
      // initialize aria-pressed
      btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');

      btn.addEventListener('click', (e) => {
        const category = e.currentTarget.dataset.category;
        this.handleFilter(category, e.currentTarget);
      });

      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          btn.click();
        }
      });
    });

    document.querySelectorAll('.filter-btn-mobile').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');

      btn.addEventListener('click', (e) => {
        const category = e.currentTarget.dataset.category;
        this.handleFilter(category, e.currentTarget);
        this.closeMobileFilters();
      });
    });

    const mobileFiltersBtn = document.getElementById('mobile-filters-btn');
    if (mobileFiltersBtn) {
      mobileFiltersBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleMobileFilters();
      });
    }

    document.addEventListener('keydown', (e) => this.handleKeyboard(e));

    window.addEventListener('hashchange', () => this.checkUrlForFilter());
  }

  setupTheme() {
    const savedTheme = localStorage.getItem('tools-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const appliedTheme = (savedTheme === 'dark' || (!savedTheme && prefersDark)) ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', appliedTheme);
    this.updateThemeIcon(appliedTheme === 'dark');
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('tools-theme', newTheme);
    this.updateThemeIcon(newTheme === 'dark');

    document.body.style.transition = 'background-color 0.5s ease, color 0.5s ease';
    setTimeout(() => {
      document.body.style.transition = '';
    }, 500);
  }

  updateThemeIcon(isDark) {
    const themeIcon = document.querySelector('#theme-toggle i');
    const themeLabel = document.querySelector('#theme-toggle .theme-toggle-label');
    if (themeIcon) {
      themeIcon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }
    if (themeLabel) {
      themeLabel.textContent = isDark ? 'Light' : 'Dark';
    }
  }

  handleSearch(term) {
    this.searchTerm = term.toLowerCase();
    const clearBtn = document.getElementById('clear-search');

    if (term) {
      clearBtn.classList.add('visible');
    } else {
      clearBtn.classList.remove('visible');
    }

    this.filterProjects();
  }

  clearSearch() {
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-search');

    searchInput.value = '';
    clearBtn.classList.remove('visible');
    this.searchTerm = '';
    this.filterProjects();
  }

  checkUrlForFilter() {
    const hash = window.location.hash;
    if (!hash.startsWith('#filter=')) {
      return;
    }

    let categorySlug = '';
    try {
      categorySlug = decodeURIComponent(hash.replace('#filter=', ''));
    } catch (error) {
      this.currentFilter = 'all';
      this.filterProjects();
      return;
    }

    let categoryName = 'all';
    const filterButtons = document.querySelectorAll('.filter-btn');

    for (const btn of filterButtons) {
      const datasetCategory = btn.dataset.category;
      const slug = datasetCategory.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'and');
      if (slug === categorySlug || datasetCategory === categorySlug) {
        categoryName = datasetCategory;
        filterButtons.forEach((filterBtn) => filterBtn.classList.remove('active'));
        btn.classList.add('active');
        break;
      }
    }

    this.currentFilter = categoryName;
    this.filterProjects();

    const toolsSection = document.getElementById('tools');
    if (toolsSection) {
      setTimeout(() => {
        const offsetTop = toolsSection.offsetTop - 80;
        window.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }, 100);
    }
  }

  handleFilter(category, btnElement) {
    document.querySelectorAll('.filter-btn, .filter-btn-mobile').forEach((btn) => {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    });
    btnElement.classList.add('active');
    btnElement.setAttribute('aria-pressed', 'true');

    this.currentFilter = category;

    if (category === 'all') {
      if (window.location.hash.startsWith('#filter=')) {
        const cleanUrl = `${window.location.pathname}${window.location.search}`;
        history.replaceState(null, '', cleanUrl);
      }
    } else {
      const slug = category.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'and');
      window.location.hash = `filter=${encodeURIComponent(slug)}`;
    }

    this.filterProjects();
  }

  filterProjects() {
    this.filteredProjects = this.projects.filter((project) => {
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cf = (this.currentFilter || 'all').toString();

      const matchesFilter = cf === 'all' ||
        norm(project.category) === norm(cf) ||
        norm(project.category).includes(norm(cf)) ||
        norm(cf).includes(norm(project.category));

      const matchesSearch = !this.searchTerm ||
        (project.name && project.name.toLowerCase().includes(this.searchTerm)) ||
        (project.description && project.description.toLowerCase().includes(this.searchTerm)) ||
        (Array.isArray(project.tags) && project.tags.some((tag) => tag.toLowerCase().includes(this.searchTerm)));

      return matchesFilter && matchesSearch;
    });

    this.renderProjects();
  }

  renderProjects() {
    const projectsContainer = document.getElementById('projects-grid');

    if (projectsContainer) {
      projectsContainer.innerHTML = this.filteredProjects
        .map((project) => this.createProjectCard(project, { variant: 'grid' }))
        .join('');
    }

    const noResults = document.getElementById('no-results');
    if (noResults) {
      noResults.hidden = this.filteredProjects.length > 0;
    }

    this.animateCards();
  }

  createProjectCard(project, options = {}) {
    const { variant = 'grid', featured = false } = options;
    const cardClasses = ['project-card'];

    if (variant !== 'grid') {
      cardClasses.push(`project-card--${variant}`);
    }

    if (variant === 'spotlight') {
      cardClasses.push('pinned');
    }

    if (featured) {
      cardClasses.push('project-card--featured');
    }

    const targetUrl = project.demo || project.repo || '#';

    let shortDescription = project.description;
    const descriptionLimit = featured ? 155 : variant === 'spotlight' ? 128 : variant === 'recent' ? 102 : 120;

    if (shortDescription.length > descriptionLimit) {
      shortDescription = `${project.description.substring(0, descriptionLimit)}...`;
    }

    const initial = (project.name && project.name.length) ? project.name.charAt(0).toUpperCase() : '?';

    return `
      <a class="${cardClasses.join(' ')}" href="${targetUrl}" target="_blank" rel="noopener" aria-label="Open ${project.name}">
        <div class="project-header">
          <div class="project-icon" style="background: linear-gradient(135deg, ${this.pickColor(project.name)} 0%, ${this.pickColor(project.name, true)} 100%);">
            <span class="icon-initial">${initial}</span>
          </div>
          <div>
            <span class="project-category">${project.category}</span>
            <h3 class="project-title">${project.name}</h3>
          </div>
        </div>

        <p class="project-description">${shortDescription}</p>

        <div class="project-tags">
          ${project.tags.slice(0, 3).map((tag) => `<span class="tag" data-tag="${tag}">${tag}</span>`).join('')}
        </div>

      </a>
    `;
  }

  pickColor(seed, lighten = false) {
    const colors = [
      ['#EF4444','#FCA5A5'],
      ['#F97316','#FDBA74'],
      ['#F59E0B','#FDE68A'],
      ['#10B981','#6EE7B7'],
      ['#06B6D4','#67E8F9'],
      ['#3B82F6','#93C5FD'],
      ['#8B5CF6','#C4B5FD'],
      ['#EC4899','#F9A8D4']
    ];
    if (!seed) return lighten ? colors[3][1] : colors[3][0];
    const sum = seed.split('').reduce((s,c)=>s+c.charCodeAt(0),0);
    const pair = colors[sum % colors.length];
    return lighten ? pair[1] : pair[0];
  }

  handleKeyboard(e) {
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.tagName === 'SELECT' ||
      activeElement.isContentEditable
    );

    if (isTyping) {
      return;
    }

    if (e.key === '/') {
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    }
  }

  animateCards() {
    const cards = document.querySelectorAll('.project-card');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(max-width: 768px)').matches;

    if (reduceMotion) {
      cards.forEach((card) => {
        card.style.opacity = '1';
        card.style.transform = 'none';
        card.style.transition = 'none';
      });
      return;
    }

    cards.forEach((card, index) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(12px)';

      setTimeout(() => {
        card.style.transition = 'opacity 0.42s ease, transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.42s ease, border-color 0.42s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, index * 60);
    });
  }

  animateOnScroll() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate');
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    const animateElements = document.querySelectorAll('.project-card, .hero-content');
    animateElements.forEach((element) => observer.observe(element));
  }

  addHeaderAnimation() {
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) {
      heroTitle.style.opacity = '0';
      heroTitle.style.transform = 'translateY(20px)';

      setTimeout(() => {
        heroTitle.style.transition = 'all 0.8s cubic-bezier(0.22, 0.61, 0.36, 1)';
        heroTitle.style.opacity = '1';
        heroTitle.style.transform = 'translateY(0)';
      }, 300);
    }
  }

  setupNavigation() {
    window.addEventListener('scroll', () => {
      const mainNav = document.querySelector('.main-nav');
      if (!mainNav) {
        return;
      }

      if (window.scrollY > 50) {
        mainNav.classList.add('scrolled');
      } else {
        mainNav.classList.remove('scrolled');
      }
    });

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        if (!targetId || targetId === '#' || targetId.startsWith('#!')) {
          return;
        }
        if (!/^#[A-Za-z][\w-]*$/.test(targetId)) {
          return;
        }

        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          const offsetTop = targetElement.offsetTop - 80;
          window.scrollTo({ top: offsetTop, behavior: 'smooth' });
        }
      });
    });
  }

  toggleMobileFilters() {
    const mobileFilters = document.querySelector('.mobile-filters-dropdown');
    if (mobileFilters) {
      mobileFilters.classList.toggle('active');
    }
  }

  closeMobileFilters() {
    const mobileFilters = document.querySelector('.mobile-filters-dropdown');
    if (mobileFilters) {
      mobileFilters.classList.remove('active');
    }
  }
}

// Initialize the tool hub when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ToolHubManager();
  initFeedbackForm();
});

// FormSubmit.co AJAX endpoint — sends feedback to helloalokmail@gmail.com
const FEEDBACK_ENDPOINT = 'https://formsubmit.co/ajax/helloalokmail@gmail.com';

function initFeedbackForm() {
  const form = document.getElementById('feedback-form');
  if (!form) {
    return;
  }

  const stars = document.querySelectorAll('.rating-star');
  const ratingInput = document.getElementById('rating-value');
  const statusBox = document.getElementById('form-status');
  const submitBtn = document.getElementById('feedback-submit');

  function setRating(value) {
    ratingInput.value = value;
    stars.forEach((star) => {
      star.classList.toggle('active', Number(star.dataset.value) <= value);
      star.setAttribute('aria-pressed', Number(star.dataset.value) <= value ? 'true' : 'false');
    });
  }

  stars.forEach((star) => {
    star.addEventListener('click', () => setRating(Number(star.dataset.value)));
    star.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setRating(Number(star.dataset.value));
      }
    });
    star.setAttribute('aria-pressed', 'false');
  });

  function setStatus(text, isError) {
    statusBox.hidden = false;
    statusBox.textContent = text;
    statusBox.className = isError
      ? 'form-status form-status--error'
      : 'form-status form-status--success';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('feedback-name').value.trim();
    const message = document.getElementById('feedback-message').value.trim();
    const type = document.getElementById('feedback-type').value;
    const rating = ratingInput.value;

    statusBox.hidden = true;
    statusBox.textContent = '';

    if (!message) {
      setStatus('Please tell us what you think in the message box.', true);
      document.getElementById('feedback-message').focus();
      return;
    }

    if (FEEDBACK_ENDPOINT.startsWith('YOUR_')) {
      setStatus(
        'Feedback service is not configured yet. Please email us directly at helloalokmail@gmail.com instead.',
        true,
      );
      return;
    }

    submitBtn.disabled = true;
    const originalHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name,
          rating: `${rating}/5`,
          type,
          message,
          _subject: `Tools Feedback: ${type}`,
          _template: 'table',
          _captcha: 'false',
        }),
      });
      const data = await res.json();

      if (data.success === 'true' || data.success === true) {
        setStatus('Thank you! Your feedback has been sent. We read every message.', false);
        form.reset();
        setRating(0);
      } else {
        setStatus('Something went wrong. Please email us at helloalokmail@gmail.com', true);
      }
    } catch (error) {
      setStatus('Could not reach the server. Please email us at helloalokmail@gmail.com', true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  });
}
