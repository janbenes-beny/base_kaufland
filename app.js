/**
 * Project: base_kaufland
 * Wizard: API Setup, Cleaning Rules, Processing, Sync do BaseLinker (Kaufland)
 */
(function () {
  const API_BASE = '';
  function apiUrl(path) {
    return (API_BASE || '') + '/.netlify/functions' + (path.startsWith('/') ? path : '/' + path);
  }

  let products = [];
  const BL_STORAGE = 'bl_token';
  const INV_STORAGE = 'bl_inventory_id';
  const FIELD_STORAGE = 'bl_field_id';

  const DEFAULT_INVENTORY_ID = 5257; // INVENTORY_ID nyní bereme jako konstantu
  const CATALOG_PAGE_SIZE = 20;   // produktů na jedné stránce tabulky
  const CATALOG_API_PAGE_SIZE = 1000; // BaseLinker vrací max 1000 na stránku
  const CATALOG_MAX_PAGES = 10;   // max počet API stránek (10 × 1000 = 10 000 produktů)
  const SYNC_BATCH_SIZE = 50;           // počet produktů v jedné dávce setInventoryProductData
  const SYNC_RATE_DELAY_MS = 700;       // pauza mezi requesty kvůli rate limitu
  const SYNC_RETRY_AFTER_429_MS = 30000; // pauza po 429 (Too Many Requests)
  let catalogList = [];           // [{ itemId, name, ean, sku }]
  let catalogCurrentPage = 1;
  let catalogSelectedIds = new Set(); // vybraná ID napříč stránkami

  function getToken() { return sessionStorage.getItem(BL_STORAGE) || document.getElementById('blToken').value.trim(); }
  // INVENTORY_ID už není editovatelné v UI – používáme konstantu
  function getInventoryId() {
    return String(DEFAULT_INVENTORY_ID);
  }
  // Aktuální vybraný kanál v UI – při sync se použije tato hodnota (dropdown má přednost před session)
  function getFieldId() {
    const el = document.getElementById('fieldId');
    if (el && el.value) return el.value;
    return sessionStorage.getItem(FIELD_STORAGE) || '';
  }

  function showMsg(elId, text, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg ' + (type || '');
    el.classList.toggle('hidden', !text);
  }

  function callBaseLinker(method, parameters) {
    const token = getToken();
    const url = apiUrl('/baselinker');
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      return Promise.reject(new Error('Stránka běží jako soubor (file://). API nefunguje. Spusťte lokálně: netlify dev — pak otevřete adresu např. http://localhost:8888'));
    }
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, method, parameters }),
    }).then(r => {
      if (!r.ok) return r.text().then(t => Promise.reject(new Error(r.status + ' ' + r.statusText + (t ? ': ' + t.slice(0, 200) : ''))));
      return r.json();
    });
  }

  function wrapFetchError(e) {
    const msg = e && e.message ? e.message : String(e);
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return 'Síťová chyba (Failed to fetch). Spusťte lokálně příkaz „netlify dev“ a otevřete v prohlížeči adresu, kterou vypíše (např. http://localhost:8888). Nebo nasaďte aplikaci na Netlify a používejte ji tam.';
    }
    return msg;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // —— Login screen: pouze API klíč, INVENTORY_ID je konstanta ——
  document.getElementById('btnLogin').addEventListener('click', async function () {
    const apiKeyInput = document.getElementById('loginApiKey');
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showMsg('loginMsg', 'Zadejte BaseLinker API klíč.', 'error');
      return;
    }
    // uložit token do sessionStorage a do skrytého pole, které používá stávající logika
    sessionStorage.setItem(BL_STORAGE, apiKey);
    const blTokenInput = document.getElementById('blToken');
    if (blTokenInput) blTokenInput.value = apiKey;
    const inventoryInput = document.getElementById('inventoryId');
    if (inventoryInput) inventoryInput.value = String(DEFAULT_INVENTORY_ID);

    this.disabled = true;
    showMsg('loginMsg', 'Ověřuji API klíč…', 'info');
    try {
      const data = await callBaseLinker('getInventoryAvailableTextFieldKeys', { inventory_id: DEFAULT_INVENTORY_ID });
      if (data.status === 'SUCCESS') {
        // uložit výchozí FIELD_ID z aktuálně vybraného kanálu (dropdown)
        const fieldEl = document.getElementById('fieldId');
        if (fieldEl && fieldEl.value) {
          sessionStorage.setItem(FIELD_STORAGE, fieldEl.value);
        }
        sessionStorage.setItem(INV_STORAGE, String(DEFAULT_INVENTORY_ID));
        // přechod na dashboard
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        const apiRow = document.getElementById('apiSetupRow');
        if (apiRow) apiRow.classList.add('hidden');
        // zpřístupnit krok 3 (tabulka produktů); pravidla se otevírají přes Settings
        document.getElementById('step3').classList.remove('hidden');
        showMsg('loginMsg', '', '');
        showMsg('msg1', 'Spojení v pořádku.', 'success');
        // Auto-load: použijeme existující logiku načtení seznamu produktů
        const btnLoad = document.getElementById('btnLoadCatalogList');
        if (btnLoad) btnLoad.click();
      } else {
        showMsg('loginMsg', (data.error_message || data.error || 'Chyba API') + (data.error_code ? ' (kód: ' + data.error_code + ')' : ''), 'error');
      }
    } catch (e) {
      showMsg('loginMsg', 'Chyba: ' + wrapFetchError(e), 'error');
    } finally {
      this.disabled = false;
    }
  });

  // —— Ověřit spojení (ponecháno pro případné ruční testy, ale UI je schované za loginem) ——
  document.getElementById('btnVerifyConnection').addEventListener('click', async function () {
    const token = document.getElementById('blToken').value.trim();
    const inventoryId = getInventoryId();
    if (!token) {
      showMsg('msg1', 'Vyplňte BaseLinker token.', 'error');
      return;
    }
    this.disabled = true;
    showMsg('msg1', '', '');
    try {
      const data = await callBaseLinker('getInventoryAvailableTextFieldKeys', { inventory_id: parseInt(inventoryId, 10) });
      if (data.status === 'SUCCESS') {
        sessionStorage.setItem(BL_STORAGE, token);
        sessionStorage.setItem(INV_STORAGE, inventoryId);
        showMsg('msg1', 'Spojení v pořádku.', 'success');
      } else {
        showMsg('msg1', (data.error_message || data.error || 'Chyba API') + (data.error_code ? ' (kód: ' + data.error_code + ')' : ''), 'error');
      }
    } catch (e) {
      showMsg('msg1', 'Chyba: ' + wrapFetchError(e), 'error');
    } finally {
      this.disabled = false;
    }
  });

  // —— Seznam produktů z katalogu (getInventoryProductsList) ——
  function getFilteredCatalog() {
    const filterId = (document.getElementById('filterCatalogId') && document.getElementById('filterCatalogId').value.trim()) || '';
    const filterName = (document.getElementById('filterCatalogName') && document.getElementById('filterCatalogName').value.trim().toLowerCase()) || '';
    return catalogList.filter(function (item) {
      if (filterId && String(item.itemId).indexOf(filterId) === -1) return false;
      if (filterName && !((item.name || '').toLowerCase().includes(filterName))) return false;
      return true;
    });
  }

  function getFilteredCatalogPage() {
    const filtered = getFilteredCatalog();
    const totalPages = Math.max(1, Math.ceil(filtered.length / CATALOG_PAGE_SIZE));
    const page = Math.min(Math.max(1, catalogCurrentPage), totalPages);
    const start = (page - 1) * CATALOG_PAGE_SIZE;
    return { page, totalPages, rows: filtered.slice(start, start + CATALOG_PAGE_SIZE), total: filtered.length };
  }

  function renderCatalogTable() {
    const tbody = document.getElementById('catalogListBody');
    if (!tbody) return;
    const { page, totalPages, rows, total } = getFilteredCatalogPage();
    catalogCurrentPage = page;
    tbody.innerHTML = '';
    rows.forEach(function (item) {
      const tr = document.createElement('tr');
      const checked = catalogSelectedIds.has(item.itemId) ? ' checked' : '';
      tr.innerHTML =
        '<td><input type="checkbox" class="catalog-row-check" data-product-id="' + escapeHtml(item.itemId) + '"' + checked + '></td>' +
        '<td>' + escapeHtml(item.itemId) + '</td>' +
        '<td>' + escapeHtml(item.name || '') + '</td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.catalog-row-check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        const id = this.getAttribute('data-product-id');
        if (this.checked) catalogSelectedIds.add(id);
        else catalogSelectedIds.delete(id);
        updateCatalogCheckAllState();
      });
    });
    updateCatalogPagination(page, totalPages, total);
    updateCatalogCheckAllState();
  }

  function updateCatalogPagination(page, totalPages, total) {
    const infoEl = document.getElementById('catalogPageInfo');
    const prevBtn = document.getElementById('btnCatalogPrev');
    const nextBtn = document.getElementById('btnCatalogNext');
    if (infoEl) infoEl.textContent = 'Stránka ' + page + ' z ' + totalPages + ' (celkem ' + total + ' produktů)';
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  function updateCatalogCheckAllState() {
    const checkAll = document.getElementById('checkAllCatalog');
    if (!checkAll) return;
    const checks = document.querySelectorAll('.catalog-row-check');
    const checked = document.querySelectorAll('.catalog-row-check:checked');
    checkAll.checked = checks.length > 0 && checked.length === checks.length;
    checkAll.indeterminate = checked.length > 0 && checked.length < checks.length;
  }

  document.getElementById('btnLoadCatalogList').addEventListener('click', async function () {
    if (!getToken()) {
      showMsg('msgCatalog', 'Vyplňte BaseLinker token a ověřte spojení.', 'error');
      return;
    }
    const inventoryId = getInventoryId() || String(DEFAULT_INVENTORY_ID);
    this.disabled = true;
    showMsg('msgCatalog', 'Načítám seznam produktů…', 'info');
    document.getElementById('catalogListWrap').classList.add('hidden');
    catalogList = [];
    catalogSelectedIds.clear();
    catalogCurrentPage = 1;
    try {
      let apiPage = 1;
      while (true) {
        const data = await callBaseLinker('getInventoryProductsList', {
          inventory_id: parseInt(inventoryId, 10),
          page: apiPage,
        });
        if (data.status !== 'SUCCESS' || !data.products || Object.keys(data.products).length === 0) break;
        Object.keys(data.products).forEach(function (id) {
          const p = data.products[id];
          if (p && (p.parent_id === 0 || p.parent_id === undefined)) {
            catalogList.push({
              itemId: String(p.id),
              name: p.name || '',
              ean: p.ean || '',
              sku: p.sku || '',
            });
          }
        });
        // Pokud API vrátilo méně než CATALOG_API_PAGE_SIZE produktů, už nejsou další stránky
        if (Object.keys(data.products).length < CATALOG_API_PAGE_SIZE) break;
        apiPage++;
      }
      showMsg('msgCatalog', 'Načteno ' + catalogList.length + ' produktů.', 'success');
      document.getElementById('catalogListWrap').classList.remove('hidden');
      document.getElementById('filterCatalogId').value = '';
      document.getElementById('filterCatalogName').value = '';
      renderCatalogTable();
    } catch (e) {
      showMsg('msgCatalog', 'Chyba: ' + wrapFetchError(e), 'error');
    } finally {
      this.disabled = false;
    }
  });

  document.getElementById('filterCatalogId').addEventListener('input', function () {
    catalogCurrentPage = 1;
    renderCatalogTable();
  });
  document.getElementById('filterCatalogName').addEventListener('input', function () {
    catalogCurrentPage = 1;
    renderCatalogTable();
  });

  document.getElementById('btnCatalogPrev').addEventListener('click', function () {
    if (catalogCurrentPage > 1) {
      catalogCurrentPage--;
      renderCatalogTable();
    }
  });
  document.getElementById('btnCatalogNext').addEventListener('click', function () {
    const { totalPages } = getFilteredCatalogPage();
    if (catalogCurrentPage < totalPages) {
      catalogCurrentPage++;
      renderCatalogTable();
    }
  });

  document.getElementById('checkAllCatalog').addEventListener('change', function () {
    const checkAll = this;
    const rows = getFilteredCatalogPage().rows;
    rows.forEach(function (item) {
      if (checkAll.checked) catalogSelectedIds.add(item.itemId);
      else catalogSelectedIds.delete(item.itemId);
    });
    renderCatalogTable();
  });

  document.getElementById('btnPrepareSelected').addEventListener('click', async function () {
    const ids = Array.from(catalogSelectedIds);
    if (ids.length === 0) {
      showMsg('msgPrepare', 'Nevyberte žádné produkty v tabulce.', 'error');
      return;
    }
    if (ids.length > 100) {
      showMsg('msgPrepare', 'Maximálně 100 produktů najednou. Nyní máte vybráno ' + ids.length + '.', 'error');
      return;
    }
    const inventoryId = getInventoryId() || String(DEFAULT_INVENTORY_ID);
    this.disabled = true;
    showMsg('msgPrepare', 'Načítám popisy ' + ids.length + ' produktů a čistím…', 'info');
    const allowedTagsSet = parseAllowedTags(document.getElementById('allowedTags').value);
    const orphanPhrases = parseOrphanPhrases(document.getElementById('orphanPhrases').value);
    const tableToList = document.getElementById('tableToList').checked;
    const newProducts = [];
    try {
      const numIds = ids.map(function (id) { return parseInt(id, 10); }).filter(function (n) { return !isNaN(n); });
      const data = await callBaseLinker('getInventoryProductsData', {
        inventory_id: parseInt(inventoryId, 10),
        products: numIds,
      });
      if (data.status !== 'SUCCESS' || !data.products) {
        showMsg('msgPrepare', (data.error_message || data.error || 'Chyba API') + (data.error_code ? ' (kód: ' + data.error_code + ')' : ''), 'error');
        this.disabled = false;
        return;
      }
      ids.forEach(function (id) {
        const prod = data.products[id];
        if (!prod) return;
        const tf = prod.text_fields || {};
        const originalHtml = getDescriptionFromTextFields(tf);
        const name = (tf['name'] || tf['name|cs'] || '').trim() || ('Produkt ' + id);
        const cleanedHtml = cleanDescription(originalHtml, allowedTagsSet, orphanPhrases, tableToList);
        newProducts.push({ itemId: String(id), name: name, originalHtml: originalHtml, cleanedHtml: cleanedHtml });
      });
      products = newProducts;
      showMsg('msgPrepare', 'Připraveno ' + products.length + ' produktů. V kroku 3 můžete synchronizovat.', 'success');
      document.getElementById('step3').classList.remove('hidden');
      document.getElementById('productsTableWrap').classList.remove('hidden');
      renderTable(products);
    } catch (e) {
      showMsg('msgPrepare', 'Chyba: ' + wrapFetchError(e), 'error');
    } finally {
      this.disabled = false;
    }
  });

  // Pomocná funkce: načte data produktů po dávkách (max 1000 ID na jeden request)
  async function fetchProductsDataBatched(inventoryId, ids) {
    const numIds = ids
      .map(function (id) { return parseInt(id, 10); })
      .filter(function (n) { return !isNaN(n); });
    const allProducts = {};
    const batchSize = 100; // menší dávky kvůli limitu velikosti odpovědi Netlify funkce
    for (let start = 0; start < numIds.length; start += batchSize) {
      const batch = numIds.slice(start, start + batchSize);
      const data = await callBaseLinker('getInventoryProductsData', {
        inventory_id: parseInt(inventoryId, 10),
        products: batch,
      });
      if (data.status !== 'SUCCESS' || !data.products) {
        throw new Error((data.error_message || data.error || 'Chyba API') + (data.error_code ? ' (kód: ' + data.error_code + ')' : ''));
      }
      Object.keys(data.products).forEach(function (id) {
        allProducts[id] = data.products[id];
      });
    }
    return allProducts;
  }

  // Filtrovat pouze nevyčištěné produkty (odstraní ty, které už mají popis v aktuálně vybraném kanálu)
  async function filterUncleanedProducts() {
    if (!catalogList.length) {
      showMsg('msgFilterUncleaned', 'Seznam produktů je prázdný. Nejprve načtěte katalog.', 'error');
      return;
    }

    const fieldId = getFieldId();
    if (!fieldId) {
      showMsg('msgFilterUncleaned', 'Vyberte kanál (fieldId) v nastavení před filtrováním.', 'error');
      return;
    }

    const inventoryId = getInventoryId() || String(DEFAULT_INVENTORY_ID);
    const button = document.getElementById('btnFilterUncleaned');
    if (button) button.disabled = true;

    const originalCount = catalogList.length;
    showMsg('msgFilterUncleaned', 'Kontroluji popisy ' + originalCount + ' produktů v kanálu ' + fieldId + '…', 'info');

    try {
      const ids = catalogList.map(function (item) { return item.itemId; });
      const allProducts = await fetchProductsDataBatched(inventoryId, ids);

      const uncleanedList = [];
      let cleanedCount = 0;

      catalogList.forEach(function (item) {
        const prod = allProducts[item.itemId];
        if (!prod) {
          // Pokud produkt není v BaseLinkeru, ponecháme ho (možná je nový)
          uncleanedList.push(item);
          return;
        }

        const tf = prod.text_fields || {};
        // Zkontrolovat přímo pole pro aktuálně vybraný kanál
        const channelDescription = tf[fieldId];

        // Pokud má produkt nějaký obsah v tomto kanálu (i když je to jen mezery), vyřadíme ho
        const hasContent = channelDescription && typeof channelDescription === 'string' && channelDescription.trim().length > 0;

        if (hasContent) {
          cleanedCount++;
          // Produkt má popis v tomto kanálu, odstraníme ho ze seznamu
        } else {
          // Produkt nemá popis v tomto kanálu, ponecháme ho
          uncleanedList.push(item);
        }
      });

      catalogList = uncleanedList;
      catalogSelectedIds.clear(); // Vymazat výběr, protože se změnil seznam
      catalogCurrentPage = 1; // Resetovat na první stránku

      renderCatalogTable();

      const remainingCount = catalogList.length;
      showMsg(
        'msgFilterUncleaned',
        'Filtrování dokončeno. Odstraněno ' + cleanedCount + ' produktů s popisem v kanálu ' + fieldId + '. Zbývá ' + remainingCount + ' produktů bez popisu.',
        'success'
      );
    } catch (e) {
      showMsg('msgFilterUncleaned', 'Chyba při filtrování: ' + wrapFetchError(e), 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  // Vyčistit celý seznam – použije stejnou logiku jako „Připravit vybrané“, jen vezme všechna ID
  const btnPrepareAll = document.getElementById('btnPrepareAll');
  if (btnPrepareAll) {
    btnPrepareAll.addEventListener('click', async function () {
      if (!catalogList.length) {
        showMsg('msgPrepare', 'Seznam produktů je prázdný. Nejprve načtěte katalog.', 'error');
        return;
      }
      const ids = catalogList.map(function (item) { return item.itemId; });
      const inventoryId = getInventoryId() || String(DEFAULT_INVENTORY_ID);
      this.disabled = true;
      showMsg('msgPrepare', 'Načítám popisy ' + ids.length + ' produktů a čistím…', 'info');
      const allowedTagsSet = parseAllowedTags(document.getElementById('allowedTags').value);
      const orphanPhrases = parseOrphanPhrases(document.getElementById('orphanPhrases').value);
      const tableToList = document.getElementById('tableToList').checked;
      const newProducts = [];
      try {
        const allProducts = await fetchProductsDataBatched(inventoryId, ids);
        ids.forEach(function (id) {
          const prod = allProducts[id];
          if (!prod) return;
          const tf = prod.text_fields || {};
          const originalHtml = getDescriptionFromTextFields(tf);
          const name = (tf['name'] || tf['name|cs'] || '').trim() || ('Produkt ' + id);
          const cleanedHtml = cleanDescription(originalHtml, allowedTagsSet, orphanPhrases, tableToList);
          newProducts.push({ itemId: String(id), name: name, originalHtml: originalHtml, cleanedHtml: cleanedHtml });
        });
        products = newProducts;
        showMsg('msgPrepare', 'Připraveno ' + products.length + ' produktů. Níže vidíte vyčištěné popisy.', 'success');
        document.getElementById('step3').classList.remove('hidden');
        document.getElementById('productsTableWrap').classList.remove('hidden');
        renderTable(products);
      } catch (e) {
        showMsg('msgPrepare', 'Chyba: ' + wrapFetchError(e), 'error');
      } finally {
        this.disabled = false;
      }
    });
  }

  // Event listener pro tlačítko "Filtrovat pouze nevyčištěné"
  const btnFilterUncleaned = document.getElementById('btnFilterUncleaned');
  if (btnFilterUncleaned) {
    btnFilterUncleaned.addEventListener('click', function () {
      filterUncleanedProducts();
    });
  }

  // —— Upravit produkt (text_fields) podle pravidel čištění ——
  function getDescriptionFromTextFields(textFields) {
    if (!textFields || typeof textFields !== 'object') return '';
    const keys = ['description|cs|kauflandcz_0', 'description|cs|kaufland_14257', 'description|cs', 'description'];
    for (const k of keys) {
      const v = textFields[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  function hasHtmlContent(html) {
    if (!html || typeof html !== 'string') return false;
    return /<[^>]+>/.test(html);
  }

  function getNameFromTextFields(textFields) {
    if (!textFields || typeof textFields !== 'object') return '';
    const n = textFields['name'] || textFields['name|cs'];
    if (typeof n === 'string') return n.trim();
    return '';
  }

  // Funkce pro úpravu jednoho produktu podle ID byla odstraněna z UI (zjednodušení rozhraní)

  // Při načtení stránky: pokud už máme API klíč, přeskočíme login, ukážeme dashboard
  // a znovu automaticky načteme seznam produktů z katalogu.
  if (sessionStorage.getItem(BL_STORAGE)) {
    const blTokenInput = document.getElementById('blToken');
    if (blTokenInput) blTokenInput.value = sessionStorage.getItem(BL_STORAGE);
    const inventoryInput = document.getElementById('inventoryId');
    if (inventoryInput) inventoryInput.value = String(DEFAULT_INVENTORY_ID);
    const savedField = sessionStorage.getItem(FIELD_STORAGE);
    const fieldEl = document.getElementById('fieldId');
    if (savedField && fieldEl) {
      const opt = Array.from(fieldEl.options).find(o => o.value === savedField);
      if (opt) fieldEl.value = savedField;
    }
    const loginScreen = document.getElementById('loginScreen');
    const dashboard = document.getElementById('dashboard');
    if (loginScreen && dashboard) {
      loginScreen.classList.add('hidden');
      dashboard.classList.remove('hidden');
    }
    const apiRow = document.getElementById('apiSetupRow');
    if (apiRow) apiRow.classList.add('hidden');
    // krok 2 (pravidla) zůstává skrytý, otevírá se tlačítkem Settings
    document.getElementById('step3').classList.remove('hidden');
    // Auto-load katalogu i po refreshi, pokud je uživatel přihlášen
    const btnLoad = document.getElementById('btnLoadCatalogList');
    if (btnLoad) btnLoad.click();
  }

  // —— Cleaning logic ——
  function parseAllowedTags(str) {
    return new Set(str.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  }
  function parseOrphanPhrases(str) {
    return str.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  function cleanDescription(html, allowedTagsSet, orphanPhrases, tableToList) {
    if (!html || typeof html !== 'string') return '';
    const trimmed = html.trim();
    if (!trimmed) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString('<div id="_r">' + trimmed + '</div>', 'text/html');
    const root = doc.getElementById('_r');
    if (!root) return trimmed;

    function getText(el) {
      return (el && (el.textContent || '').trim()) || '';
    }
    function containsOrphan(text) {
      const t = ((text || '').trim()).toLowerCase();
      return orphanPhrases.some(p => t.includes((p || '').toLowerCase()));
    }

    const toRemove = new Set();
    // Pomocná: přidá bloky za obrázkem/tabulkou – projde až 8 následujících sourozenců a odstraní ty s sirotčí frází
    function markCaptionAfter(block) {
      if (!block || block === root) return;
      let el = block.nextElementSibling;
      let count = 0;
      while (el && count < 8) {
        if (containsOrphan(getText(el))) {
          toRemove.add(el);
          break;
        }
        el = el.nextElementSibling;
        count++;
      }
    }
    // Obrázek může být v <p><a><img></a></p> – rodič je <a>, ten nemá nextElementSibling; musíme jít na blok (<p>)
    function getBlockAncestor(el) {
      while (el && el !== root) {
        if (el.nextElementSibling != null) return el;
        el = el.parentElement;
      }
      return el && el !== root ? el : null;
    }
    root.querySelectorAll('img').forEach(el => {
      toRemove.add(el);
      const parent = el.parentElement;
      const prev = el.previousElementSibling;
      const next = el.nextElementSibling;
      if (parent && parent !== root && containsOrphan(getText(parent))) toRemove.add(parent);
      if (prev && containsOrphan(getText(prev))) toRemove.add(prev);
      if (next && containsOrphan(getText(next))) toRemove.add(next);
      const block = getBlockAncestor(parent);
      markCaptionAfter(block);
      if (parent && parent.tagName === 'A') toRemove.add(parent);
    });
    root.querySelectorAll('table').forEach(el => {
      if (!tableToList) toRemove.add(el);
      const parent = el.parentElement;
      const prev = el.previousElementSibling;
      const next = el.nextElementSibling;
      if (parent && parent !== root && containsOrphan(getText(parent))) toRemove.add(parent);
      if (prev && containsOrphan(getText(prev))) toRemove.add(prev);
      if (next && containsOrphan(getText(next))) toRemove.add(next);
      markCaptionAfter(getBlockAncestor(parent));
    });

    const byDepth = Array.from(toRemove);
    byDepth.sort((a, b) => {
      let d = 0, x = a; while (x && x.parentElement) { x = x.parentElement; d++; }
      let e = 0, y = b; while (y && y.parentElement) { y = y.parentElement; e++; }
      return d - e;
    });
    byDepth.forEach(el => {
      if (el.parentNode) el.remove();
    });

    if (tableToList) {
      root.querySelectorAll('table').forEach(table => {
        const ul = doc.createElement('ul');
        table.querySelectorAll('tr').forEach(tr => {
          const li = doc.createElement('li');
          const parts = [];
          tr.querySelectorAll('td, th').forEach(cell => parts.push(cell.textContent.trim()));
          li.textContent = parts.join(' – ');
          ul.appendChild(li);
        });
        table.parentNode.replaceChild(ul, table);
      });
    }

    root.querySelectorAll('*').forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (!allowedTagsSet.has(tag)) {
        const frag = doc.createDocumentFragment();
        while (el.firstChild) frag.appendChild(el.firstChild);
        el.parentNode.replaceChild(frag, el);
      } else {
        while (el.attributes.length) el.removeAttribute(el.attributes[0].name);
      }
    });

    const emptyBlockTags = ['p', 'div'];
    emptyBlockTags.forEach(tag => {
      root.querySelectorAll(tag).forEach(el => {
        if (!(el.textContent || '').trim() && el.parentNode) el.remove();
      });
    });

    // Obalit holé textové uzly (přímé potomky root) do <p>, aby BaseLinker nedostal text bez tagu
    const bareTextNodes = [];
    for (let i = 0; i < root.childNodes.length; i++) {
      const n = root.childNodes[i];
      if (n.nodeType === Node.TEXT_NODE) {
        const t = (n.textContent || '').trim();
        if (t) bareTextNodes.push({ node: n, text: t });
      }
    }
    bareTextNodes.forEach(function (item) {
      const p = doc.createElement('p');
      p.textContent = item.text;
      if (item.node.parentNode) item.node.parentNode.replaceChild(p, item.node);
    });

    let result = root.innerHTML.trim() || '';
    result = result.replace(/\&nbsp;/g, ' ').replace(/\u00A0/g, ' ');
    return result;
  }

  const CLEAN_PAGE_SIZE = 20;
  let cleanCurrentPage = 1;

  function getFilteredCleanList() {
    const idFilterEl = document.getElementById('filterCleanId');
    const nameFilterEl = document.getElementById('filterCleanName');
    const idFilter = idFilterEl ? (idFilterEl.value || '').trim().toLowerCase() : '';
    const nameFilter = nameFilterEl ? (nameFilterEl.value || '').trim().toLowerCase() : '';
    return (products || []).filter(function (p) {
      if (idFilter && String(p.itemId || '').toLowerCase().indexOf(idFilter) === -1) return false;
      if (nameFilter && String(p.name || '').toLowerCase().indexOf(nameFilter) === -1) return false;
      return true;
    });
  }

  function getFilteredCleanPage() {
    const filtered = getFilteredCleanList();
    const totalPages = Math.max(1, Math.ceil(filtered.length / CLEAN_PAGE_SIZE));
    const page = Math.min(Math.max(1, cleanCurrentPage), totalPages);
    const start = (page - 1) * CLEAN_PAGE_SIZE;
    return {
      page,
      totalPages,
      rows: filtered.slice(start, start + CLEAN_PAGE_SIZE),
      total: filtered.length,
    };
  }

  function updateCleanPagination(page, totalPages, total) {
    const infoEl = document.getElementById('cleanPageInfo');
    const prevBtn = document.getElementById('btnCleanPrev');
    const nextBtn = document.getElementById('btnCleanNext');
    if (infoEl) infoEl.textContent = 'Stránka ' + page + ' z ' + totalPages + ' (celkem ' + total + ' produktů)';
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  function renderTable(productsList) {
    products = productsList;
    const tbody = document.getElementById('productsTableBody');
    tbody.innerHTML = '';

    const { page, totalPages, rows, total } = getFilteredCleanPage();
    cleanCurrentPage = page;

    rows.forEach((p, i) => {
      const globalIndex = products.indexOf(p);
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input type="checkbox" class="row-check" data-index="' + globalIndex + '"></td>' +
        '<td>' + escapeHtml(p.itemId) + '</td>' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td><div class="preview-html">' + escapeHtml(p.originalHtml.slice(0, 300)) + (p.originalHtml.length > 300 ? '…' : '') + '</div></td>' +
        '<td><div class="preview-html">' + escapeHtml(p.cleanedHtml.slice(0, 300)) + (p.cleanedHtml.length > 300 ? '…' : '') + '</div></td>';
      tbody.appendChild(tr);
    });
    document.getElementById('productsTableWrap').classList.remove('hidden');
    updateCleanPagination(page, totalPages, total);
    document.getElementById('checkAll').checked = false;
    tbody.querySelectorAll('.row-check').forEach(cb => {
      cb.addEventListener('change', updateCheckAllState);
    });
  }

  function getSelectedIndices() {
    return Array.from(document.querySelectorAll('.row-check:checked')).map(cb => parseInt(cb.getAttribute('data-index'), 10));
  }

  function updateCheckAllState() {
    const all = document.querySelectorAll('.row-check');
    const checked = document.querySelectorAll('.row-check:checked');
    const checkAll = document.getElementById('checkAll');
    if (!checkAll) return;
    checkAll.checked = all.length > 0 && checked.length === all.length;
    checkAll.indeterminate = checked.length > 0 && checked.length < all.length;
  }

  document.getElementById('checkAll').addEventListener('change', function () {
    document.querySelectorAll('.row-check').forEach(cb => { cb.checked = this.checked; });
    this.indeterminate = false;
  });

  const filterCleanIdInput = document.getElementById('filterCleanId');
  if (filterCleanIdInput) {
    filterCleanIdInput.addEventListener('input', function () {
      cleanCurrentPage = 1;
      renderTable(products);
    });
  }
  const filterCleanNameInput = document.getElementById('filterCleanName');
  if (filterCleanNameInput) {
    filterCleanNameInput.addEventListener('input', function () {
      cleanCurrentPage = 1;
      renderTable(products);
    });
  }

  const btnCleanPrev = document.getElementById('btnCleanPrev');
  if (btnCleanPrev) {
    btnCleanPrev.addEventListener('click', function () {
      const { totalPages } = getFilteredCleanPage();
      if (cleanCurrentPage > 1) {
        cleanCurrentPage--;
        renderTable(products);
      }
    });
  }
  const btnCleanNext = document.getElementById('btnCleanNext');
  if (btnCleanNext) {
    btnCleanNext.addEventListener('click', function () {
      const { totalPages } = getFilteredCleanPage();
      if (cleanCurrentPage < totalPages) {
        cleanCurrentPage++;
        renderTable(products);
      }
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function buildChannelTextFields(cleanedHtml) {
    const textFields = {};
    const fieldId = getFieldId();
    if (fieldId) textFields[fieldId] = cleanedHtml;
    return textFields;
  }

  // —— UI: reClean – přepočítá cleanedHtml pro vybrané / všechny produkty (používá existující cleanDescription) ——
  function reClean(indices) {
    if (!products.length) return;
    const allowedTagsSet = parseAllowedTags(document.getElementById('allowedTags').value);
    const orphanPhrases = parseOrphanPhrases(document.getElementById('orphanPhrases').value);
    const tableToList = document.getElementById('tableToList').checked;
    const target = Array.isArray(indices) && indices.length ? indices : products.map((_, i) => i);
    target.forEach(i => {
      const p = products[i];
      if (!p) return;
      p.cleanedHtml = cleanDescription(p.originalHtml, allowedTagsSet, orphanPhrases, tableToList);
    });
    renderTable(products);
  }

  // —— Settings: zobrazit / skrýt kartu s pravidly čištění jako „nastavení“ ——
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  if (btnOpenSettings) {
    btnOpenSettings.addEventListener('click', function () {
      const modal = document.getElementById('settingsModal');
      if (!modal) return;
      modal.classList.remove('hidden');
    });
  }

  const btnCloseSettings = document.getElementById('btnCloseSettings');
  if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', function () {
      const modal = document.getElementById('settingsModal');
      if (!modal) return;
      modal.classList.add('hidden');
    });
  }

  async function syncProductsBatchedByIndices(indices, msgElId) {
    const msgId = msgElId || 'msgSync';
    if (!Array.isArray(indices) || !indices.length) {
      showMsg(msgId, 'Žádné produkty k synchronizaci.', 'error');
      return;
    }

    const fieldId = getFieldId();
    if (!fieldId) {
      showMsg(msgId, 'Vyberte kanál (fieldId) v nastavení.', 'error');
      return;
    }

    const selectedProducts = indices
      .map(function (i) { return products[i]; })
      .filter(function (p) { return !!p; });

    let skippedHtml = 0;
    const toSend = [];

    selectedProducts.forEach(function (p) {
      const alreadyHasHtml = hasHtmlContent(p.originalHtml);
      const changedSinceLast = !p.lastSyncedHtml || p.cleanedHtml !== p.lastSyncedHtml;

      // Smart skip: produkt už má HTML a zároveň nedošlo k žádné nové změně
      if (alreadyHasHtml && !changedSinceLast) {
        skippedHtml++;
        return;
      }

      // Pokud se nic nezměnilo oproti poslední synchronizaci, nemá smysl znovu odesílat
      if (!changedSinceLast) {
        return;
      }

      toSend.push(p);
    });

    console.log('[Sync] Přeskočeno ' + skippedHtml + ' produktů (již mají HTML).');
    console.log('[Sync] Připraveno k odeslání ' + toSend.length + ' produktů.');

    if (!toSend.length) {
      showMsg(msgId, 'Žádné produkty k odeslání po filtrování (vše již má HTML nebo beze změny).', 'info');
      return;
    }

    const inventoryId = parseInt(getInventoryId(), 10) || DEFAULT_INVENTORY_ID;
    const totalToSend = toSend.length;
    const totalBatches = Math.ceil(totalToSend / SYNC_BATCH_SIZE);
    let sentOk = 0;
    let sentErr = 0;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchProducts = toSend.slice(batchIndex * SYNC_BATCH_SIZE, (batchIndex + 1) * SYNC_BATCH_SIZE);
      const currentBatch = batchIndex + 1;

      console.log('[Sync] Začínám dávku ' + currentBatch + '/' + totalBatches + ' (' + batchProducts.length + ' produktů)…');
      showMsg(msgId, 'Odesílám dávku ' + currentBatch + '/' + totalBatches + ' (' + batchProducts.length + ' produktů)…', 'info');

      for (let i = 0; i < batchProducts.length; i++) {
        const p = batchProducts[i];
        if (!p) continue;

        const globalIndex = batchIndex * SYNC_BATCH_SIZE + i + 1;
        const remaining = totalToSend - globalIndex;

        console.log('[Sync] Čistím a odesílám produkt ' + p.itemId + ' (' + globalIndex + '/' + totalToSend + '), zbývá ' + remaining + '.');

        const params = {
          inventory_id: inventoryId,
          product_id: p.itemId,
          text_fields: buildChannelTextFields(p.cleanedHtml),
        };

        let retried429 = false;
        while (true) {
          try {
            const data = await callBaseLinker('addInventoryProduct', params);
            if (data && data.status === 'SUCCESS') {
              sentOk++;
              p.wasSynced = true;
              p.lastSyncedHtml = p.cleanedHtml;
            } else {
              sentErr++;
              console.error('[Sync] Chyba při odesílání produktu ' + p.itemId + ':', data);
              showMsg(
                msgId,
                'Chyba při odesílání produktu ' + p.itemId + ': ' + ((data && (data.error_message || data.error)) || 'Chyba API'),
                'error'
              );
            }
            break;
          } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            if ((/429/.test(msg) || /Too Many Requests/i.test(msg)) && !retried429) {
              retried429 = true;
              console.warn('[Sync] 429 Too Many Requests pro produkt ' + p.itemId + '. Čekám ' + (SYNC_RETRY_AFTER_429_MS / 1000) + ' s a zkouším znovu…');
              showMsg(
                msgId,
                'BaseLinker vrátil 429 Too Many Requests pro produkt ' + p.itemId + '. Čekám 30 s a zkouším znovu…',
                'error'
              );
              await sleep(SYNC_RETRY_AFTER_429_MS);
              continue;
            } else if (/429/.test(msg) || /Too Many Requests/i.test(msg)) {
              console.error('[Sync] 429 Too Many Requests pro produkt ' + p.itemId + ' i po opakování:', e);
              showMsg(
                msgId,
                'Druhá chyba 429 Too Many Requests pro produkt ' + p.itemId + ': ' + wrapFetchError(e),
                'error'
              );
              throw e;
            } else {
              sentErr++;
              console.error('[Sync] Chyba při odesílání produktu ' + p.itemId + ':', e);
              showMsg(
                msgId,
                'Chyba při odesílání produktu ' + p.itemId + ': ' + wrapFetchError(e),
                'error'
              );
              break;
            }
          }
        }

        // Pauza mezi jednotlivými requesty kvůli rate limitu (100 requestů / min)
        if (globalIndex < totalToSend) {
          await sleep(SYNC_RATE_DELAY_MS);
        }
      }

      console.log('[Sync] Dávka ' + currentBatch + '/' + totalBatches + ' dokončena.');
    }

    showMsg(
      msgId,
      'Synchronizace dokončena. Odesláno ' + sentOk + ' produktů, ' + sentErr + ' chyb, přeskočeno ' + skippedHtml + '.',
      sentErr ? 'error' : 'success'
    );
  }

  async function syncOne(index, msgElId) {
    const msgId = msgElId || 'msgSync';
    const p = products[index];
    if (!p) return;
    if (!getToken()) {
      showMsg(msgId, 'Vyplňte BaseLinker token v kroku 1.', 'error');
      return;
    }
        const textFields = buildChannelTextFields(p.cleanedHtml);
        const fieldId = getFieldId();
        const params = {
          inventory_id: parseInt(getInventoryId(), 10) || DEFAULT_INVENTORY_ID,
          product_id: p.itemId,
          text_fields: textFields,
        };
        console.log('[Sync] Klik na Synchronizovat – odesílám addInventoryProduct:', {
          method: 'addInventoryProduct',
          inventory_id: params.inventory_id,
          product_id: params.product_id,
          text_fields_keys: Object.keys(params.text_fields),
          text_fields_preview: fieldId ? { [fieldId]: (params.text_fields[fieldId] || '').slice(0, 100) + ((params.text_fields[fieldId] || '').length > 100 ? '…' : '') } : {},
        });
        try {
          const data = await callBaseLinker('addInventoryProduct', params);
          console.log('[Sync] Odpověď BaseLinker:', data);
          if (data.status === 'SUCCESS') {
            showMsg(msgId, 'Produkt ' + p.itemId + ' synchronizován do vybraného kanálu.', 'success');
      } else {
        showMsg(msgId, (data.error_message || data.error || 'Chyba') + ' (produkt ' + p.itemId + ')', 'error');
      }
    } catch (e) {
      console.error('[Sync] Chyba:', e);
      showMsg(msgId, 'Chyba: ' + wrapFetchError(e), 'error');
    }
  }

  // —— Synchronizace: vybrané / všechny produkty ——
  const btnSyncSelected = document.getElementById('btnSyncSelected');
  if (btnSyncSelected) {
    btnSyncSelected.addEventListener('click', async function () {
      if (!getToken()) {
        showMsg('msgSync', 'Vyplňte BaseLinker token v kroku 1.', 'error');
        return;
      }
      const rawIndices = getSelectedIndices();
      if (!rawIndices.length) {
        showMsg('msgSync', 'Zaškrtněte alespoň jeden produkt.', 'error');
        return;
      }
      // přepočítat cleanedHtml podle aktuálních pravidel jen pro vybrané produkty
      reClean(rawIndices);
      this.disabled = true;
      try {
        await syncProductsBatchedByIndices(rawIndices, 'msgSync');
      } catch (e) {
        // chyba je již zalogovaná uvnitř syncProductsBatchedByIndices
      } finally {
        this.disabled = false;
      }
    });
  }

  const btnSyncAll = document.getElementById('btnSyncAll');
  if (btnSyncAll) {
    btnSyncAll.addEventListener('click', async function () {
      if (!getToken()) {
        showMsg('msgSync', 'Vyplňte BaseLinker token v kroku 1.', 'error');
        return;
      }
      if (!products.length) {
        showMsg('msgSync', 'Žádné produkty k synchronizaci.', 'error');
        return;
      }

      const allIndices = products.map(function (_, i) { return i; });
      // přepočítat cleanedHtml pro všechny produkty
      reClean(allIndices);

      const button = this;
      button.disabled = true;

      try {
        await syncProductsBatchedByIndices(allIndices, 'msgSync');
      } catch (e) {
        // chyba je již zalogovaná uvnitř syncProductsBatchedByIndices
      } finally {
        button.disabled = false;
      }
    });
  }
})();
