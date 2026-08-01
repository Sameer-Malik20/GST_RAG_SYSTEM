"""
==============================================================================
GSTGPT - SYNOPSIS GENERATOR (models/synopsis_generator.py)
==============================================================================
[MVC ROLE: MODEL LAYER - DOCUMENT SUMMARIZER]
Har GST document ka 2-3 line plain-English synopsis generate karta hai.
- Chhote documents (< 300 words): Auto-extract via regex (instant, offline)
- Bade documents (>= 300 words): LLM se generate (Ollama, one-time)
Synopsis = semantic bridge between user's casual query and formal gazette text.
==============================================================================
"""

import re
import json
import urllib.request
import urllib.error
from typing import Dict, Any, Optional

import config


class SynopsisGenerator:
    """Generates compact, search-optimized synopses for GST documents."""

    # Common GST concept tags to enrich synopses for better search matching
    CONCEPT_TAGS = [
        (r'e-?invoic|irn|rule\s*48', 'e-invoicing electronic invoice IRN threshold aggregate turnover mandatory'),
        (r'composition|section\s*10\b', 'composition scheme option to pay tax aggregate turnover limit'),
        (r'table\s*4|gstr-?3b|itc\s+avail', 'GSTR-3B Table 4 ITC availment reversal reclaim reporting'),
        (r'revocation|cancell', 'revocation cancellation registration time limit application'),
        (r'late\s*fee|waiv', 'waiver late fee penalty delay filing return'),
        (r'interest|section\s*50\b', 'interest delayed payment tax per annum rate'),
        (r'handicraft|casual\s+taxable', 'handicraft goods casual taxable person exemption inter-State'),
        (r'refund|export|zero.?rated|section\s*54\b', 'refund export zero rated supply section 54 rule 89'),
        (r'registration|section\s*25\b|section\s*22\b', 'registration threshold turnover limit exemption'),
        (r'annual\s*return|gstr-?9|section\s*44\b', 'annual return GSTR-9 reconciliation financial year'),
        (r'input\s*service\s*distribut|isd|section\s*20\b', 'input service distributor ISD credit distribution'),
        (r'tds|tax\s*deduct|section\s*51\b', 'TDS tax deducted at source deduction section 51'),
        (r'tcs|tax\s*collect|section\s*52\b|e-?commerce', 'TCS tax collected at source e-commerce operator section 52'),
        (r'eway\s*bill|e-?way|rule\s*138\b', 'e-way bill transportation movement goods rule 138'),
        (r'penalty|section\s*122\b|section\s*125\b', 'penalty offence contravention section 122'),
        (r'assessment|section\s*63\b|section\s*62\b', 'assessment non-filer best judgement section 62 63'),
        (r'audit|section\s*65\b|section\s*66\b', 'audit special audit section 65 66'),
        (r'appeal|section\s*107\b|tribunal', 'appeal appellate authority tribunal section 107'),
        (r'hsn|sac|tariff', 'HSN SAC code tariff heading classification'),
        (r'real\s*estate|property|promoter', 'real estate residential project promoter construction'),
    ]

    @classmethod
    def auto_generate_synopsis(cls, record: Dict[str, Any]) -> str:
        """
        Auto-generates synopsis using regex extraction (no LLM needed).
        Works for ALL document sizes but quality is best for < 300 words.
        """
        filename = record.get("filename", "")
        category = record.get("category", "")
        year = str(record.get("year", ""))
        text = record.get("clean_text", "")

        # 1. Extract Notification Number
        notif_match = re.search(
            r'Notification\s+(?:No\.?\s*)?(\d{1,3}\s*/\s*\d{4})',
            text[:500], re.IGNORECASE
        )
        if notif_match:
            notif_id = f"Notification {notif_match.group(1).replace(' ', '')}"
        else:
            # Try looser pattern
            notif_match2 = re.search(
                r'Notification\s+(?:No\.?\s*)?(\d{1,3})\s*/?\s*(\d{4})',
                text[:500], re.IGNORECASE
            )
            if notif_match2:
                notif_id = f"Notification {notif_match2.group(1)}/{notif_match2.group(2)}"
            else:
                notif_id = filename.replace('.pdf', '')

        # 2. Extract Sections and Rules
        sections = re.findall(r'\bsection\s+(\d+(?:\(\d+\))?)\b', text[:1500], re.IGNORECASE)
        rules = re.findall(r'\brule\s+(\d+(?:\(\d+\))?)\b', text[:1500], re.IGNORECASE)
        forms = re.findall(r'\b(GSTR-?\d[A-Z]?|RFD-?\d{2}|ITC-?\d{2}|INV-?\d{2}|TRAN-?\d)\b', text[:1500], re.IGNORECASE)

        unique_secs = list(dict.fromkeys(sections))[:4]
        unique_rules = list(dict.fromkeys(rules))[:4]
        unique_forms = list(dict.fromkeys(forms))[:3]

        refs = []
        if unique_secs:
            refs.append("Section " + ", ".join(unique_secs))
        if unique_rules:
            refs.append("Rule " + ", ".join(unique_rules))
        if unique_forms:
            refs.append("Form " + ", ".join(unique_forms))
        ref_line = ". ".join(refs)

        # 3. Extract "hereby [action]" clause
        action_match = re.search(
            r'hereby\s+(.{20,250}?)(?:\.\s|\n|;\s*namely)',
            text, re.IGNORECASE
        )
        if action_match:
            action_text = action_match.group(1).strip().replace('\n', ' ')
        else:
            # Fallback: first 200 chars of text
            action_text = text[:200].replace('\n', ' ')

        # 4. Concept tags for better search matching
        tags = []
        lower_text = text.lower()
        for pattern, tag_text in cls.CONCEPT_TAGS:
            if re.search(pattern, lower_text):
                tags.append(tag_text)

        tag_str = " | " + " | ".join(tags[:3]) if tags else ""

        # 5. Assemble synopsis
        synopsis = f"{notif_id} ({category} {year}). {action_text}. {ref_line}{tag_str}"
        return synopsis[:700]

    @classmethod
    def llm_generate_synopsis(cls, record: Dict[str, Any],
                               ollama_url: str = "http://localhost:11434/api/generate",
                               model_name: str = None) -> Optional[str]:
        """
        Uses Ollama LLM to generate a high-quality synopsis for large documents.
        Returns None if LLM is unavailable.
        """
        if model_name is None:
            model_name = config.DEFAULT_OLLAMA_MODEL

        filename = record.get("filename", "")
        category = record.get("category", "")
        year = str(record.get("year", ""))
        text = record.get("clean_text", "")

        # Send first 2000 chars to LLM (enough context for summary)
        text_chunk = text[:2000]

        prompt = (
            "You are a GST Legal Document Summarizer.\n"
            "Read this Indian GST Notification and write a 2-line plain-English summary.\n"
            "Line 1: What this notification does (amends/exempts/extends/specifies what).\n"
            "Line 2: Key numbers, thresholds, dates, sections, rules mentioned.\n"
            "Include searchable keywords a user might type to find this document.\n"
            "Keep it under 150 words.\n\n"
            f"Filename: {filename}\n"
            f"Category: {category} | Year: {year}\n\n"
            f"--- DOCUMENT TEXT ---\n{text_chunk}\n---\n\n"
            "Summary:"
        )

        try:
            req = urllib.request.Request(
                ollama_url,
                data=json.dumps({
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False
                }).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                summary = data.get("response", "").strip().replace('\n', ' ')
                if len(summary) > 20:
                    # Append auto-extracted tags for extra search power
                    auto_syn = cls.auto_generate_synopsis(record)
                    return f"{summary} | AUTO: {auto_syn}"
        except Exception as e:
            print(f"  ⚠️ LLM failed for {filename}: {e}")

        return None

    @classmethod
    def generate(cls, record: Dict[str, Any], use_llm_for_large: bool = True,
                 ollama_url: str = "http://localhost:11434/api/generate") -> str:
        """
        Smart hybrid generation:
        - < 300 words: Auto-extract (instant, offline)
        - >= 300 words + LLM available: LLM generate (better quality)
        - >= 300 words + LLM unavailable: Fall back to auto-extract
        """
        text = record.get("clean_text", "")
        word_count = len(text.split())

        if word_count < 300 or not use_llm_for_large:
            return cls.auto_generate_synopsis(record)

        # Try LLM for large documents
        llm_result = cls.llm_generate_synopsis(record, ollama_url=ollama_url)
        if llm_result:
            return llm_result

        # Fallback to auto
        return cls.auto_generate_synopsis(record)
