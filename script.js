const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');
const yearTarget = document.querySelector('#current-year');

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    siteNav.classList.toggle('is-open', !expanded);
  });

  siteNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menuToggle.setAttribute('aria-expanded', 'false');
      siteNav.classList.remove('is-open');
    });
  });
}

if (yearTarget) {
  yearTarget.textContent = new Date().getFullYear();
}

const isResearchLink = (href) => {
  if (!href || href.startsWith('#')) {
    return false;
  }

  try {
    const url = new URL(href, window.location.href);
    return url.pathname.endsWith('/research.html');
  } catch (error) {
    return false;
  }
};

const ensureConsentModal = () => {
  const existing = document.querySelector('#research-consent-modal');
  if (existing) {
    return existing;
  }

  const hasResearchLinks = Array.from(document.querySelectorAll('a[href]'))
    .some((link) => isResearchLink(link.getAttribute('href')));

  if (!hasResearchLinks || !document.body) {
    return null;
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="consent-modal" id="research-consent-modal" aria-hidden="true">
      <div class="consent-modal__backdrop" data-consent-close></div>
      <section class="consent-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="research-consent-title" aria-describedby="research-consent-text">
        <div class="consent-modal__brand">
          <span class="consent-modal__brand-mark" aria-hidden="true"></span>
          <p class="consent-modal__brand-name">空と水と大地合同会社</p>
        </div>
        <h2 id="research-consent-title">研究情報ページの閲覧について</h2>
        <p id="research-consent-text">
          こちらのページに掲載している情報および資料は、消費者の方向けではありません。
          医療関係者・健康食品・化粧品に関わる技術者・メーカー関係者等専用ページとなります。
          ページ内の情報は製品自体の効果効能をうたうものではございませんので、同意された方のみご覧ください。
        </p>
        <div class="consent-modal__actions">
          <button class="consent-modal__btn consent-modal__btn--agree" type="button" id="research-consent-agree">同意する</button>
          <button class="consent-modal__btn consent-modal__btn--decline" type="button" id="research-consent-decline">同意しない</button>
        </div>
      </section>
    </div>
  `);

  return document.querySelector('#research-consent-modal');
};

const consentModal = ensureConsentModal();

if (consentModal) {
  const agreeButton = consentModal.querySelector('#research-consent-agree');
  const declineButton = consentModal.querySelector('#research-consent-decline');
  const closeTargets = consentModal.querySelectorAll('[data-consent-close]');
  const researchLinks = Array.from(document.querySelectorAll('a[href]'))
    .filter((link) => isResearchLink(link.getAttribute('href')));
  let pendingResearchUrl = null;

  const closeModal = () => {
    consentModal.classList.remove('is-open');
    consentModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('consent-modal-open');
    pendingResearchUrl = null;
  };

  const openModal = (url) => {
    pendingResearchUrl = url;
    consentModal.classList.add('is-open');
    consentModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('consent-modal-open');
    if (agreeButton) {
      agreeButton.focus();
    }
  };

  researchLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();
      openModal(link.href);
    });
  });

  closeTargets.forEach((target) => {
    target.addEventListener('click', closeModal);
  });

  if (declineButton) {
    declineButton.addEventListener('click', closeModal);
  }

  if (agreeButton) {
    agreeButton.addEventListener('click', () => {
      if (!pendingResearchUrl) {
        closeModal();
        return;
      }

      const nextUrl = pendingResearchUrl;
      closeModal();
      window.location.href = nextUrl;
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && consentModal.classList.contains('is-open')) {
      closeModal();
    }
  });
}

const heroSection = document.querySelector('.hero');

if (heroSection) {
  let ticking = false;
  let maxHeight = 0;
  let minHeight = 0;

  const recalcHeroRange = () => {
    const viewportBasedMax = Math.min(window.innerHeight * 0.92, 880);
    maxHeight = Math.max(viewportBasedMax, 460);
    minHeight = Math.max(Math.min(maxHeight * 0.58, 560), 320);
  };

  const applyHeroHeight = () => {
    const scrollRange = Math.max(maxHeight - minHeight, 1);
    const progress = Math.min(window.scrollY / scrollRange, 1);
    const nextHeight = maxHeight - (maxHeight - minHeight) * progress;
    heroSection.style.minHeight = `${nextHeight}px`;
    ticking = false;
  };

  const onScroll = () => {
    if (ticking) {
      return;
    }
    ticking = true;
    window.requestAnimationFrame(applyHeroHeight);
  };

  recalcHeroRange();
  applyHeroHeight();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    recalcHeroRange();
    onScroll();
  });
}

const researchStack = document.querySelector('.papers-stack[data-source]');

const escapeHtml = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const renderResearchSection = (section, index) => {
  const modifier = index === 2 ? ' paper-cell--highlight' : index === 3 ? ' paper-cell--accent' : '';

  return `
    <section class="paper-cell${modifier}">
      <h3>${escapeHtml(section.heading)}</h3>
      <p>${escapeHtml(section.body)}</p>
    </section>
  `;
};

const renderResearchPaper = (paper) => {
  const sections = Array.isArray(paper.sections) ? paper.sections : [];

  return `
    <article class="paper-card">
      <div class="paper-card__head">
        <span class="paper-card__badge">${escapeHtml(paper.category)}</span>
        <a class="paper-card__url" href="${escapeHtml(paper.url)}" target="_blank" rel="noopener noreferrer">RESEARCH URL ↗</a>
      </div>
      <h2>${escapeHtml(paper.title)}</h2>
      <p class="paper-card__org">${escapeHtml(paper.organization)}</p>
      <p class="paper-card__summary">${escapeHtml(paper.summary)}</p>
      <div class="paper-card__grid">
        ${sections.map((section, index) => renderResearchSection(section, index)).join('')}
      </div>
    </article>
  `;
};

const renderResearchPapers = (data) => {
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const papers = Array.isArray(data.papers) ? data.papers : [];

  return categories.map((category) => {
    const cards = papers
      .filter((paper) => paper.categoryId === category.id)
      .map((paper) => renderResearchPaper(paper))
      .join('');

    return `
      <h2 class="research-category-heading" id="${escapeHtml(category.id)}">${escapeHtml(category.name)}</h2>
      ${cards}
    `;
  }).join('');
};

const mapSupabaseRowsToResearchData = (rows) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const orderedRows = safeRows.slice().sort((a, b) => {
    const categoryDiff = (a.category_sort ?? 9999) - (b.category_sort ?? 9999);
    if (categoryDiff !== 0) {
      return categoryDiff;
    }

    const paperDiff = (a.paper_sort ?? 9999) - (b.paper_sort ?? 9999);
    if (paperDiff !== 0) {
      return paperDiff;
    }

    return (a.id ?? 0) - (b.id ?? 0);
  });

  const categoryMap = new Map();
  const papers = orderedRows.map((row) => {
    if (!categoryMap.has(row.category_id)) {
      categoryMap.set(row.category_id, {
        id: row.category_id,
        name: row.category_name,
        sort: row.category_sort ?? 9999
      });
    }

    return {
      categoryId: row.category_id,
      category: row.category_name,
      url: row.url,
      title: row.title,
      organization: row.organization,
      summary: row.summary,
      sections: [
        { heading: row.section1_heading, body: row.section1_body },
        { heading: row.section2_heading, body: row.section2_body },
        { heading: row.section3_heading, body: row.section3_body },
        { heading: row.section4_heading, body: row.section4_body }
      ]
    };
  });

  const categories = Array.from(categoryMap.values())
    .sort((a, b) => a.sort - b.sort)
    .map((category) => ({ id: category.id, name: category.name }));

  return { categories, papers };
};

const loadResearchFromSupabase = async () => {
  if (!researchStack) {
    return false;
  }

  const config = window.SUPABASE_CONFIG;
  if (!config || !config.enabled) {
    return false;
  }

  if (!config.url || !config.anonKey || !config.table) {
    console.warn('Supabase config is incomplete.');
    return false;
  }

  const cols = [
    'id', 'category_id', 'category_name', 'category_sort', 'paper_sort',
    'title', 'organization', 'summary', 'url',
    'section1_heading', 'section1_body',
    'section2_heading', 'section2_body',
    'section3_heading', 'section3_body',
    'section4_heading', 'section4_body',
    'published'
  ].join(',');

  const endpoint = `${config.url}/rest/v1/${config.table}` +
    `?select=${encodeURIComponent(cols)}` +
    `&published=eq.true` +
    `&order=category_sort.asc,paper_sort.asc,id.asc`;

  const response = await fetch(endpoint, {
    headers: {
      'apikey': config.anonKey,
      'Authorization': `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase responded with ${response.status}`);
  }

  const data = await response.json();
  const mapped = mapSupabaseRowsToResearchData(data);
  researchStack.innerHTML = renderResearchPapers(mapped);
  return true;
};

const loadResearchFromJson = async () => {
  if (!researchStack) {
    return;
  }

  const source = researchStack.dataset.source;
  if (!source) {
    return;
  }

  try {
    const loadedFromSupabase = await loadResearchFromSupabase();
    if (loadedFromSupabase) {
      return;
    }

    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load research data JSON: ${response.status}`);
    }

    const data = await response.json();
    researchStack.innerHTML = renderResearchPapers(data);
  } catch (error) {
    console.warn('Research data JSON could not be loaded. Keeping static HTML fallback.', error);
  }
};

loadResearchFromJson();

const farmLog = document.querySelector('.farm-log[data-farm-source]');

const renderFarmEntry = (entry) => {
  const photos = Array.isArray(entry.photos) ? entry.photos : [];

  return `
    <article class="farm-entry farm-entry--modern">
      <p class="farm-entry__date">${escapeHtml(entry.dateLabel)}</p>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${escapeHtml(entry.description)}</p>
      <div class="farm-entry__media-grid">
        ${photos.map((photo) => `
          <figure class="farm-media-card">
            <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async" onerror="this.onerror=null; this.closest('figure').style.display='none';">
            <figcaption>${escapeHtml(photo.caption)}</figcaption>
          </figure>
        `).join('')}
      </div>
    </article>
  `;
};

const renderFarmEntries = (data) => {
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const ordered = entries.slice().sort((a, b) =>
    (b.dateLabel || '').localeCompare(a.dateLabel || '')
  );
  return ordered.map((entry) => renderFarmEntry(entry)).join('');
};

// パスを正規化する（ローカルファイルパスは無効として除外）
const normalizeFarmPhotoPath = (src) => {
  if (!src || typeof src !== 'string') return null;
  const trimmed = src.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('./assets/images/farm/')) {
    return trimmed.replace('./', '');
  }

  if (trimmed.startsWith('assets/images/farm/') || trimmed.startsWith('/assets/images/farm/')) {
    return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  }
  
  // Windows ローカルパスやバックスラッシュを含む値は公開ページでは無効
  if (trimmed.includes(':') || trimmed.includes('\\')) {
    console.warn('Farm photo path is a local path and was ignored:', trimmed);
    return null;
  }

  // ファイル名のみが入っている場合は farm 配下に補完
  if (!trimmed.includes('/')) {
    return `assets/images/farm/${trimmed}`;
  }
  
  // すでに相対パスの場合はそのまま返す
  return trimmed;
};

const mapSupabaseRowsToFarmData = (rows) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const entries = safeRows.map((row) => {
    const photos = [];

    const photo1Src = normalizeFarmPhotoPath(row.photo1_src);
    if (photo1Src) {
      photos.push({
        src: photo1Src,
        alt: row.photo1_alt || row.title,
        caption: row.photo1_caption || ''
      });
    }

    const photo2Src = normalizeFarmPhotoPath(row.photo2_src);
    if (photo2Src) {
      photos.push({
        src: photo2Src,
        alt: row.photo2_alt || row.title,
        caption: row.photo2_caption || ''
      });
    }

    return {
      sortOrder: row.sort_order,
      dateLabel: row.date_label,
      title: row.title,
      description: row.description,
      photos
    };
  });

  return { entries };
};

const loadFarmFromSupabase = async () => {
  if (!farmLog) {
    return null;
  }

  const config = window.SUPABASE_CONFIG;
  if (!config || !config.enabled) {
    return null;
  }

  const table = farmLog.dataset.farmTable || config.farmTable || 'farm_updates';

  if (!config.url || !config.anonKey || !table) {
    console.warn('Supabase config is incomplete for farm data.');
    return null;
  }

  const cols = [
    'id', 'sort_order', 'date_label', 'title', 'description',
    'photo1_src', 'photo1_alt', 'photo1_caption',
    'photo2_src', 'photo2_alt', 'photo2_caption',
    'published'
  ].join(',');

  const endpoint = `${config.url}/rest/v1/${table}` +
    `?select=${encodeURIComponent(cols)}` +
    `&published=eq.true` +
    `&order=sort_order.asc,id.asc`;

  const response = await fetch(endpoint, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Farm Supabase responded with ${response.status}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  return mapSupabaseRowsToFarmData(rows).entries;
};

const loadFarmFromJson = async () => {
  if (!farmLog) {
    return;
  }

  const source = farmLog.dataset.farmSource;
  if (!source) {
    return;
  }

  try {
    // Supabase と JSON を両方ロードしてマージ（dateLabel をキーに重複除去、Supabase 優先）
    const [supabaseEntries, jsonData] = await Promise.allSettled([
      loadFarmFromSupabase(),
      fetch(source, { cache: 'no-store' }).then((r) => r.ok ? r.json() : Promise.reject(r.status))
    ]);

    const fromSupabase = supabaseEntries.status === 'fulfilled' && Array.isArray(supabaseEntries.value)
      ? supabaseEntries.value : [];
    const fromJson = jsonData.status === 'fulfilled' && Array.isArray(jsonData.value?.entries)
      ? jsonData.value.entries : [];

    // Supabase の dateLabel セットを作成（重複除去用）
    const supabaseDates = new Set(fromSupabase.map((e) => e.dateLabel));

    // JSON のエントリのうち Supabase にない日付のものを追加
    const merged = [
      ...fromSupabase,
      ...fromJson.filter((e) => !supabaseDates.has(e.dateLabel))
    ];

    if (merged.length > 0) {
      farmLog.innerHTML = renderFarmEntries({ entries: merged });
    }
  } catch (error) {
    console.warn('Farm data could not be loaded. Keeping static HTML fallback.', error);
  }
};

loadFarmFromJson();

// ─── Q&A ─────────────────────────────────────────────────────────────────────

const qaBandList = document.querySelector('.qa-band-list[data-qa-source]');
const qaSearchInput = document.querySelector('#qa-search-input');
const qaSearchClear = document.querySelector('.qa-search__clear');

let qaAllItems = []; // 全件キャッシュ（検索フィルター用）

// ── テキスト正規化（全角→半角、カタカナ→ひらがな、小文字化）
const normalizeText = (text) => {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
};

// ── クエリをトークン分割（全角・半角スペース対応）
const getTokens = (query) =>
  normalizeText(query).split(/[\s\u3000]+/).filter((t) => t.length > 0);

// ── アイテムがすべてのトークンにマッチするか（AND検索）
const itemMatchesTokens = (item, tokens) => {
  const haystack = normalizeText(`${item.tag} ${item.question} ${item.answer}`);
  return tokens.every((token) => haystack.includes(token));
};

// ── マッチ箇所をハイライト（XSS対策: escapeHtml後に置換）
const highlightText = (text, tokens) => {
  const safe = escapeHtml(text);
  if (!tokens.length) return safe;
  let result = safe;
  tokens.forEach((token) => {
    const safeToken = escapeHtml(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(safeToken, 'gi');
    result = result.replace(re, (m) => `<mark class="qa-highlight">${m}</mark>`);
  });
  return result;
};

// ── Q&Aアイテムをレンダリング
const renderQaItems = (items, tokens = []) => {
  const sorted = items.slice().sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  return sorted.map((item, index) => `
    <details class="qa-band"${index === 0 && !tokens.length ? ' open' : ''}>
      <summary>
        <span class="qa-band__tag">${escapeHtml(item.tag)}</span>
        <span class="qa-band__question">${highlightText(item.question, tokens)}</span>
      </summary>
      <div class="qa-band__answer"><p>${highlightText(item.answer, tokens)}</p></div>
    </details>
  `).join('');
};

// ── 検索結果なしメッセージ
const renderQaNoResults = (query) => `
  <div class="qa-no-results" role="status" aria-live="polite">
    <p class="qa-no-results__icon">🔍</p>
    <p class="qa-no-results__title">「${escapeHtml(query)}」に一致する質問が見つかりませんでした</p>
    <p class="qa-no-results__message">
      別のキーワードをお試しください。<br>
      いただいた検索内容はQ&amp;Aの充実に活用させていただきます。<br>
      ご不明な点はお気軽にお問い合わせください。
    </p>
  </div>
`;

// ── 検索ログをSupabaseに保存（fire-and-forget）
const saveSearchLog = async (queryText, hitCount) => {
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.enabled || !config.url || !config.anonKey) return;
  try {
    const response = await fetch(`${config.url}/rest/v1/qa_logs`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ query_text: queryText, hit_count: hitCount })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn('Q&A search log could not be saved.', response.status, errorText);
    }
  } catch (error) {
    console.warn('Q&A search log request failed.', error);
  }
};

// ── 検索フィルター適用
const applyQaSearch = (rawQuery) => {
  if (!qaBandList) return;
  const tokens = getTokens(rawQuery);

  if (!tokens.length) {
    qaBandList.innerHTML = renderQaItems(qaAllItems);
    if (qaSearchClear) qaSearchClear.hidden = true;
    return;
  }

  if (qaSearchClear) qaSearchClear.hidden = false;
  const matched = qaAllItems.filter((item) => itemMatchesTokens(item, tokens));

  if (matched.length === 0) {
    qaBandList.innerHTML = renderQaNoResults(rawQuery.trim());
  } else {
    qaBandList.innerHTML = renderQaItems(matched, tokens);
  }
};

// ── 検索入力イベント（デバウンス付きDB保存）
let searchSaveTimer = null;
let lastSavedQuery = '';

const scheduleSearchLogSave = (query, delayMs = 700) => {
  clearTimeout(searchSaveTimer);

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return;
  }

  searchSaveTimer = setTimeout(() => {
    const tokens = getTokens(trimmed);
    const hitCount = qaAllItems.filter((item) => itemMatchesTokens(item, tokens)).length;
    if (trimmed !== lastSavedQuery) {
      saveSearchLog(trimmed, hitCount);
      lastSavedQuery = trimmed;
    }
  }, delayMs);
};

if (qaSearchInput) {
  qaSearchInput.addEventListener('input', () => {
    const query = qaSearchInput.value;
    applyQaSearch(query);
    scheduleSearchLogSave(query, 700);
  });

  // 日本語IMEの確定入力でも保存を取りこぼさない
  qaSearchInput.addEventListener('compositionend', () => {
    const query = qaSearchInput.value;
    applyQaSearch(query);
    scheduleSearchLogSave(query, 350);
  });

  // 入力後すぐ画面遷移しても、フォーカスアウト時に保存
  qaSearchInput.addEventListener('blur', () => {
    const query = qaSearchInput.value;
    if (query.trim().length >= 2) {
      scheduleSearchLogSave(query, 50);
    }
  });

  qaSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      scheduleSearchLogSave(qaSearchInput.value, 50);
    }
  });
}

if (qaSearchClear) {
  qaSearchClear.addEventListener('click', () => {
    if (qaSearchInput) {
      qaSearchInput.value = '';
      qaSearchInput.focus();
    }
    applyQaSearch('');
  });
}

// ── Supabaseからデータ取得
const loadQaFromSupabase = async () => {
  if (!qaBandList) return false;

  const config = window.SUPABASE_CONFIG;
  if (!config || !config.enabled || !config.url || !config.anonKey) return false;

  const table = qaBandList.dataset.qaTable || 'qa_items';
  const cols = 'id,sort_order,tag,question,answer,published';
  const endpoint = `${config.url}/rest/v1/${table}` +
    `?select=${encodeURIComponent(cols)}` +
    `&published=eq.true` +
    `&order=sort_order.asc,id.asc`;

  const response = await fetch(endpoint, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) throw new Error(`Q&A Supabase responded with ${response.status}`);

  const rows = await response.json();
  qaAllItems = rows.map((row) => ({
    sortOrder: row.sort_order,
    tag: row.tag,
    question: row.question,
    answer: row.answer
  }));

  qaBandList.innerHTML = renderQaItems(qaAllItems);
  return true;
};

// ── JSONフォールバック含むデータロード
const loadQaData = async () => {
  if (!qaBandList) return;

  const source = qaBandList.dataset.qaSource;
  if (!source) return;

  try {
    const loadedFromSupabase = await loadQaFromSupabase();
    if (loadedFromSupabase) return;

    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load Q&A data JSON: ${response.status}`);

    const data = await response.json();
    qaAllItems = Array.isArray(data.items) ? data.items : [];
    qaBandList.innerHTML = renderQaItems(qaAllItems);
  } catch (error) {
    console.warn('Q&A data could not be loaded. Keeping static HTML fallback.', error);
  }
};

loadQaData();

// ─── お問い合わせフォーム（contact.html） ──────────────────────────────────────

const contactForm = document.querySelector('form[data-contact-form]');

if (contactForm) {
  const contactAlert = document.querySelector('#contact-alert');
  const contactSuccess = document.querySelector('#contact-success');
  const contactSubmit = document.querySelector('#contact-submit');
  const nameInput = document.querySelector('#contact-name');
  const emailInput = document.querySelector('#contact-email');
  const phoneInput = document.querySelector('#contact-phone');
  const categoryInput = document.querySelector('#contact-category');
  const messageInput = document.querySelector('#contact-message');
  const consentInput = document.querySelector('#contact-consent');
  const honeypotInput = document.querySelector('#contact-website');
  const messageCount = document.querySelector('#contact-message-count');

  const formLoadedAt = Date.now();
  const CONTACT_CATEGORIES = ['商品について', 'ご注文・配送について', '取材・メディア', 'その他'];

  // ── 本文の文字数カウンター
  if (messageInput && messageCount) {
    const updateCount = () => { messageCount.textContent = String(messageInput.value.length); };
    messageInput.addEventListener('input', updateCount);
    updateCount();
  }

  const showContactAlert = (text) => {
    if (!contactAlert) return;
    contactAlert.textContent = text;
    contactAlert.hidden = false;
    contactAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const clearContactAlert = () => {
    if (!contactAlert) return;
    contactAlert.hidden = true;
    contactAlert.textContent = '';
  };

  // ── 簡易メール形式チェック（サーバー側でも別途検証）
  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  // ── Supabase へ匿名 INSERT（qa_logs と同じパターン）
  const submitContact = async (payload) => {
    const config = window.SUPABASE_CONFIG;
    if (!config || !config.enabled || !config.url || !config.anonKey) {
      throw new Error('Supabase config is missing.');
    }

    const response = await fetch(`${config.url}/rest/v1/contacts`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Contact Supabase responded with ${response.status} ${detail}`);
    }
  };

  const showContactSuccess = () => {
    contactForm.hidden = true;
    if (contactSuccess) {
      contactSuccess.hidden = false;
      contactSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearContactAlert();

    // ハニーポット：不可視項目に入力があればボットとみなし、静かに成功表示
    if (honeypotInput && honeypotInput.value.trim() !== '') {
      showContactSuccess();
      return;
    }

    // 送信が速すぎる（3秒未満）はボットの可能性が高い
    if (Date.now() - formLoadedAt < 3000) {
      showContactAlert('送信の間隔が短すぎます。数秒おいてから、もう一度お試しください。');
      return;
    }

    const name = (nameInput?.value || '').trim();
    const email = (emailInput?.value || '').trim();
    const phone = (phoneInput?.value || '').trim();
    const category = categoryInput?.value || '';
    const message = (messageInput?.value || '').trim();
    const consent = !!consentInput?.checked;

    // ── クライアント側バリデーション
    if (!name || name.length > 100) {
      showContactAlert('お名前を100文字以内でご入力ください。');
      return;
    }
    if (!email || email.length > 254 || !isValidEmail(email)) {
      showContactAlert('メールアドレスを正しくご入力ください。');
      return;
    }
    if (phone.length > 30) {
      showContactAlert('電話番号は30文字以内でご入力ください。');
      return;
    }
    if (!CONTACT_CATEGORIES.includes(category)) {
      showContactAlert('お問い合わせ種別を選択してください。');
      return;
    }
    if (!message || message.length > 2000) {
      showContactAlert('お問い合わせ内容を2000文字以内でご入力ください。');
      return;
    }
    if (!consent) {
      showContactAlert('個人情報の取り扱いに同意のうえ、送信してください。');
      return;
    }

    if (contactSubmit) {
      contactSubmit.disabled = true;
      contactSubmit.textContent = '送信中...';
    }

    try {
      await submitContact({
        name,
        email,
        phone: phone || null,
        category,
        message
      });
      showContactSuccess();
    } catch (error) {
      console.warn('Contact submission failed.', error);
      showContactAlert('送信に失敗しました。お手数ですが、時間をおいて再度お試しください。');
      if (contactSubmit) {
        contactSubmit.disabled = false;
        contactSubmit.textContent = '送信する';
      }
    }
  });
}