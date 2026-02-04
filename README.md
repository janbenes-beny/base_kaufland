# Čištění produktových popisů (Heureka XML → BaseLinker)

Webová aplikace pro vyčištění popisů z Heureka XML a synchronizaci do BaseLinker API.  
Dokumentace BaseLinker: [https://api.baselinker.com/](https://api.baselinker.com/).

Obsahuje také **přihlášení** a **import z API** (feed URL) pro variantu Heureka → Kaufland.

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
3. **Functions directory:** `netlify/functions` (často detekováno z `netlify.toml`).

**Environment variables** (Site settings → Environment variables):

| Proměnná           | Povinné | Popis |
|--------------------|--------|--------|
| `LOGIN_USER`      | ano*   | Uživatelské jméno pro přihlášení |
| `LOGIN_PASSWORD`  | ano*   | Heslo pro přihlášení |
| `AUTH_SECRET`     | doporučeno | Tajný klíč pro podpis tokenů (jinak se použije `LOGIN_PASSWORD`) |
| `HEUREKA_FEED_URL` nebo `FEED_URL` | ne | URL XML feedu (Heureka / Base API) |
| `HEUREKA_API_KEY` nebo `FEED_API_KEY` | ne | API klíč pro přístup k feedu |

\* Pro BaseLinker wizard bez přihlášení lze nechat prázdné; token a ID zadává uživatel v aplikaci. Pro přihlášení a Import z API jsou `LOGIN_USER` a `LOGIN_PASSWORD` povinné.

Funkce **`netlify/functions/baselinker.js`** slouží jako proxy k BaseLinker API (CORS). Funkce **auth.js** a **import-feed.js** obsluhují přihlášení a stahování feedu z API.

---

## Přihlášení a Import z API

- **Přihlášení:** Na úvodní stránce zadejte uživatel a heslo nastavené v `LOGIN_USER` a `LOGIN_PASSWORD`. Po úspěchu se zobrazí hlavní aplikace.
- **Import z API:** V záložce „Import z API“ můžete stáhnout feed z nakonfigurované URL (`HEUREKA_FEED_URL`, `FEED_API_KEY`) nebo zadat **vlastní feed URL** a volitelně **API klíč** (backend obchází CORS a drží klíč na serveru).
- **Odhlášení:** Tlačítko „Odhlásit se“ vpravo nahoře.

**Poznámka:** Přihlášení a Import z API fungují až po nasazení na Netlify (nebo při lokálním běhu `netlify dev`).

---

## Lokální vývoj

```bash
npm install -g netlify-cli
netlify dev
```

Otevře se lokální server; volání na `/.netlify/functions/baselinker`, `/.netlify/functions/auth` a `/.netlify/functions/import-feed` poběží lokálně. Env proměnné nastavte v souboru `.env` (necommitujte), viz `.env.example`:

```env
LOGIN_USER=admin
LOGIN_PASSWORD=vaso-heslo
AUTH_SECRET=nahodny-tajny-klic
HEUREKA_FEED_URL=https://vase-feed-url.cz/feed.xml
HEUREKA_API_KEY=volitelne
```

---

## Soubory

| Soubor | Účel |
|--------|------|
| `index.html` | Wizard: API Setup, Cleaning Rules, Processing, tabulka produktů, Sync |
| `netlify/functions/baselinker.js` | Proxy POST na BaseLinker `connector.php` (token, method, parameters) |
| `netlify/functions/auth.js` | Přihlášení, vydání JWT tokenu |
| `netlify/functions/import-feed.js` | Stahování Heureka feedu (s Bearer tokenem) |

Python/Streamlit verze (`app.py`) zůstává v repozitáři pro lokální vyčištění XML bez přihlášení a API.

---

## Python verze (Streamlit)

Bez přihlášení a API, pouze lokální nahrání souboru:

```bash
pip install -r requirements.txt
streamlit run app.py
```

---
