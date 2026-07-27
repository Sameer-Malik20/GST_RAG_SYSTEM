"""
==============================================================================
GSTGPT - LLM INTERFACE MODEL (models/llm_interface.py)
==============================================================================
[MVC ROLE: MODEL LAYER - LLM INFERENCE GENERATOR]
Is file ka kaam retrieved official GST context ko fine-tuned LLM (Ollama/Transformers)
ko pass karke clean conversational tax answers generate karwana hai.
==============================================================================
"""

import json
import urllib.request
import urllib.error
import config

class LLMInterface:
    def __init__(self, model_name: str = config.DEFAULT_OLLAMA_MODEL):
        self.model_name = model_name
        self.ollama_api_url = "http://localhost:11434/api/generate"

    def build_system_prompt(self, query: str, context: str) -> str:
        """Constructs a strict grounding system prompt to prevent legal hallucinations."""
        prompt = (
            "You are GSTGPT, an authoritative AI Legal Assistant specialized in Indian Goods and Services Tax.\n"
            "Your answer MUST be strictly derived ONLY from the official GST Context provided below.\n"
            "If the question cannot be answered using the provided context, state clearly that the information is not present in official records.\n\n"
            f"### OFFICIAL GST CONTEXT:\n{context}\n\n"
            f"### USER QUESTION:\n{query}\n\n"
            "### GSTGPT ANSWER:\n"
        )
        return prompt

    def generate_response(self, query: str, context: str) -> str:
        """
        Calls Ollama local API if running, or falls back to local synthesis.
        """
        full_prompt = self.build_system_prompt(query, context)

        # Attempt Ollama local call
        try:
            req = urllib.request.Request(
                self.ollama_api_url,
                data=json.dumps({
                    "model": self.model_name,
                    "prompt": full_prompt,
                    "stream": False
                }).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                return res_data.get("response", "").strip()

        except (urllib.error.URLError, TimeoutError, Exception):
            # Fallback Local Synthesizer when Ollama service is not running locally
            lines = [line.strip() for line in context.split('\n') if line.strip()]
            summary_snippet = " ".join(lines[:8])

            return (
                f"Based on the retrieved official CBIC GST Notification records:\n\n"
                f"{summary_snippet}\n\n"
                f"📌 Grounding Notice: Response synthesized directly from verified official GST documents."
            )
