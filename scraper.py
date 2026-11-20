#!/usr/bin/env python3
"""
Rutgers University Digital Humanities — Place-Based Rhetoric Archival Scraper CLI.

Searches multiple Rutgers and New Jersey digital archives for a single campus location
(plus its historical spelling variants/aliases), extracts date-stamped text and
Keyword-in-Context (KWIC) snippets, and writes timeline-ready JSONL + CSV datasets.

Examples:
  python scraper.py --location "Old Queen's" \
      --aliases "Old Queens" "Queen's Building" "Queens Building" "Queen's Campus" \
      --out data/old_queens.jsonl --max-per-source 100

  python scraper.py --config locations.json --only "Old Queen's"
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import Counter
from pathlib import Path
from typing import Sequence

from adapters import (
    BaseAdapter,
    LocalPDFAdapter,
    ModernTargumAdapter,
    NJSLDSpaceAdapter,
    PoliteHttpClient,
    RawDocument,
    RUcoreTargumAdapter,
    RUcoreYearbooksAdapter,
    ScarletAndBlackAdapter,
)
from utils.export import TimelineRecord, normalize_raw_documents, write_csv_summary, write_jsonl
from utils.text_processing import deduplicate_aliases, normalize_quotes, slugify

ALL_SOURCES = (
    "njsl_dspace",
    "scarlet_and_black",
    "rucore_targum",
    "rucore_yearbooks",
    "modern_targum",
    "local_pdf",
)

logger = logging.getLogger("rutgers_scraper")


def build_adapters(
    sources: Sequence[str],
    *,
    delay: float,
    manual_dir: Path,
    cache_dir: Path,
    refresh_cache: bool,
    include_broad_njsl: bool,
) -> list[BaseAdapter]:
    http = PoliteHttpClient(delay=delay)
    registry: dict[str, BaseAdapter] = {
        "njsl_dspace": NJSLDSpaceAdapter(http=http, include_broad_fallback=include_broad_njsl),
        "scarlet_and_black": ScarletAndBlackAdapter(http=http, cache_dir=cache_dir, refresh_cache=refresh_cache),
        "rucore_targum": RUcoreTargumAdapter(http=http),
        "rucore_yearbooks": RUcoreYearbooksAdapter(http=http),
        "modern_targum": ModernTargumAdapter(http=http),
        "local_pdf": LocalPDFAdapter(manual_dir=manual_dir, http=http),
    }
    return [registry[name] for name in sources]


def load_locations_from_config(config_path: Path, only: str | None = None) -> list[dict]:
    data = json.loads(config_path.read_text(encoding="utf-8"))
    locations = data.get("locations") if isinstance(data, dict) else data
    if not isinstance(locations, list) or not locations:
        raise ValueError(f"No locations found in {config_path}")

    if only:
        target_norm = normalize_quotes(only).strip().lower()
        matched = [
            loc
            for loc in locations
            if normalize_quotes(loc.get("canonical", "")).strip().lower() == target_norm
            or loc.get("slug", "").strip().lower() == target_norm
        ]
        if not matched:
            available = ", ".join(loc.get("canonical", "?") for loc in locations)
            raise ValueError(f"Location {only!r} not found in {config_path}. Available: {available}")
        return matched

    return locations


def run_for_location(
    *,
    canonical: str,
    aliases: Sequence[str],
    out_jsonl: Path,
    out_csv: Path,
    adapters: Sequence[BaseAdapter],
    max_per_source: int,
    kwic_window: int,
    max_snippets: int,
) -> list[TimelineRecord]:
    effective_aliases = deduplicate_aliases(canonical, aliases)
    logger.info("=== Scraping location: %s ===", canonical)
    logger.info("Aliases (%d): %s", len(effective_aliases), ", ".join(effective_aliases))

    raw_docs: list[RawDocument] = []
    for adapter in adapters:
        logger.info("[%s] Searching (max=%d)...", adapter.source_name, max_per_source)
        count = 0
        try:
            for doc in adapter.search(effective_aliases, max_results=max_per_source):
                raw_docs.append(doc)
                count += 1
        except KeyboardInterrupt:
            logger.warning("[%s] Interrupted by user; saving partial results collected so far.", adapter.source_name)
            break
        except Exception as exc:
            logger.error("[%s] Adapter error: %s", adapter.source_name, exc, exc_info=logger.isEnabledFor(logging.DEBUG))
        logger.info("[%s] Collected %d matching document(s).", adapter.source_name, count)

    records = normalize_raw_documents(
        raw_docs,
        location_canonical=canonical,
        aliases=effective_aliases,
        kwic_window=kwic_window,
        max_snippets=max_snippets,
    )

    write_jsonl(records, out_jsonl)
    write_csv_summary(records, out_csv)

    _print_summary(canonical, records, out_jsonl, out_csv)
    return records


def _print_summary(
    canonical: str,
    records: Sequence[TimelineRecord],
    out_jsonl: Path,
    out_csv: Path,
) -> None:
    by_source = Counter(r.source_collection for r in records)
    by_decade = Counter(r.decade or "undated" for r in records)
    years = [r.year for r in records if r.year is not None]
    span = f"{min(years)}–{max(years)}" if years else "undated"

    print(f"\n{'=' * 68}")
    print(f"Location: {canonical}")
    print(f"Total normalized records: {len(records)}  |  Year span: {span}")
    print("By source:")
    for src, cnt in sorted(by_source.items()):
        print(f"  - {src:<20s} {cnt}")
    if by_decade:
        print("By decade:")
        for dec in sorted(by_decade.keys(), key=lambda d: (d == "undated", d)):
            print(f"  - {dec:<10s} {by_decade[dec]}")
    print(f"JSONL output: {out_jsonl}")
    print(f"CSV summary:  {out_csv}")
    print(f"{'=' * 68}\n")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Polite archival scraper for Rutgers University place-based rhetoric analysis.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    # Location specification: direct CLI or config registry
    parser.add_argument("--location", help='Canonical campus location name, e.g. "Old Queen\'s"')
    parser.add_argument(
        "--aliases",
        nargs="*",
        default=[],
        help='Historical spelling variants/aliases, e.g. "Old Queens" "Queen\'s Building"',
    )
    parser.add_argument("--config", type=Path, help="Path to locations.json registry file")
    parser.add_argument("--only", help="When using --config, run only this canonical location (or slug)")

    # Output options
    parser.add_argument("--out", type=Path, help="Output JSONL file path (CSV written alongside with .csv suffix)")
    parser.add_argument("--csv-out", type=Path, help="Optional explicit CSV summary output path")
    parser.add_argument("--out-dir", type=Path, default=Path("data"), help="Default output directory for --config runs")

    # Source and politeness options
    parser.add_argument(
        "--sources",
        nargs="+",
        choices=ALL_SOURCES,
        default=list(ALL_SOURCES),
        help="Subset of source adapters to run",
    )
    parser.add_argument("--max-per-source", type=int, default=100, help="Maximum matching records per source adapter")
    parser.add_argument("--delay", type=float, default=0.75, help="Polite per-domain delay in seconds between requests")
    parser.add_argument("--manual-dir", type=Path, default=Path("manual_docs"), help="Directory of local institutional PDFs")
    parser.add_argument("--cache-dir", type=Path, default=Path(".cache"), help="Local cache directory (e.g. Omeka API dump)")
    parser.add_argument("--refresh-cache", action="store_true", help="Ignore cached Omeka API items and refetch")
    parser.add_argument(
        "--no-broad-njsl",
        action="store_true",
        help="Restrict NJSL DSpace strictly to the Rutgers collection UUID without broader NJ fallback",
    )
    parser.add_argument("--kwic-window", type=int, default=150, help="Characters before/after match in KWIC snippets")
    parser.add_argument("--max-snippets", type=int, default=25, help="Maximum KWIC snippets stored per record")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose debug logging")

    args = parser.parse_args(argv)

    if not args.location and not args.config:
        parser.error("Provide either --location (with optional --aliases) or --config locations.json.")
    if args.location and args.config:
        parser.error("Use either --location or --config, not both.")
    if args.only and not args.config:
        parser.error("--only requires --config.")

    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )

    adapters = build_adapters(
        args.sources,
        delay=args.delay,
        manual_dir=args.manual_dir,
        cache_dir=args.cache_dir,
        refresh_cache=args.refresh_cache,
        include_broad_njsl=not args.no_broad_njsl,
    )

    if args.config:
        entries = load_locations_from_config(args.config, only=args.only)
        for entry in entries:
            canonical = entry["canonical"]
            aliases = entry.get("aliases") or []
            slug = entry.get("slug") or slugify(canonical)
            if args.out and len(entries) == 1:
                out_jsonl = args.out
            else:
                out_jsonl = args.out_dir / f"{slug}.jsonl"
            out_csv = args.csv_out if (args.csv_out and len(entries) == 1) else out_jsonl.with_suffix(".csv")

            run_for_location(
                canonical=canonical,
                aliases=aliases,
                out_jsonl=out_jsonl,
                out_csv=out_csv,
                adapters=adapters,
                max_per_source=args.max_per_source,
                kwic_window=args.kwic_window,
                max_snippets=args.max_snippets,
            )
    else:
        canonical = args.location
        slug = slugify(canonical)
        out_jsonl = args.out or (args.out_dir / f"{slug}.jsonl")
        out_csv = args.csv_out or out_jsonl.with_suffix(".csv")

        run_for_location(
            canonical=canonical,
            aliases=args.aliases,
            out_jsonl=out_jsonl,
            out_csv=out_csv,
            adapters=adapters,
            max_per_source=args.max_per_source,
            kwic_window=args.kwic_window,
            max_snippets=args.max_snippets,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
