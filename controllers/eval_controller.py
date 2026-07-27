"""
==============================================================================
GSTGPT - EVALUATION CONTROLLER (controllers/eval_controller.py)
==============================================================================
[MVC ROLE: CONTROLLER LAYER - BENCHMARK & EVALUATION]
Is file ka kaam GSTGPT ke RAG Engine ki retrieval accuracy ko benchmark karna
aur detailed evaluation report (diagnostics) generate karna hai.
==============================================================================
"""

from pathlib import Path
from models.rag_engine import HybridRAGEngine
from views.cli_view import CLIView
import config

class EvalController:
    def __init__(self, rag_engine: HybridRAGEngine = None):
        self.rag_engine = rag_engine or HybridRAGEngine()
        self.view = CLIView()

    def run_benchmark(self, custom_queries: list = None, save_report: bool = True):
        """Runs evaluation over test queries and prints/saves diagnostic metrics."""
        test_queries = custom_queries or [
            "What is the due date for filing GSTR-3B for August 2017?",
            "What is section 52 of CGST Act regarding Tax Collected at Source (TCS)?",
            "What is the late fee waiver or reduction notification for GSTR-3B?",
            "What is the requirement of HSN code on tax invoice for registered persons?",
            "What is the due date extension for filing GSTR-1 return?",
            "What is FORM GST CMP-08 for composition taxpayers?",
            "What are the interest rates for delayed payment of GST tax under section 50?",
            "What is the time limit for issuing credit note under GST?",
            "What is notification number 34/2018 regarding GSTR-3B due date?",
            "Who is exempt from GST registration under CGST notification?"
        ]

        self.view.show_status(f"Running Retrieval Accuracy Benchmark across {len(test_queries)} legal tax questions...")
        
        evaluation_results = []
        for q in test_queries:
            results = self.rag_engine.search(q, top_k=3)
            evaluation_results.append({
                "query": q,
                "results": results
            })

        self.view.show_eval_report(evaluation_results)

        if save_report:
            report_path = config.BASE_DIR / "rag_diagnosis_report_v3.txt"
            with open(report_path, "w", encoding="utf-8") as f:
                f.write("================================================================================\n")
                f.write("   GSTGPT HYBRID RAG v3.0 RETRIEVAL ACCURACY REPORT\n")
                f.write("================================================================================\n\n")
                for item in evaluation_results:
                    f.write(f"QUESTION: {item['query']}\n")
                    f.write("-" * 80 + "\n")
                    for rank, res in enumerate(item['results'], 1):
                        f.write(f"Rank {rank} | Re-Rank Score: {res['rerank_score']:.4f} | File: {res['filename']}\n")
                        f.write(f"Snippet: {res['text'][:250]}...\n")
                    f.write("-" * 80 + "\n\n")
            print(f"📄 Report saved to: {report_path}")

        return evaluation_results
