#!/usr/bin/env python3
"""Archive the adopted (not draft rewrite) Boone County KY Article 34 sign rules.

Downloads each current section and subsection as an original HTML source, verifies
each file's SHA-256, and extracts section text for the jurisdiction search index.
No production records are modified by this script.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from urllib.parse import urlparse
from urllib.request import Request, urlopen

HOST = "online.encodeplus.com"
ROOT = "https://online.encodeplus.com/regs/boonecounty-ky/"
TOC_PAGES = (2558, 3377, 3385)
OUT = Path("public/permitting/sources/boone-ky/adopted-article34")
MANIFEST = Path("docs/permitting-boone-ky-article34-manifest-2026-09-26.json")
EXTRACTED = Path("docs/permitting-boone-ky-article34-text-2026-09-26.json")
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CCS-Permit-Research/1.0)", "Accept": "text/html"}


def get_official(path):
    url = ROOT + path
    with urlopen(Request(url, headers=HEADERS), timeout=25) as response:
        resolved = urlparse(response.geturl())
        if response.status != 200 or resolved.hostname != HOST or not resolved.path.startswith("/regs/boonecounty-ky/"):
            raise ValueError("Source redirected outside the adopted Boone County ordinance: " + url)
        if "html" not in response.headers.get("content-type", "").lower():
            raise ValueError("Official section is not HTML: " + url)
        data = response.read(3_000_001)
        if len(data) < 2000 or len(data) > 3_000_000:
            raise ValueError("Official section was empty or exceeded the safety limit: " + url)
    return url, data


class MainPageText(HTMLParser):
    VOID = {"br", "hr", "img", "input", "link", "meta", "area", "embed", "source", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_main = False
        self.depth = 0
        self.ignore = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if not self.in_main:
            if tag == "div" and attrs.get("id") == "thePage":
                self.in_main, self.depth = True, 1
            return
        if tag in {"script", "style", "noscript"}:
            self.ignore += 1
        if not self.ignore:
            if tag in {"h1", "h2", "h3", "h4", "li", "tr", "p", "section"}:
                self.parts.append("\n")
            if tag in {"td", "th"}:
                self.parts.append(" | ")
        if tag not in self.VOID:
            self.depth += 1

    def handle_endtag(self, tag):
        if not self.in_main:
            return
        if tag in {"script", "style", "noscript"} and self.ignore:
            self.ignore -= 1
        if not self.ignore and tag in {"li", "tr", "p", "h1", "h2", "h3", "section"}:
            self.parts.append("\n")
        if tag not in self.VOID:
            self.depth -= 1
        if self.depth <= 0:
            self.in_main = False

    def handle_data(self, data):
        if self.in_main and not self.ignore:
            self.parts.append(data)

    def result(self):
        raw = "".join(self.parts).replace("\xa0", " ")
        return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", raw)).strip()


def discover_sections():
    entries = {}
    for id_ in TOC_PAGES:
        _, data = get_official(f"doc-viewer.aspx?secid={id_}")
        html = data.decode("utf-8-sig", errors="replace")
        if "ARTICLE 34 SIGNS" not in html:
            raise ValueError("Cannot locate adopted Article 34 TOC")
        fragment = html.split("ARTICLE 34 SIGNS", 1)[1].split("ARTICLE 35", 1)[0]
        for match in re.finditer(r'<li id="secid-x(\d+)"[^>]*>.*?<span class="toc-item">(.*?)</span>', fragment, re.S):
            section_id, heading_html = match.groups()
            title = unescape(re.sub(r"<[^>]+>", "", heading_html)).strip()
            if re.match(r"(?i)^section 34\d\d(?:\.\d+)?\b", title):
                entries[int(section_id)] = title
    if len(entries) < 25 or not {"3404", "3405", "3407", "3408"} <= {
        match.group(0) for title in entries.values() for match in re.finditer(r"34(?:04|05|07|08)", title)
    }:
        raise ValueError("Article 34 TOC is unexpectedly incomplete")
    return entries


def fetch_section(item):
    section_id, title = item
    url, data = get_official(f"doc-view.aspx?secid={section_id}&ajax=0")
    html = data.decode("utf-8-sig", errors="replace")
    if f"secid='{section_id}'" not in html and f'secid="{section_id}"' not in html:
        raise ValueError(f"Official section {section_id} did not match its requested identity")
    parser = MainPageText()
    parser.feed(html)
    text = parser.result()
    if "BOONE COUNTY ZONING REGULATIONS" not in text or "ARTICLE 34 SIGNS" not in text:
        raise ValueError("Official source did not contain adopted Article 34: " + title)
    if len(text) < 45:
        raise ValueError("Official section had no useful searchable text: " + title)
    filename = f"section-{section_id}.html"
    return {
        "id": section_id, "title": title, "url": url, "filename": filename,
        "sha256": sha256(data).hexdigest(), "bytes": len(data),
        "characters": len(text), "text": text, "original": data,
    }


def main():
    entries = discover_sections()
    if OUT.exists() or MANIFEST.exists() or EXTRACTED.exists():
        raise FileExistsError("An Article 34 archive already exists; inspect it before replacing legal source evidence")
    # Four bounded requests prevent a broad crawl or overwhelming the official host.
    with ThreadPoolExecutor(max_workers=3) as executor:
        sections = list(executor.map(fetch_section, sorted(entries.items())))
    if len(sections) != len(entries):
        raise ValueError("Incomplete adopted Article 34 archive")
    with TemporaryDirectory(prefix="boone-sign-ordinance-", dir=OUT.parent) as temp:
        stage = Path(temp)
        for section in sections:
            (stage / section["filename"]).write_bytes(section["original"])
            if sha256((stage / section["filename"]).read_bytes()).hexdigest() != section["sha256"]:
                raise ValueError("Written source failed SHA-256 verification")
        stage.rename(OUT)
    timestamp = datetime.now(timezone.utc).isoformat()
    MANIFEST.write_text(json.dumps({
        "jurisdictionId": "6ab7c6107f2251a8e8e48b90", "jurisdiction": "Boone County",
        "state": "KY", "authority": "Adopted Boone County Planning Commission Article 34",
        "notTheDraftRewrite": True, "fetchedAt": timestamp,
        "sources": [{k: s[k] for k in ("id", "title", "url", "filename", "sha256", "bytes", "characters")} for s in sections],
    }, indent=2) + "\n")
    EXTRACTED.write_text(json.dumps({
        "jurisdictionId": "6ab7c6107f2251a8e8e48b90", "fetchedAt": timestamp,
        "sources": [{k: s[k] for k in ("id", "title", "url", "sha256", "text")} for s in sections],
    }, indent=2) + "\n")
    print(f"PASS: archived {len(sections)} adopted Article 34 HTML sections; "
          f"{sum(s['characters'] for s in sections)} searchable characters; "
          "all original files passed SHA-256 verification")


if __name__ == "__main__":
    main()
