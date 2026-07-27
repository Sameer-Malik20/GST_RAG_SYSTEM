"""
==============================================================================
GSTGPT - DATA CLEANER MODEL (models/data_cleaner.py)
==============================================================================
[MVC ROLE: MODEL LAYER - DATA PREPROCESSING]
Is file ka kaam raw GST PDFs/JSON data se faltu noise (gazette headers, page numbers,
file numbers, signatures) remove karna aur de-duplicated, high-quality cleaned 
JSONL dataset tayar karna hai.
==============================================================================
"""

import json
import re
import hashlib
from pathlib import Path
from config import INPUT_CLEANED_FILE, DATA_DIR

class GSTDataCleaner:
    def __init__(self, input_file: Path = None, output_file: Path = INPUT_CLEANED_FILE):
        self.input_file = input_file or (DATA_DIR / "jsonl" / "gst_ai_dataset.jsonl")
        self.output_file = output_file
        self.summary_file = DATA_DIR / "dataset_cleaning_summary.json"
        self.patterns = self._compile_cleaning_regexes()

    def _compile_cleaning_regexes(self):
        """Standard regex patterns to eliminate boilerplate text."""
        return [
            (re.compile(r'---\s*Page\s*\d+\s*---', re.IGNORECASE), ''),
            (re.compile(r'\[TO BE PUBLISHED IN THE GAZETTE OF INDIA.*?\n.*?\]', re.DOTALL | re.IGNORECASE), ''),
            (re.compile(r'Government of India\s*\n', re.IGNORECASE), ''),
            (re.compile(r'Ministry of Finance\s*\n', re.IGNORECASE), ''),
            (re.compile(r'\(?Department of Revenue\)?\s*\n', re.IGNORECASE), ''),
            (re.compile(r'\(?Central Board of (?:Indirect Taxes and Customs|Excise and Customs)\)?\s*\n', re.IGNORECASE), ''),
            (re.compile(r'New Delhi,\s*the\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4}', re.IGNORECASE), ''),
            (re.compile(r'\d{1,2}\s+[A-Za-z]+,?\s+\d{4}\s+Saka', re.IGNORECASE), ''),
            (re.compile(r'\[\s*F\s*\.?\s*No\s*\.?\s*[\w\d\s\/\(\)\.-]+\]', re.IGNORECASE), ''),
            (re.compile(r'-sd-', re.IGNORECASE), ''),
            (re.compile(r'\(\s*(?:Dr\.\s*)?[A-Z][a-z]+(?:\s+[A-Z]\.){0,2}\s+[A-Z][a-z]+\s*\)', re.IGNORECASE), ''),
            (re.compile(r'Under Secretary to the Government of India', re.IGNORECASE), ''),
            (re.compile(r'G\.S\.R\.\s*\.{2,}\s*\(E\)\.?\s*:-?', re.IGNORECASE), 'G.S.R. (E):'),
            (re.compile(r'[ \t]+'), ' '),
            (re.compile(r'\n{3,}'), '\n\n')
        ]

    def clean_text(self, text: str) -> str:
        """Applies regex patterns to clean a string of text."""
        cleaned = text
        for pattern, replacement in self.patterns:
            cleaned = pattern.sub(replacement, cleaned)
        lines = [line.strip() for line in cleaned.split('\n')]
        cleaned = '\n'.join(lines)
        return re.sub(r'\n{3,}', '\n\n', cleaned).strip()

    def compute_doc_hash(self, text: str) -> str:
        """Generates SHA256 hash for document deduplication."""
        normalized = re.sub(r'\W+', '', text.lower())
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

    def process(self):
        """Runs the complete dataset cleaning pipeline."""
        print(f"🧹 [Data Cleaner Model] Cleaning dataset from: {self.input_file}")
        if not self.input_file.exists():
            print(f"❌ Input file not found: {self.input_file}")
            return None

        seen_hashes = set()
        total_records, cleaned_records, duplicates_removed, too_short_removed = 0, 0, 0, 0
        total_orig_words, total_clean_words = 0, 0
        cleaned_data_list = []

        with open(self.input_file, "r", encoding="utf-8") as infile:
            for line in infile:
                if not line.strip():
                    continue
                total_records += 1
                record = json.loads(line)
                raw_text = record.get("clean_text", "")
                orig_words = len(raw_text.split())
                total_orig_words += orig_words

                cleaned_text = self.clean_text(raw_text)
                clean_words = len(cleaned_text.split())

                if clean_words < 15:
                    too_short_removed += 1
                    continue

                doc_hash = self.compute_doc_hash(cleaned_text)
                if doc_hash in seen_hashes:
                    duplicates_removed += 1
                    continue
                seen_hashes.add(doc_hash)

                record["clean_text"] = cleaned_text
                record["cleaned_word_count"] = clean_words
                record["original_word_count"] = orig_words
                cleaned_data_list.append(record)

                cleaned_records += 1
                total_clean_words += clean_words

        self.output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.output_file, "w", encoding="utf-8") as outfile:
            for rec in cleaned_data_list:
                outfile.write(json.dumps(rec, ensure_ascii=False) + "\n")

        summary = {
            "total_original_records": total_records,
            "cleaned_valid_records": cleaned_records,
            "duplicates_removed": duplicates_removed,
            "too_short_noise_removed": too_short_removed,
            "total_original_words": total_orig_words,
            "total_cleaned_words": total_clean_words,
            "word_reduction_percentage": round((1 - (total_clean_words / max(total_orig_words, 1))) * 100, 2)
        }

        with open(self.summary_file, "w", encoding="utf-8") as sumfile:
            json.dump(summary, sumfile, indent=4)

        print(f"✅ Data cleaning complete. Output: {self.output_file}")
        return summary
