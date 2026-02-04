# -*- coding: utf-8 -*-
"""
Streamlit aplikace pro vyčištění produktového XML feedu z Heureka.cz
pro Kaufland marketplace. Sanitizuje HTML v popisech produktů.
"""

# Project: base_kaufland
import re
from typing import Optional

import streamlit as st
from bs4 import BeautifulSoup, NavigableString
from lxml import etree

# ---------------------------------------------------------------------------
# Konfigurace čištění
# ---------------------------------------------------------------------------

# Tagy zakázané Kauflandem – budou kompletně odstraněny
FORBIDDEN_TAGS = {"img", "iframe", "script", "object", "video", "style", "form"}

# Povolené tagy pro formátování (ostatní se odstraní nebo převedou na text)
ALLOWED_TAGS = {"p", "b", "strong", "ul", "li", "br", "h1", "h2", "h3", "h4", "h5", "h6"}

# Klíčová slova: pokud jsou v okolí <img>, odstraní se i přilehlý text/paragraf
IMAGE_CAPTION_KEYWORDS = [
    "velikostní tabulka",
    "tabulka velikostí",
    "rozměry",
    "viz foto",
    "viz obrázek",
    "viz obrázek níže",
    "viz foto níže",
    "velikostní tabulka viz",
    "rozměry viz",
]


def _normalize_text(text: str) -> str:
    """Normalizuje text pro porovnání (lowercase, více mezer na jednu)."""
    if not text or not text.strip():
        return ""
    return " ".join(re.split(r"\s+", text.lower().strip()))


def _text_contains_any_keyword(text: str) -> bool:
    """Vrátí True, pokud text obsahuje alespoň jedno klíčové slovo."""
    normalized = _normalize_text(text)
    if not normalized:
        return False
    return any(kw in normalized for kw in IMAGE_CAPTION_KEYWORDS)


def _get_element_text(element) -> str:
    """Vrátí čistý text elementu (bez vnořených tagů)."""
    if element is None:
        return ""
    if isinstance(element, NavigableString):
        return str(element).strip()
    return element.get_text(separator=" ", strip=True) if hasattr(element, "get_text") else ""


def _remove_image_and_caption_blocks(soup: BeautifulSoup) -> None:
    """
    Pro každý <img> zkontroluje okolí (předchozí/následující element, rodič).
    Pokud okolní text obsahuje klíčová slova, odstraní i tento text/paragraf.
    Nakonec odstraní všechny <img>.
    """
    to_decompose = set()  # id(obj) pro elementy k odstranění

    for img in soup.find_all("img"):
        img_id = id(img)
        to_decompose.add(img_id)

        parent = img.parent
        prev_sibling = img.find_previous_sibling()
        next_sibling = img.find_next_sibling()

        # Text rodiče (bez obsahu tohoto img)
        parent_text = ""
        if parent and parent.name:
            parent_text = _get_element_text(parent)

        # Pokud rodič obsahuje klíčové slovo, odstraníme celý rodič (včetně img)
        if parent and parent.name and _text_contains_any_keyword(parent_text):
            to_decompose.add(id(parent))
            continue

        # Předchozí sourozenec
        if prev_sibling and getattr(prev_sibling, "name", None):
            prev_text = _get_element_text(prev_sibling)
            if _text_contains_any_keyword(prev_text):
                to_decompose.add(id(prev_sibling))

        # Následující sourozenec
        if next_sibling and getattr(next_sibling, "name", None):
            next_text = _get_element_text(next_sibling)
            if _text_contains_any_keyword(next_text):
                to_decompose.add(id(next_sibling))

    # Odstranění v pořadí: nejdřív větší kontejnery (rodiče), pak img
    # Provedeme decompose v jednom průchodu – sbíráme objekty
    elements_to_remove = []
    for tag in soup.find_all(True):
        if id(tag) in to_decompose:
            elements_to_remove.append(tag)

    # Odstranit od rodičů k potomkům (menší hloubka = dřív), aby při odstranění rodiče
    # neporušil odkaz na potomka
    def depth(elem):
        d = 0
        while getattr(elem, "parent", None) and getattr(elem.parent, "name", None):
            elem = elem.parent
            d += 1
        return d

    for elem in sorted(elements_to_remove, key=depth):
        try:
            if elem.parent is not None:
                elem.decompose()
        except Exception:
            pass


def _remove_forbidden_tags(soup: BeautifulSoup) -> None:
    """Odstraní všechny zakázané tagy (obsah i tag)."""
    for tag_name in FORBIDDEN_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()


def _strip_disallowed_tags(soup: BeautifulSoup) -> None:
    """
    Tagy mimo ALLOWED_TAGS odstraní – samotný tag zmizí, text zůstane (unwrap).
    """
    for tag in soup.find_all(True):
        if tag.name.lower() not in ALLOWED_TAGS:
            tag.unwrap()


def clean_html_description(html_content: Optional[str]) -> str:
    """
    Vyčistí HTML popis podle pravidel Kaufland marketplace.

    - Odstraní zakázané tagy: img, iframe, script, object, video, style, form.
    - Před odstraněním img zkontroluje okolí; pokud obsahuje klíčová slova
      (např. „velikostní tabulka“, „viz foto“), odstraní i přilehlý text/paragraf.
    - Ponechá pouze povolené formátování: p, b, strong, ul, li, br, h1–h6.

    :param html_content: Řetězec s HTML (může být prázdný nebo None).
    :return: Vyčištěný HTML řetězec v UTF-8.
    """
    if html_content is None or not isinstance(html_content, str):
        return ""

    text = html_content.strip()
    if not text:
        return ""

    try:
        soup = BeautifulSoup(text, "lxml")
    except Exception:
        soup = BeautifulSoup(text, "html.parser")

    # 1) Inteligentní odstranění obrázků a popisků
    _remove_image_and_caption_blocks(soup)

    # 2) Odstranění ostatních zakázaných tagů
    _remove_forbidden_tags(soup)

    # 3) Ponechat jen povolené tagy (ostatní unwrap)
    _strip_disallowed_tags(soup)

    result = str(soup)
    # Odstranit případné obalové tagy, které BeautifulSoup přidal (html, body)
    for wrapper in ("html", "body", "[document]"):
        if result.startswith(f"<{wrapper}") or result.startswith(f"<{wrapper}>"):
            soup2 = BeautifulSoup(result, "html.parser")
            body = soup2.find("body") or soup2.find("html")
            if body:
                result = "".join(str(c) for c in body.children)
            break

    return result.strip() or ""


# ---------------------------------------------------------------------------
# Zpracování XML
# ---------------------------------------------------------------------------

DESCRIPTION_TAGS = ("DESCRIPTION", "LONG_DESCRIPTION")


def process_heureka_xml(xml_bytes: bytes) -> bytes:
    """
    Načte Heureka XML, projde každý SHOPITEM, vyčistí DESCRIPTION a LONG_DESCRIPTION
    a vrátí nový XML jako bytes (UTF-8).

    :param xml_bytes: Obsah XML souboru (libovolné kódování, preferováno UTF-8).
    :return: Vyčištěný XML jako bytes v UTF-8.
    :raises: ValueError při nevalidním XML.
    """
    # Dekódování na řetězec (UTF-8 nebo fallback)
    try:
        xml_str = xml_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            xml_str = xml_bytes.decode("cp1250")
        except UnicodeDecodeError:
            xml_str = xml_bytes.decode("utf-8", errors="replace")

    # Parsování XML
    try:
        root = etree.fromstring(xml_str.encode("utf-8"))
    except etree.XMLSyntaxError as e:
        raise ValueError(f"Nevalidní XML: {e}") from e

    # Nalezení všech SHOPITEM (bez ohledu na namespace)
    shopitems = [
        e for e in root.iter()
        if (e.tag or "").replace("}", "").split("{")[-1].upper() == "SHOPITEM"
    ]
    if not shopitems:
        raise ValueError("V XML se nenašel žádný element SHOPITEM.")

    for item in shopitems:
        for elem in item:
            tag_local = (elem.tag or "").replace("}", "").split("{")[-1].upper()
            if tag_local not in DESCRIPTION_TAGS:
                continue
            # Sběr celého obsahu (text + vnořené elementy) jako HTML
            raw_parts = [elem.text or ""]
            for child in elem:
                raw_parts.append(etree.tostring(child, encoding="unicode", method="html"))
                raw_parts.append(child.tail or "")
            raw_html = "".join(raw_parts).strip()
            if not raw_html:
                continue
            cleaned = clean_html_description(raw_html)
            elem.text = cleaned
            for child in list(elem):
                elem.remove(child)

    return etree.tostring(
        root,
        encoding="utf-8",
        xml_declaration=True,
        pretty_print=True,
        method="xml",
        standalone=False,
    )


# ---------------------------------------------------------------------------
# Streamlit UI
# ---------------------------------------------------------------------------

def main() -> None:
    st.set_page_config(
        page_title="Heureka → Kaufland XML čistička",
        page_icon="🧹",
        layout="centered",
    )
    st.title("Vyčištění produktového XML feedu")
    st.markdown(
        "Nahrajte XML feed ve formátu **Heureka.cz**. Aplikace vyčistí popisy produktů "
        "podle požadavků **Kaufland marketplace** a připraví soubor ke stažení."
    )

    uploaded_file = st.file_uploader(
        "Vyberte XML soubor (Heureka)",
        type=["xml"],
        accept_multiple_files=False,
    )

    if uploaded_file is None:
        st.info("Pro začátek nahrajte XML soubor.")
        return

    raw_bytes = uploaded_file.read()

    if not raw_bytes.strip():
        st.error("Soubor je prázdný.")
        return

    with st.spinner("Zpracovávám XML a čistím popisy…"):
        try:
            result_bytes = process_heureka_xml(raw_bytes)
        except ValueError as e:
            st.error(str(e))
            return
        except Exception as e:
            st.exception(e)
            return

    st.success("XML bylo úspěšně zpracováno.")

    out_name = "kaufland_feed_cleaned.xml"
    st.download_button(
        label="Stáhnout vyčištěný XML soubor",
        data=result_bytes,
        file_name=out_name,
        mime="application/xml",
    )


if __name__ == "__main__":
    main()
