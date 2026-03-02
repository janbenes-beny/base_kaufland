# Čištění produktových popisů (BaseLinker → Kaufland)

Webová aplikace pro vyčištění produktových popisů a synchronizaci do BaseLinker API. Načítá produkty přímo z BaseLinker katalogu, čistí HTML popisy podle nastavených pravidel a odesílá je do vybraného kanálu (Kaufland, Sportisimo, Decathlon, Alza).

Dokumentace BaseLinker API: [https://api.baselinker.com/](https://api.baselinker.com/)

---

## Rychlý start

1. **Spusťte lokálně** (nebo nasaďte na Netlify):
   ```bash
   npm install -g netlify-cli
   netlify dev
   ```
2. Otevřete v prohlížeči adresu (např. `http://localhost:8888`)
3. Zadejte **BaseLinker API klíč** (X-BLToken) z BaseLinker → Účet → API
4. Po přihlášení se načte seznam produktů – vyberte produkty a synchronizujte

---

## Kroky v aplikaci

### 1. Přihlášení
- Zadejte **BaseLinker API Key** (X-BLToken)
- API klíč se uloží do `sessionStorage` – při příští návštěvě se automaticky přihlásíte
- **Odhlásit** – tlačítko vpravo nahoře vymaže uložený klíč a vrátí vás na přihlašovací obrazovku (užitečné pro přepnutí na jiný účet/klíč)

### 2. Seznam produktů
- Po přihlášení se automaticky načte katalog z BaseLinker
- Tabulka: **ID**, **EAN**, **Název** – u každého sloupce lze filtrovat
- Vyberte produkty zaškrtnutím a klikněte **„Připravit vybrané k čištění“** nebo **„Vyčistit celý seznam“**
- **„Zobrazit pouze nevyčištěné produkty“** – zúží seznam na produkty bez popisu v aktuálně vybraném kanálu

### 3. Nastavení (tlačítko Nastavení)
- **Kanál** – vyberte cílový kanál pro synchronizaci (Kaufland, Sportisimo, Decathlon, Alza)
- **Allowed Tags** – povolené HTML tagy (p, br, b, strong, i, em, ul, ol, li, …)
- **Orphan Phrases** – fráze, u kterých se odstraní celý blok vedle obrázku/tabulky (např. „tabulka velikostí“, „orientační tabulka“)
- **Převést tabulky na seznamy** – převede `<table>` na `<ul>/<li>`

### 4. Vyčištěné popisy a synchronizace
- Tabulka zobrazuje **původní HTML** a **nové HTML** – obě s posuvníkem pro prohlédnutí celého obsahu
- **Upravit** – tlačítko u každého řádku otevře modál, kde můžete:
  - upravit původní i nové HTML
  - přepínat mezi **náhledem (WYSIWYG)** a **zdrojovým HTML**
  - uložit změny zpět do tabulky
- **Synchronizovat vybrané** / **Synchronizovat vše** – odešle vyčištěné popisy do BaseLinker

---

## API limit (rate limit)

BaseLinker API má limit **přibližně 100 požadavků za minutu**. Aplikace to respektuje:

| Nastavení | Hodnota | Popis |
|-----------|---------|-------|
| Pauza mezi requesty | 700 ms | Po každém odeslaném produktu se čeká 0,7 s před dalším |
| Chyba 429 (Too Many Requests) | 30 s pauza | Pokud BaseLinker vrátí 429, aplikace počká 30 sekund a zkusí znovu |

**Doporučení:** Při synchronizaci velkého počtu produktů (stovky) může proces trvat několik minut. Nezavírejte stránku a vyčkejte na dokončení.

---

## Nasazení na Netlify

1. [Netlify](https://app.netlify.com/) → **Add new site** → **Import an existing project** (Git)
2. Propojte repozitář `janbenes-beny/base_kaufland`
3. **Build settings:** Build command prázdný, **Publish directory:** `.`
4. **Functions directory:** `netlify/functions` (detekováno z `netlify.toml`)

Pro základní provoz **nepotřebujete** žádné environment variables – API klíč zadává uživatel v aplikaci.

---

## Lokální vývoj

```bash
npm install -g netlify-cli
netlify dev
```

Otevře se lokální server. Volání na `/.netlify/functions/baselinker` poběží lokálně. **Poznámka:** Stránka musí běžet přes HTTP (ne `file://`), jinak API nefunguje kvůli CORS.

---

## Soubory

| Soubor | Účel |
|--------|------|
| `index.html` | Rozhraní: přihlášení, seznam produktů, tabulka vyčištěných popisů, modál pro úpravu |
| `app.js` | Logika: načítání katalogu, čištění HTML, synchronizace do BaseLinker |
| `styles.css` | Styly |
| `netlify/functions/baselinker.js` | Proxy k BaseLinker API (obchází CORS) |

---

## Python verze (Streamlit)

Pro lokální vyčištění XML bez API:

```bash
pip install -r requirements.txt
streamlit run app.py
```
