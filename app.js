/**
 * Blogger Static Website Core Application Logic
 * Powered by Vanilla JS & Web Audio API
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    config: null,
    articles: [],
    currentArticleSlug: null,
    isStreamLive: false,
    liveVideoId: null,
    audioContext: null,
    checkIntervalId: null,
    isSimulating: false
  };

  // DOM Elements
  const els = {
    bloggerName: document.getElementById('bloggerName'),
    bloggerBio: document.getElementById('bloggerBio'),
    socialGrid: document.getElementById('socialGrid'),
    articlesList: document.getElementById('articlesList'),
    homeView: document.getElementById('homeView'),
    articleView: document.getElementById('articleView'),
    articleContent: document.getElementById('articleContent'),
    articleDate: document.getElementById('articleDate'),
    articleTags: document.getElementById('articleTags'),
    progressBar: document.getElementById('progressBar'),
    mainContent: document.getElementById('mainContent'),
    
    // Live Alerts
    liveAlert: document.getElementById('liveAlert'),
    youtubeIframe: document.getElementById('youtubeIframe'),
    btnWatchLive: document.getElementById('btnWatchLive'),
    btnCloseAlert: document.getElementById('btnCloseAlert'),
    profileLiveRing: document.getElementById('profileLiveRing'),
    mobileLiveIndicator: document.getElementById('mobileLiveIndicator'),
    inlinePlayerContainer: document.getElementById('inlinePlayerContainer'),
    
    // Sidebar Mobile
    sidebar: document.getElementById('sidebar'),
    btnToggleSidebar: document.getElementById('btnToggleSidebar'),
    btnCloseSidebar: document.getElementById('btnCloseSidebar'),
    
    // Debug Panel
    debugPanel: document.getElementById('debugPanel'),
    btnToggleDebug: document.getElementById('btnToggleDebug'),
    btnSimulateStream: document.getElementById('btnSimulateStream'),
    
    // Background Collage Container
    splitBgContainer: document.querySelector('.split-bg-container')
  };

  /* ==========================================================================
     WEB AUDIO API - MINIMALIST NOTIFICATION PING
     ========================================================================== */
  function playLiveSound() {
    try {
      if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const ctx = state.audioContext;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Simple, elegant double high-ping (similar to clean device alert sounds)
      const chimeOsc = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      
      chimeOsc.type = 'sine';
      chimeOsc.frequency.setValueAtTime(587.33, now); // D5
      chimeOsc.frequency.setValueAtTime(880.00, now + 0.08); // A5 (quick high note)

      chimeGain.gain.setValueAtTime(0.001, now);
      chimeGain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      chimeOsc.connect(chimeGain);
      chimeGain.connect(ctx.destination);

      chimeOsc.start(now);
      chimeOsc.stop(now + 0.35);

      console.log('🔊 Minimal live notification sound played.');
    } catch (e) {
      console.warn('Audio play block:', e);
    }
  }

  /* ==========================================================================
     DATA FETCHING & RENDERING
     ========================================================================== */
  async function loadConfig() {
    try {
      const response = await fetch('config.json?t=' + Date.now());
      state.config = await response.json();
      renderConfig();
      startLiveStreamChecker();
    } catch (error) {
      console.error('Error loading config:', error);
      els.bloggerBio.textContent = 'Ошибка загрузки описания блога.';
    }
  }

  function renderConfig() {
    if (!state.config) return;
    els.bloggerName.textContent = state.config.bloggerName;
    els.bloggerBio.textContent = state.config.bio;

    // Render Social Cards Grid (Clean layout, no gradients/shadows)
    els.socialGrid.innerHTML = state.config.socialLinks.map(link => {
      let iconPrefix = 'fab';
      if (link.icon === 'paper-plane' || link.icon === 'hand-holding-usd' || link.icon === 'credit-card' || link.icon === 'heart') {
        iconPrefix = 'fas';
      }

      const isModal = link.url === '#requisites';
      const hrefAttr = isModal ? `href="javascript:void(0)" onclick="showRequisitesModal()"` : `href="${link.url}" target="_blank"`;

      return `
        <a ${hrefAttr} class="social-card" 
           style="border-color: ${link.borderColor || 'var(--border-color)'}"
           id="social-${link.name.toLowerCase().replace(/[^a-zа-яё]/gi, '')}">
          <div class="social-icon-wrapper" style="color: ${link.borderColor}">
            <i class="${iconPrefix} fa-${link.icon}"></i>
          </div>
          <div class="social-info">
            <h3 class="social-name">${link.name}</h3>
            <p class="social-desc">${link.description}</p>
          </div>
        </a>
      `;
    }).join('');
  }

  /* ==========================================================================
     MODALS
     ========================================================================== */
  window.showRequisitesModal = () => {
    const modal = document.getElementById('requisitesModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  };

  window.closeRequisitesModal = () => {
    const modal = document.getElementById('requisitesModal');
    if (modal) {
      modal.classList.add('hidden');
      setTimeout(() => {
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }, 300);
    }
  };

  async function loadArticles() {
    try {
      const response = await fetch('articles.json?t=' + Date.now());
      state.articles = await response.json();
      renderArticlesList();
      // Trigger routing now that articles metadata is ready
      handleRoute();
    } catch (error) {
      console.error('Error loading articles list:', error);
      els.articlesList.innerHTML = '<div class="loading-placeholder">Ошибка загрузки статей.</div>';
    }
  }

  function renderArticlesList() {
    if (state.articles.length === 0) {
      els.articlesList.innerHTML = '<div class="loading-placeholder">Статей пока нет.</div>';
      return;
    }

    els.articlesList.innerHTML = state.articles.map(article => {
      const tagsHtml = article.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('');
      // Clean display date format (e.g. 16.06.2026)
      const dateParts = article.date.split('-');
      const displayDate = dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}` : article.date;

      return `
        <a href="#article/${article.slug}" class="article-item" id="sidebar-item-${article.slug}">
          <h4 class="article-item-title">${article.title}</h4>
          <div class="article-item-meta">
            <span class="article-item-date">${displayDate}</span>
            <div class="article-item-tags">${tagsHtml}</div>
          </div>
        </a>
      `;
    }).join('');
  }

  async function renderArticle(slug) {
    const article = state.articles.find(a => a.slug === slug);
    if (!article) {
      showErrorArticle();
      return;
    }

    // Set reading progress to 0 initially
    els.progressBar.style.width = '0%';
    els.articleContent.innerHTML = '<div class="loading-placeholder">Загрузка контента статьи...</div>';

    // Highlight active article in sidebar
    document.querySelectorAll('.article-item').forEach(item => item.classList.remove('active'));
    const sidebarItem = document.getElementById(`sidebar-item-${slug}`);
    if (sidebarItem) sidebarItem.classList.add('active');

    try {
      const response = await fetch(`articles/${slug}.md`);
      if (!response.ok) throw new Error('File not found');
      const markdownText = await response.text();
      
      // Parse markdown content
      els.articleContent.innerHTML = marked.parse(markdownText);
      
      // Render meta info
      const dateParts = article.date.split('-');
      els.articleDate.innerHTML = `<i class="far fa-calendar-alt"></i> ${dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}` : article.date}`;
      els.articleTags.innerHTML = article.tags.map(t => `<span class="tag-pill">${t}</span>`).join(' ');

      // Scroll main content to top
      els.mainContent.scrollTop = 0;
    } catch (error) {
      console.error('Error fetching article markdown:', error);
      els.articleContent.innerHTML = `
        <h2>Ошибка загрузки статьи</h2>
        <p>Не удалось загрузить файл статьи. Возможно, файл <code>articles/${slug}.md</code> отсутствует или переименован.</p>
        <a href="#home" class="btn btn-secondary mt-4">Вернуться на главную</a>
      `;
    }
  }

  function showErrorArticle() {
    els.articleContent.innerHTML = `
      <h2>Статья не найдена</h2>
      <p>К сожалению, запрашиваемая статья не существует или была перемещена.</p>
      <a href="#home" class="btn btn-secondary mt-4">На главную</a>
    `;
    els.articleDate.textContent = '';
    els.articleTags.innerHTML = '';
  }

  /* ==========================================================================
     ROUTING SYSTEM (URL HASH-BASED)
     ========================================================================= */
  function handleRoute() {
    const hash = window.location.hash || '#home';
    
    // Close sidebar on mobile route change
    els.sidebar.classList.remove('active');

    if (hash === '#home') {
      state.currentArticleSlug = null;
      els.articleView.classList.remove('active');
      els.homeView.classList.add('active');
      
      if (els.splitBgContainer) els.splitBgContainer.classList.remove('hidden'); // Show collage
      
      els.progressBar.style.width = '0%';
      document.title = 'Блог Волшебника-73';
      
      // Remove active states in sidebar
      document.querySelectorAll('.article-item').forEach(item => item.classList.remove('active'));
    } else if (hash.startsWith('#article/')) {
      const slug = hash.replace('#article/', '');
      state.currentArticleSlug = slug;
      
      els.homeView.classList.remove('active');
      els.articleView.classList.add('active');
      
      if (els.splitBgContainer) els.splitBgContainer.classList.add('hidden'); // Hide collage

      
      const article = state.articles.find(a => a.slug === slug);
      if (article) {
        document.title = `${article.title} | Волшебника-73`;
      }
      
      renderArticle(slug);
    }
  }

  // Reading progress scroll listener
  els.mainContent.addEventListener('scroll', () => {
    if (!state.currentArticleSlug) return;
    
    const scrollTop = els.mainContent.scrollTop;
    const scrollHeight = els.mainContent.scrollHeight - els.mainContent.clientHeight;
    
    if (scrollHeight > 0) {
      const percentage = (scrollTop / scrollHeight) * 100;
      els.progressBar.style.width = `${percentage}%`;
    }
  });

  window.addEventListener('hashchange', handleRoute);

  /* ==========================================================================
     YOUTUBE LIVE STREAM AUTO-CHECKER (RSS METHOD)
     ========================================================================== */
  async function checkYouTubeLive() {
    if (state.isSimulating) return; // Skip API checks during manual simulation
    if (!state.config || !state.config.youtubeChannelId) return;

    const channelId = state.config.youtubeChannelId;
    // We use rss2json to reliably parse the YouTube RSS feed without CORS errors
    const rssUrl = encodeURIComponent(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`;

    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('RSS fetch failed');
      const data = await response.json();

      if (data.status === 'ok' && data.items && data.items.length > 0) {
        const latestVideo = data.items[0];
        const title = latestVideo.title.toLowerCase();
        
        // Detect live streams based on typical keywords in title (accounting for Russian cases)
        const liveKeywords = ['прямой эфир', 'прямом эфире', 'live', 'стрим', 'трансляция'];
        const isLive = liveKeywords.some(keyword => title.includes(keyword));
        
        if (isLive) {
          // Extract video ID from watch URL
          const videoIdMatch = latestVideo.link.match(/v=([^&]+)/);
          if (videoIdMatch) {
            setStreamLive(true, videoIdMatch[1]);
            return;
          }
        }
      }
      // If we reach here, it's either not live or not matching keywords
      setStreamLive(false);
    } catch (error) {
      console.warn('Could not auto-detect live stream status via RSS:', error);
      // Fail silently, keep current state.
    }
  }

  function setStreamLive(isLive, videoId = null) {
    if (isLive && videoId !== state.liveVideoId) {
      state.isStreamLive = true;
      state.liveVideoId = videoId;
      
      // Update inline iframe source
      els.youtubeIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
      
      // Show inline player
      if (els.inlinePlayerContainer) els.inlinePlayerContainer.classList.remove('hidden');
      
      // Show alert
      els.liveAlert.classList.remove('hidden');
      els.profileLiveRing.classList.add('active');
      els.mobileLiveIndicator.classList.remove('hidden');
      
      playLiveSound();
    } else if (!isLive) {
      state.isStreamLive = false;
      state.liveVideoId = null;
      
      // Hide inline player
      if (els.inlinePlayerContainer) els.inlinePlayerContainer.classList.add('hidden');
      els.youtubeIframe.src = '';
      
      // Hide alert elements
      els.liveAlert.classList.add('hidden');
      els.profileLiveRing.classList.remove('active');
      els.mobileLiveIndicator.classList.add('hidden');
    }
  }

  function startLiveStreamChecker() {
    // Check immediately
    checkYouTubeLive();
    
    // Set interval check
    const interval = state.config.checkIntervalMs || 60000;
    state.checkIntervalId = setInterval(checkYouTubeLive, interval);
  }

  /* ==========================================================================
     INLINE PLAYER ACTIONS
     ========================================================================== */
  const scrollToPlayer = () => {
    // Navigate to home if currently viewing an article
    if (window.location.hash !== '' && window.location.hash !== '#home') {
      window.location.hash = '#home';
      // Give it a tiny delay to render before scrolling
      setTimeout(() => {
        if (els.inlinePlayerContainer) {
          els.inlinePlayerContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } else {
      // Already on home view
      if (els.inlinePlayerContainer) {
        els.inlinePlayerContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  /* ==========================================================================
     INTERACTIVE COMPONENT LISTENERS
     ========================================================================== */
  // Live Alert Handlers
  els.btnCloseAlert.addEventListener('click', () => {
    els.liveAlert.classList.add('hidden');
  });

  els.btnWatchLive.addEventListener('click', scrollToPlayer);

  // Mobile Menu Controls
  els.btnToggleSidebar.addEventListener('click', () => {
    els.sidebar.classList.add('active');
  });

  els.btnCloseSidebar.addEventListener('click', () => {
    els.sidebar.classList.remove('active');
  });

  /* ==========================================================================
     DEBUG PANEL CONTROLS
     ========================================================================== */
  els.btnToggleDebug.addEventListener('click', () => {
    const isCollapsed = els.debugPanel.classList.toggle('collapsed');
    els.btnToggleDebug.innerHTML = isCollapsed ? 
      '<i class="fas fa-chevron-up"></i>' : 
      '<i class="fas fa-chevron-down"></i>';
  });

  els.btnSimulateStream.addEventListener('click', () => {
    if (state.isSimulating) {
      // Turn off simulation
      state.isSimulating = false;
      els.btnSimulateStream.textContent = 'Включить симуляцию';
      els.btnSimulateStream.classList.remove('btn-secondary');
      els.btnSimulateStream.classList.add('btn-success');
      setStreamLive(false);
    } else {
      // Turn on simulation
      state.isSimulating = true;
      els.btnSimulateStream.textContent = 'Выключить симуляцию';
      els.btnSimulateStream.classList.remove('btn-success');
      els.btnSimulateStream.classList.add('btn-secondary');
      
      // Simulate live stream with Rick Astley for instant testing
      setStreamLive(true, 'dQw4w9WgXcQ');
    }
  });

  // Collapse debug panel on load to keep it tidy
  els.debugPanel.classList.add('collapsed');

  // Initialize
  loadConfig();
  loadArticles();
});
