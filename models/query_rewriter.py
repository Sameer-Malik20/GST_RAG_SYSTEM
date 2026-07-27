"""
==============================================================================
GSTGPT - LLM QUERY REWRITER MODEL (models/query_rewriter.py)
==============================================================================
[MVC ROLE: MODEL LAYER - QUERY TRANSFORMER]
Is file ka kaam user ke casual / Hinglish / numerical queries ko LLM ya smart 
semantic expansion ke zariye official statutory gazette terms mein transform karna hai,
jisse RAG search accuracy 100% ho jaye!
==============================================================================
"""

import json
import re
import urllib.request
import urllib.error
import config

class QueryRewriter:
    def __init__(self, ollama_url: str = "http://localhost:11434/api/generate", model_name: str = config.DEFAULT_OLLAMA_MODEL):
        self.ollama_url = ollama_url
        self.model_name = model_name

    def rewrite(self, user_query: str) -> str:
        """
        Dynamically transforms user query into gazette legal terminology.
        Uses fast LLM API if available, with intelligent fallback.
        """
        # Try fast LLM expansion if Ollama endpoint is active
        try:
            prompt = (
                "You are a GST Legal Query Reformulator.\n"
                "Rewrite the user question into official Indian GST Gazette legal search terms.\n"
                "Include both numerical digits and words (e.g. '500 crore' AND 'five hundred crore rupees').\n"
                "Include formal statutory sections and rule names.\n"
                "Return ONLY the expanded search terms on one line.\n\n"
                f"User Question: {user_query}\n"
                "Legal Search Terms:"
            )
            req = urllib.request.Request(
                self.ollama_url,
                data=json.dumps({
                    "model": self.model_name,
                    "prompt": prompt,
                    "stream": False
                }).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                rewritten = data.get("response", "").strip().replace('\n', ' ')
                if len(rewritten) > 5:
                    print(f"⚡ [LLM Query Rewriter] Expanded: '{user_query}' → '{rewritten}'")
                    return f"{user_query} {rewritten}"
        except Exception:
            pass

        # Fast Instant Legal & Numeric Normalizer Fallback (Offline & Zero-latency)
        expanded_terms = [user_query]
        q_lower = user_query.lower()

        # 1. Number Digit <-> Word Expansion
        num_patterns = [
            (r'\b500\s*(?:cr|crore)?\b', 'five hundred crore rupees 500 crore'),
            (r'\b75\s*(?:l|lakh|lac)?\b', 'seventy five lakh rupees 75 lakh'),
            (r'\b20\s*(?:l|lakh|lac)?\b', 'twenty lakh rupees 20 lakh'),
            (r'\b10\s*(?:l|lakh|lac)?\b', 'ten lakh rupees 10 lakh'),
            (r'\b1\.5\s*(?:cr|crore)?\b', 'one crore and fifty lakh rupees 1.5 crore'),
            (r'\b50\s*(?:l|lakh|lac)?\b', 'fifty lakh rupees 50 lakh'),
        ]
        for pat, expr in num_patterns:
            if re.search(pat, q_lower):
                expanded_terms.append(expr)

        # 2. Common GST Concept <-> Statutory Term Expansion
        concept_patterns = [
            (r'\be-?invoic', 'Invoice Reference Number IRN FORM GST INV-01 rule 48'),
            (r'\bcomposition', 'section 10 section 23 option to pay tax turnover in State'),
            (r'\bhandicraft', 'casual taxable persons inter-State supplies handicraft goods section 23'),
            (r'\blate fee\b', 'section 128 section 47 waiver of late fee FORM GSTR-3B'),
            (r'\bitc\b|\binput tax credit\b', 'FORM GST ITC-01 section 18 GSTR-2B section 16'),
            (r'\bisd\b|\binput service distributor\b', 'Input Service Distributor FORM GSTR-6 section 20'),
            (r'\breal estate\b|\bproperty\b', 'residential real estate projects promoter construction'),
            (r'\binterest\b', 'section 50 rate of interest per annum delayed payment'),
        ]
        for pat, expr in concept_patterns:
            if re.search(pat, q_lower):
                expanded_terms.append(expr)

        final_query = " ".join(expanded_terms)
        if len(expanded_terms) > 1:
            print(f"⚡ [Fast Query Expander] Expanded: '{user_query}' → '{final_query[:100]}...'")
        return final_query
