"""
==============================================================================
GSTGPT - ONE-TIME SYNOPSIS GENERATOR SCRIPT (generate_synopses.py)
==============================================================================
Is script ko SIRF EK BAAR chalana hai! Yeh 1,213 GST documents ke liye
compact plain-English synopses generate karega aur save karega.

Usage:
    python generate_synopses.py              # Auto-only mode (instant, no LLM)
    python generate_synopses.py --with-llm   # Hybrid mode (auto + LLM for large docs)

Requirements for --with-llm:
    Ollama must be running: ollama serve
    Model must be loaded: ollama run gstgpt:latest

Output:
    extracted_data/jsonl/gst_synopses.json
==============================================================================
"""

import json
import sys
import time
from pathlib import Path

import config
from models.synopsis_generator import SynopsisGenerator


def main():
    use_llm = "--with-llm" in sys.argv

    input_file = config.INPUT_CLEANED_FILE
    output_file = config.SYNOPSES_FILE

    if not input_file.exists():
        print(f"❌ Input file not found: {input_file}")
        sys.exit(1)

    print("=" * 70)
    print("🚀 GSTGPT SYNOPSIS GENERATOR")
    print(f"   Mode: {'HYBRID (Auto + LLM for large docs)' if use_llm else 'AUTO-ONLY (instant, offline)'}")
    print(f"   Input:  {input_file}")
    print(f"   Output: {output_file}")
    print("=" * 70)

    # Load all records
    records = []
    with open(input_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))

    print(f"\n📦 Total documents to process: {len(records)}")

    # Count by size
    small_count = sum(1 for r in records if len(r.get("clean_text", "").split()) < 300)
    large_count = len(records) - small_count
    print(f"   Small (< 300 words, auto-extract): {small_count}")
    print(f"   Large (>= 300 words, {'LLM generate' if use_llm else 'auto-extract'}): {large_count}")
    print()

    # Generate synopses
    synopses = {}
    start_time = time.time()
    auto_count = 0
    llm_count = 0
    fail_count = 0

    for i, rec in enumerate(records):
        filename = rec.get("filename", f"doc_{i}")
        word_count = len(rec.get("clean_text", "").split())
        
        try:
            synopsis = SynopsisGenerator.generate(
                rec, 
                use_llm_for_large=use_llm,
                ollama_url="http://localhost:11434/api/generate"
            )
            synopses[filename] = {
                "synopsis": synopsis,
                "category": rec.get("category", ""),
                "year": str(rec.get("year", "")),
                "word_count": word_count,
                "method": "llm" if (use_llm and word_count >= 300 and "AUTO:" in synopsis) else "auto"
            }
            
            if synopses[filename]["method"] == "llm":
                llm_count += 1
            else:
                auto_count += 1

        except Exception as e:
            print(f"  ❌ Error on {filename}: {e}")
            fail_count += 1
            # Fallback: use first 200 chars
            synopses[filename] = {
                "synopsis": rec.get("clean_text", "")[:200],
                "category": rec.get("category", ""),
                "year": str(rec.get("year", "")),
                "word_count": word_count,
                "method": "fallback"
            }

        # Progress indicator
        if (i + 1) % 100 == 0 or i == len(records) - 1:
            elapsed = time.time() - start_time
            print(f"  ✅ Processed {i + 1}/{len(records)} ({elapsed:.1f}s)")

    # Save to JSON
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(synopses, f, indent=2, ensure_ascii=False)

    elapsed = time.time() - start_time
    print()
    print("=" * 70)
    print(f"✅ SYNOPSIS GENERATION COMPLETE!")
    print(f"   Auto-extracted: {auto_count}")
    print(f"   LLM-generated:  {llm_count}")
    print(f"   Failed/fallback: {fail_count}")
    print(f"   Time: {elapsed:.1f}s")
    print(f"   Saved to: {output_file}")
    print("=" * 70)
    print()
    print("📌 NEXT STEP: Run 'python fast_index_chromadb.py' to build the two-tier index!")


if __name__ == "__main__":
    main()
