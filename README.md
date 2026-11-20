# Rutgers Place-Based Rhetoric Archival Scraper

A modular, polite Python CLI pipeline for Rutgers University Digital Humanities / Place-Based Learning research. Given a target campus location and its historical spelling variants/aliases, it searches across five Rutgers and New Jersey digital archives plus local institutional PDFs, extracts date-stamped plain text and Keyword-in-Context (KWIC) snippets, and outputs chronologically sorted, timeline-ready `.jsonl` and `.csv` datasets.

## Sources & Verified Architectures

| Adapter | Source Collection | Verified Strategy |
|---|---|---|
| `adapters/njsl_dspace.py` | `njsl_dspace` | NJ State Library DSpace 7 REST API (`/server/api/discover/search/objects` scoped to Rutgers/Queen's College UUID `02963b61-465f-4131-82c4-fda76a3c5c83`, plus optional Rutgers-anchored NJ fallback). Downloads lightweight `TEXT` OCR bundles first, falling back to `ORIGINAL` PDFs (`pymupdf` / `pypdf`). |
| `adapters/scarlet_and_black.py` | `scarlet_and_black` | Omeka Classic REST API (`/archive/api/items`, cached locally under `.cache/` across runs) with full smart-quote/apostrophe-insensitive matching across transcripts, descriptions, and attached PDFs/text; automatic HTML fallback to `/archive/items/browse` and `/archive/search` if the API is ever disabled. |
| `adapters/rucore_collections.py` | `rucore_targum`, `rucore_yearbooks` | Queries RUcore's verified `partnerportal/search/results.php` (`key=1Nb6Fl9Mt` for Historical *Targum*, `key=6Ho2So5Ug` for Yearbooks), fetches structured `MODS/1/` & `DC/1/` XML metadata, and extracts page-level OCR hits via RUcore's official `/ocr/1/search/` endpoint (with bounded `OCR/1/` XML / `PDF/1/` fallback). Never scrapes BookReader JPEG page images. |
| `adapters/modern_targum.py` | `modern_targum` | Queries `dailytargum.com` (SNworks CMS) full-archive search (`/search?keyword=...&type=article&sid=...`), skips sidebar widgets, and parses `NewsArticle` JSON-LD metadata and `<article class="prose">` body text. |
| `adapters/local_pdfs.py` | `local_pdf` | Recursively ingests manually downloaded PDFs (and `.txt`/`.md` statements) placed in `manual_docs/`, automatically chunking large PDFs (> 5 pages) by matching page. |

## Setup

Using `uv` (recommended):

```bash
uv venv
uv pip install -r requirements.txt
```

Or with standard `pip`:

```bash
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

## Quick Start

### 1. Verify Live Archive Endpoints (Optional Health Check)

```bash
python probe.py
```

### 2. Run for a Single Location via CLI

```bash
python scraper.py \
  --location "Old Queen's" \
  --aliases "Old Queens" "Queen's Building" "Queens Building" "Queen's Campus" \
  --out data/old_queens.jsonl \
  --max-per-source 100
```

### 3. Run from the Reusable `locations.json` Registry

```bash
# Single campus site
python scraper.py --config locations.json --only "Old Queen's" --max-per-source 100

# Subset of sources (e.g., only historical archives)
python scraper.py --config locations.json --only "Kirkpatrick Chapel" --sources rucore_targum rucore_yearbooks scarlet_and_black

# All registered locations
python scraper.py --config locations.json --max-per-source 50
```

## Output Schema

Every run produces:
- `data/<slug>.jsonl` — One UTF-8 JSON object per matched document or page-chunk, sorted chronologically by `year`:
  - `location_canonical`, `matched_aliases`, `source_collection`, `doc_id`, `url`, `title`, `date_raw`, `year`, `decade`, `author_or_creator`, `document_type`, `mention_count`, `context_snippets`, `full_text`
- `data/<slug>.csv` — Spreadsheet/timeline summary ready for Excel, pandas, R, or Tableau.

## Testing

```bash
pytest -v
```
