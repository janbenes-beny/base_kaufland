# Čištění produktových popisů (Heureka XML → BaseLinker)

Webová aplikace pro vyčištění popisů z Heureka XML a synchronizaci do BaseLinker API.  
Dokumentace BaseLinker: [https://api.baselinker.com/](https://api.baselinker.com/).

---

## Kroky v aplikaci

### 1. API Setup
- **BaseLinker API token** – z BaseLinker: Účet a další → Můj účet → API (X-BLToken).
- **INVENTORY_ID** – ID katalogu (např. z metody `getInventories`).
- **FIELD_ID** – klíč pole popisu pro daný kanál (např. `description`, nebo `description|cs|kaufland_0` pro konkrétní integraci).
- Tlačítko **„Testovat spojení“** zavolá `getInventoryAvailableTextFieldKeys`. Při úspěchu se token uloží do `sessionStorage` a zpřístupní se další kroky.

### 2. Pravidla čištění (editovatelné)
- **Allowed Tags** – povolené HTML tagy (p, br, b, strong, i, em, u, h3, h4, h5, ul, ol, li, span).
- **Orphan Phrases (sirotci)** – pokud odstavec obsahuje tyto fráze a v blízkosti je smazán `<img>` nebo `<table>`, odstraní se celý odstavec (předvyplněno: tabulka velikostí, orientační tabulka, velikostní tabulka).
- **Table Logic** – přepínač „Převést tabulky na seznamy“ (table/tr/td → ul/li).

### 3. Zpracování
- Nahrání **XML souboru** (Heureka formát) nebo zadání **URL feedu**.
- Transformace podle pravidel: odstranění nepovolených tagů, odstranění atributů (class, style, href, src), převod tabulek na seznamy (pokud zapnuto), odstranění „sirotků“.
- Tabulka produktů: **ID**, **Název**, **Původní HTML (náhled)**, **Nové HTML (náhled)**, tlačítko **Sync** u každého řádku + **Sync vše do BaseLinker**.

### 4. BaseLinker Sync
- Po kliknutí na **Sync** se pro daný produkt zavolá metoda **addInventoryProduct** s parametrem `text_fields`: `{ [FIELD_ID]: vyčištěný HTML }`. Produkt je identifikován pomocí **product_id** z Heureka `ITEM_ID`.

---

## Nasazení na Netlify

1. [Netlify](https://app.netlify.com/) → **Add new site** → **Import an existing project** (Git).
2. **Build settings:** Build command prázdný, **Publish directory:** `.`
3. **Deploy** – žádné povinné env proměnné; token a ID zadává uživatel v aplikaci.

Funkce **`netlify/functions/baselinker.js`** slouží jako proxy k BaseLinker API (CORS, bez vystavení tokenu z prohlížeče přímo třetí straně z vaší domény).

---

## Lokální vývoj

```bash
npm install -g netlify-cli
netlify dev
```

Otevře se lokální server; volání na `/.netlify/functions/baselinker` poběží lokálně.

---

## Soubory

| Soubor | Účel |
|--------|------|
| `index.html` | Wizard: API Setup, Cleaning Rules, Processing, tabulka produktů, Sync |
| `netlify/functions/baselinker.js` | Proxy POST na BaseLinker `connector.php` (token, method, parameters) |

Původní Python/Streamlit verze a funkce auth/import-feed zůstávají v repozitáři pro případné další použití.
