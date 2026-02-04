# Heureka → Kaufland XML čistička

Webová aplikace pro vyčištění produktového XML feedu (Heureka.cz) pro Kaufland marketplace. Obsahuje **přihlášení** a **import z API** (Base / feed URL).

---

## Lokální použití (soubor)

1. Otevřete **`index.html`** v prohlížeči.
2. Přihlaste se (viz níže – na lokálním souboru bez Netlify Functions přihlášení selže; použijte nasazení na Netlify).
3. Nahrajte XML nebo použijte „Import z API“.

**Poznámka:** Přihlášení a Import z API fungují až po nasazení na Netlify (nebo při lokálním běhu `netlify dev`).

---

## Nasazení na Netlify

1. Účet na [Netlify](https://app.netlify.com/), přihlášení.
2. **New site from Git** – propojte repozitář (GitHub/GitLab/Bitbucket) s tímto projektem.
3. Nastavení buildu:
   - **Build command:** (prázdné)
   - **Publish directory:** `.` (nebo nechte výchozí, pokud je v kořenu `index.html`)
   - **Functions directory:** `netlify/functions` (Netlify ho často detekuje sám z `netlify.toml`)

4. **Environment variables** (Site settings → Environment variables):

   | Proměnná           | Povinné | Popis |
   |--------------------|--------|--------|
   | `LOGIN_USER`      | ano    | Uživatelské jméno pro přihlášení |
   | `LOGIN_PASSWORD`  | ano    | Heslo pro přihlášení |
   | `AUTH_SECRET`     | doporučeno | Tajný klíč pro podpis tokenů (jinak se použije `LOGIN_PASSWORD`) |
   | `HEUREKA_FEED_URL` nebo `FEED_URL` | ne* | URL XML feedu (Heureka / Base API) |
   | `HEUREKA_API_KEY` nebo `FEED_API_KEY` | ne | API klíč pro přístup k feedu (pokud feed vyžaduje) |

   \* Pokud není nastaveno, uživatel může v aplikaci zadat **Vlastní feed URL** a **API klíč** v záložce „Import z API“.

5. **Deploy** – po uložení nastavení proběhne deploy; aplikace bude dostupná na adrese typu `https://váš-projekt.netlify.app`.

---

## Přihlášení a Import z API

- **Přihlášení:** Na úvodní stránce zadejte uživatel a heslo nastavené v `LOGIN_USER` a `LOGIN_PASSWORD`. Po úspěchu se zobrazí hlavní aplikace.
- **Import z API:** V záložce „Import z API“ můžete:
  - Stáhnout feed z **nakonfigurované URL** (proměnné `HEUREKA_FEED_URL`, `FEED_API_KEY`), nebo
  - Zadat **vlastní feed URL** a volitelně **API klíč** a stáhnout feed přes backend (Netlify Function), který obchází CORS a drží klíč na serveru.
- **Odhlášení:** Tlačítko „Odhlásit se“ vpravo nahoře.

---

## Lokální vývoj s funkcemi (Netlify CLI)

```bash
npm install -g netlify-cli
netlify dev
```

Prohlížeč otevře lokální adresu; volání na `/.netlify/functions/auth` a `/.netlify/functions/import-feed` budou obsloužena lokálně. Env proměnné nastavte v souboru `.env` (necommitujte):

```env
LOGIN_USER=admin
LOGIN_PASSWORD=vaso-heslo
AUTH_SECRET=nahodny-tajny-klic
HEUREKA_FEED_URL=https://vase-feed-url.cz/feed.xml
HEUREKA_API_KEY=volitelne
```

---

## Python verze (Streamlit)

Bez přihlášení a API, pouze lokální nahrání souboru:

```bash
pip install -r requirements.txt
streamlit run app.py
```
"# base_kaufland" 
