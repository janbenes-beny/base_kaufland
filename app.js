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
  let lastLoadedProductData = null; // { productId, product } po Načíst informace o produktu
  const BL_STORAGE = 'bl_token';
  const INV_STORAGE = 'bl_inventory_id';
  const FIELD_STORAGE = 'bl_field_id';

  const DEFAULT_INVENTORY_ID = 5257;
  const CATALOG_PAGE_SIZE = 20;   // produktů na jedné stránce tabulky
  const CATALOG_API_PAGE_SIZE = 1000; // BaseLinker vrací max 1000 na stránku
  const CATALOG_MAX_PAGES = 10;   // max počet API stránek (10 × 1000 = 10 000 produktů)
  let catalogList = [];           // [{ itemId, name, ean, sku }]
  let catalogCurrentPage = 1;
  let catalogSelectedIds = new Set(); // vybraná ID napříč stránkami

  function getToken() { return sessionStorage.getItem(BL_STORAGE) || document.getElementById('blToken').value.trim(); }
  function getInventoryId() { return sessionStorage.getItem(INV_STORAGE) || document.getElementById('inventoryId').value.trim(); }
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

  // —— Ověřit spojení ——
  document.getElementById('btnVerifyConnection').addEventListener('click', async function () {
    const token = document.getElementById('blToken').value.trim();
    const inventoryId = document.getElementById('inventoryId').value.trim();
    const fieldId = document.getElementById('fieldId').value;
    if (!token || !inventoryId) {
      showMsg('msg1', 'Vyplňte token a INVENTORY_ID.', 'error');
      return;
    }
    this.disabled = true;
    showMsg('msg1', '', '');
    try {
      const data = await callBaseLinker('getInventoryAvailableTextFieldKeys', { inventory_id: parseInt(inventoryId, 10) });
      if (data.status === 'SUCCESS') {
        sessionStorage.setItem(BL_STORAGE, token);
        sessionStorage.setItem(INV_STORAGE, inventoryId);
        sessionStorage.setItem(FIELD_STORAGE, fieldId);
        showMsg('msg1', 'Spojení v pořádku.', 'success');
        document.getElementById('step2').classList.remove('hidden');
        document.getElementById('step3').classList.remove('hidden');
      } else {
        showMsg('msg1', (data.error_message || data.error || 'Chyba API') + (data.error_code ? ' (kód: ' + data.error_code + ')' : ''), 'error');
      }
    } catch (e) {
      showMsg('msg1', 'Chyba: ' + wrapFetchError(e), 'error');
    } finally {
      this.disabled = false;
    }
  });

  // —— Načíst produkt podle ID (getInventoryProductsData) ——
  document.getElementById('btnGetProductInfo').addEventListener('click', async function () {
    const token = getToken();
    const inventoryId = getInventoryId() || String(DEFAULT_INVENTORY_ID);
    const productIdStr = document.getElementById('testProductId').value.trim();
    if (!token) {
      showMsg('msg1', 'Vyplňte BaseLinker token.', 'error');
      return;
    }
    if (!productIdStr) {
      showMsg('msg1', 'Zadejte Product ID.', 'error');
      return;
    }
    const productId = parseInt(productIdStr, 10);
    if (isNaN(productId)) {
      showMsg('msg1', 'Product ID musí být číslo.', 'error');
      return;
    }
    this.disabled = true;
    document.getElementById('productInfoWrap').classList.add('hidden');
    document.getElementById('productInfoOutput').textContent = 'Načítám…';
    document.getElementById('productInfoWrap').classList.remove('hidden');
    try {
      const data = await callBaseLinker('getInventoryProductsData', {
        inventory_id: parseInt(inventoryId, 10),
        products: [productId],
      });
      const out = document.getElementById('productInfoOutput');
      out.textContent = JSON.stringify(data, null, 2);
      document.getElementById('productInfoWrap').classList.remove('hidden');
      if (data.status === 'SUCCESS' && data.products && data.products[String(productId)]) {
        lastLoadedProductData = { productId: productId, product: data.products[String(productId)] };
        document.getElementById('btnEditProduct').classList.remove('hidden');
      } else {
        lastLoadedProductData = null;
        document.getElementById('btnEditProduct').classList.add('hidden');
      }
      if (data.status !== 'SUCCESS') {
        showMsg('msg1', (data.error_message || data.error || 'Chyba API') + (data.error_code ? ' (kód: ' + data.error_code + ')' : ''), 'error');
      }
    } catch (e) {
      const errText = wrapFetchError(e);
      document.getElementById('productInfoOutput').textContent = 'Chyba: ' + errText;
      showMsg('msg1', 'Chyba: ' + errText, 'error');
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
      for (let apiPage = 1; apiPage <= CATALOG_MAX_PAGES; apiPage++) {
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
        if (Object.keys(data.products).length < CATALOG_API_PAGE_SIZE) break;
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

  function getNameFromTextFields(textFields) {
    if (!textFields || typeof textFields !== 'object') return '';
    const n = textFields['name'] || textFields['name|cs'];
    if (typeof n === 'string') return n.trim();
    return '';
  }

  document.getElementById('btnEditProduct').addEventListener('click', function () {
    if (!lastLoadedProductData) return;
    const { productId, product } = lastLoadedProductData;
    const tf = product.text_fields || {};
    const originalHtml = getDescriptionFromTextFields(tf);
    const name = getNameFromTextFields(tf) || ('Produkt ' + productId);
    const allowedTagsSet = parseAllowedTags(document.getElementById('allowedTags').value);
    const orphanPhrases = parseOrphanPhrases(document.getElementById('orphanPhrases').value);
    const tableToList = document.getElementById('tableToList').checked;
    const cleanedHtml = cleanDescription(originalHtml, allowedTagsSet, orphanPhrases, tableToList);
    products = [{ itemId: String(productId), name: name, originalHtml: originalHtml, cleanedHtml: cleanedHtml }];
    const tbody = document.getElementById('productEditTableBody');
    tbody.innerHTML =
      '<tr>' +
      '<td>' + escapeHtml(String(productId)) + '</td>' +
      '<td>' + escapeHtml(name) + '</td>' +
      '<td><div class="preview-html">' + escapeHtml(originalHtml.slice(0, 300)) + (originalHtml.length > 300 ? '…' : '') + '</div></td>' +
      '<td><div class="preview-html">' + escapeHtml(cleanedHtml.slice(0, 300)) + (cleanedHtml.length > 300 ? '…' : '') + '</div></td>' +
      '<td><button type="button" class="btn" id="btnSyncEditedOne">Sync</button></td>' +
      '</tr>';
    document.getElementById('productEditTableWrap').classList.remove('hidden');
    document.getElementById('msgEditSync').classList.add('hidden');
    document.getElementById('btnSyncEditedOne').addEventListener('click', async function () {
      document.getElementById('msgEditSync').classList.remove('hidden');
      await syncOne(0, 'msgEditSync');
    });
  });

  document.getElementById('btnSyncEditedProduct').addEventListener('click', async function () {
    if (products.length === 0) return;
    document.getElementById('msgEditSync').classList.remove('hidden');
    await syncOne(0, 'msgEditSync');
  });

  function copyToClipboard(text, msgElId) {
    const msgId = msgElId || 'msgEditSync';
    if (!text) { showMsg(msgId, 'Nic ke zkopírování.', 'error'); return; }
    navigator.clipboard.writeText(text).then(() => {
      showMsg(msgId, 'Zkopírováno do schránky.', 'success');
    }).catch(() => {
      showMsg(msgId, 'Kopírování se nepovedlo.', 'error');
    });
  }

  document.getElementById('btnCopyOriginalHtml').addEventListener('click', function () {
    if (products.length === 0) return;
    document.getElementById('msgEditSync').classList.remove('hidden');
    copyToClipboard(products[0].originalHtml, 'msgEditSync');
  });
  document.getElementById('btnCopyNewHtml').addEventListener('click', function () {
    if (products.length === 0) return;
    document.getElementById('msgEditSync').classList.remove('hidden');
    copyToClipboard(products[0].cleanedHtml, 'msgEditSync');
  });

  // Při načtení stránky obnovit krok 2 a 3 pokud už bylo ověření
  if (sessionStorage.getItem(BL_STORAGE)) {
    document.getElementById('inventoryId').value = sessionStorage.getItem(INV_STORAGE) || '';
    const savedField = sessionStorage.getItem(FIELD_STORAGE);
    const fieldEl = document.getElementById('fieldId');
    if (savedField && fieldEl) {
      const opt = Array.from(fieldEl.options).find(o => o.value === savedField);
      if (opt) fieldEl.value = savedField;
    }
    document.getElementById('step2').classList.remove('hidden');
    document.getElementById('step3').classList.remove('hidden');
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

  function renderTable(productsList) {
    products = productsList;
    const tbody = document.getElementById('productsTableBody');
    tbody.innerHTML = '';
    productsList.forEach((p, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input type="checkbox" class="row-check" data-index="' + i + '"></td>' +
        '<td>' + escapeHtml(p.itemId) + '</td>' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td><div class="preview-html">' + escapeHtml(p.originalHtml.slice(0, 300)) + (p.originalHtml.length > 300 ? '…' : '') + '</div></td>' +
        '<td><div class="preview-html">' + escapeHtml(p.cleanedHtml.slice(0, 300)) + (p.cleanedHtml.length > 300 ? '…' : '') + '</div></td>';
      tbody.appendChild(tr);
    });
    document.getElementById('productsTableWrap').classList.remove('hidden');
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

  document.getElementById('btnSyncSelected').addEventListener('click', async function () {
    if (!getToken()) {
      showMsg('msgSync', 'Vyplňte BaseLinker token v kroku 1.', 'error');
      return;
    }
    const indices = getSelectedIndices();
    if (indices.length === 0) {
      showMsg('msgSync', 'Zaškrtněte alespoň jeden produkt.', 'error');
      return;
    }
        if (indices.length > 5 && !confirm('Opravdu chcete aktualizovat ' + indices.length + ' produktů ve vybraném kanálu?')) {
      return;
    }
    this.disabled = true;
    console.log('[Sync] Sync vybrané – počet produktů:', indices.length, 'IDs:', indices.map(i => products[i].itemId));
        showMsg('msgSync', 'Synchronizuji ' + indices.length + ' vybraných produktů…', 'info');
    let ok = 0, err = 0;
    for (const i of indices) {
      const p = products[i];
        const textFields = buildChannelTextFields(p.cleanedHtml);
          const params = { inventory_id: parseInt(getInventoryId(), 10) || DEFAULT_INVENTORY_ID, product_id: p.itemId, text_fields: textFields };
      console.log('[Sync] Produkt ' + p.itemId + ' – odesílám addInventoryProduct', params);
      try {
        const data = await callBaseLinker('addInventoryProduct', params);
        console.log('[Sync] Produkt ' + p.itemId + ' – odpověď:', data);
        if (data.status === 'SUCCESS') ok++; else err++;
      } catch (e) {
        console.error('[Sync] Produkt ' + p.itemId + ' – chyba:', e);
        err++;
      }
    }
    console.log('[Sync] Hotovo: ' + ok + ' OK, ' + err + ' chyb.');
    showMsg('msgSync', 'Hotovo: ' + ok + ' OK, ' + err + ' chyb.', err ? 'error' : 'success');
    this.disabled = false;
  });

  document.getElementById('btnSyncSingle').addEventListener('click', async function () {
    const idStr = document.getElementById('singleProductId').value.trim();
    if (!idStr) {
      showMsg('msgSync', 'Zadejte Product ID.', 'error');
      return;
    }
    if (!getToken()) {
      showMsg('msgSync', 'Vyplňte BaseLinker token v kroku 1.', 'error');
      return;
    }
    const index = products.findIndex(p => String(p.itemId) === idStr);
    if (index === -1) {
      showMsg('msgSync', 'Produkt s ID „' + idStr + '“ není v načteném feedu. Načtěte XML a zkuste znovu.', 'error');
      return;
    }
    this.disabled = true;
    showMsg('msgSync', 'Synchronizuji produkt ' + idStr + '…', 'info');
    await syncOne(index);
    this.disabled = false;
  });
})();
