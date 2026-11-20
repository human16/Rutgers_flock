#!/usr/bin/env python3
"""
Endpoint & DOM Verification Probe for Rutgers Place-Based Rhetoric Scraper.

Run this lightweight probe to verify that all 4 remote archival platforms still match
the expected REST APIs, portal keys, and DOM selectors before launching a full scrape:

    python probe.py
"""

from __future__ import annotations

import re
import sys

from adapters.base import PoliteHttpClient
from adapters.modern_targum import TARGUM_BASE_URL
from adapters.njsl_dspace import DSPACE_API_BASE, RUTGERS_SCOPE_UUID
from adapters.rucore_collections import (
    COLLECTIONS_BASE,
    RUCORE_BASE,
    TARGUM_PORTAL_KEY,
    YEARBOOKS_PORTAL_KEY,
)
from adapters.scarlet_and_black import SB_API_ITEMS_URL


def run_probes() -> int:
    http = PoliteHttpClient(delay=0.3)
    failures = 0

    print("1. Probing NJ State Library DSpace 7 REST API...")
    try:
        data = http.get_json(
            f"{DSPACE_API_BASE}/discover/search/objects",
            params={"query": "Old Queen's", "scope": RUTGERS_SCOPE_UUID, "dsoType": "item", "size": 1},
        )
        total = data.get("_embedded", {}).get("searchResult", {}).get("page", {}).get("totalElements", 0)
        print(f"   OK: DSpace API reachable (scoped hits for \"Old Queen's\": {total})")
    except Exception as exc:
        print(f"   FAIL: {exc}")
        failures += 1

    print("2. Probing Scarlet & Black Omeka Classic REST API...")
    try:
        resp = http.get(SB_API_ITEMS_URL, params={"per_page": 1, "page": 1}, headers={"Accept": "application/json"})
        resp.raise_for_status()
        total = resp.headers.get("Omeka-Total-Results", "?")
        print(f"   OK: Omeka REST API enabled (Omeka-Total-Results={total})")
    except Exception as exc:
        print(f"   WARN/FAIL (HTML fallback available): {exc}")
        failures += 1

    print("3. Probing RUcore Collections (Historical Targum & Yearbooks)...")
    for label, path, default_key in [
        ("Targum", "targum", TARGUM_PORTAL_KEY),
        ("Yearbooks", "yearbooks", YEARBOOKS_PORTAL_KEY),
    ]:
        try:
            r_page = http.get(f"{COLLECTIONS_BASE}/{path}/results", params={"query": "Old Queens", "q1": "Old Queens"})
            m_key = re.search(r"portal\.php\?[^\"']*key=([A-Za-z0-9]+)", r_page.text)
            key = m_key.group(1) if m_key else default_key
            r_res = http.get(
                f"{RUCORE_BASE}/partnerportal/search/results.php",
                params={"key": key, "q1": '"Old Queens"', "q1field": "fulltext", "start": 1},
            )
            r_res.raise_for_status()
            pids = list(dict.fromkeys(re.findall(r"rutgers-lib[:/](\d+)", r_res.text)))
            print(f"   OK: RUcore {label} portal key={key}, first-page PIDs={len(pids)} (sample={pids[:3]})")
        except Exception as exc:
            print(f"   FAIL ({label}): {exc}")
            failures += 1

    print("4. Probing Modern Daily Targum (SNworks search)...")
    try:
        r_s = http.get(
            f"{TARGUM_BASE_URL}/search",
            params={"keyword": "Old Queens", "type": "article", "sort": "date", "order": "desc", "sid": "12345"},
        )
        r_s.raise_for_status()
        cards = re.findall(r'snw-basis-2/3', r_s.text)
        print(f"   OK: dailytargum.com search reachable (result cards={len(cards)})")
    except Exception as exc:
        print(f"   FAIL: {exc}")
        failures += 1

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run_probes())
