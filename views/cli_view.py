"""
==============================================================================
GSTGPT - CLI VIEW COMPONENT (views/cli_view.py)
==============================================================================
[MVC ROLE: VIEW LAYER - CLI INTERFACE]
Is file ka kaam user ke sath screen par communicate karna hai:
- Beautiful ASCII Banners print karna
- User Inputs lena
- Search status, LLM answer, aur Citation sources format karke dikhana
==============================================================================
"""

import sys

class CLIView:
    @staticmethod
    def show_banner():
        print("=" * 80)
        print("🤖  GSTGPT - ADVANCED HYBRID RAG AI SYSTEM (v3.0)")
        print("    Indian Goods & Services Tax (GST) Expert Intelligence")
        print("=" * 80)

    @staticmethod
    def show_main_menu():
        print("\n📌 MAIN MENU - Choose an option:")
        print("  [1] 💬 Start Interactive GSTGPT Chatbot")
        print("  [2] 🔍 Run RAG Retrieval Benchmark & Accuracy Diagnosis")
        print("  [3] ⚡ Rebuild Vector Database Index (ChromaDB)")
        print("  [4] 🧹 Run Dataset Cleaning Pipeline")
        print("  [5] 🚪 Exit")
        print("-" * 80)

    @staticmethod
    def get_user_input(prompt_str: str = "\n👤 You: ") -> str:
        try:
            return input(prompt_str).strip()
        except (KeyboardInterrupt, EOFError):
            return "exit"

    @staticmethod
    def show_status(msg: str):
        print(f"⏳ {msg}")

    @staticmethod
    def show_results(query: str, answer: str, sources: list, rerank_scores: list = None):
        print("\n🤖 GSTGPT Response:")
        print("=" * 80)
        print(answer)
        print("=" * 80)

        if sources:
            unique_sources = list(set(sources))
            print(f"📄 Official CBIC Sources Used: {', '.join(unique_sources)}")

        if rerank_scores:
            print(f"📊 Re-ranker Confidence Scores: {', '.join([f'{s:.2f}' for s in rerank_scores])}")

    @staticmethod
    def show_eval_report(query_results: list):
        import sys
        out = sys.stdout
        out.write("\n" + "=" * 80 + "\n")
        out.write("📊 GSTGPT RETRIEVAL ACCURACY EVALUATION REPORT\n")
        out.write("=" * 80 + "\n")
        out.flush()

        for item in query_results:
            out.write(f"\n❓ Question: {item['query']}\n")
            out.write("-" * 80 + "\n")
            for rank, res in enumerate(item['results'], 1):
                score = res['rerank_score']
                fname = res['filename']
                snippet = res['text'][:200].replace('\n', ' ')
                out.write(f"  📌 Rank {rank} | Score: {score:.4f} | File: {fname}\n")
                out.write(f"     Snippet: {snippet}...\n\n")
            out.flush()
        out.write("=" * 80 + "\n")
        out.flush()

    @staticmethod
    def show_message(msg: str):
        print(f"💡 {msg}")

    @staticmethod
    def show_error(err: str):
        print(f"❌ ERROR: {err}", file=sys.stderr)
