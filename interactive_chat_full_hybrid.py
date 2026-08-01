"""
==============================================================================
GSTGPT - PURE DIRECT RAG SEARCH CLI (interactive_chat_full_hybrid.py)
==============================================================================
Displays exact retrieved statutory PDF text snippets directly.
No LLM call — pure retrieval quality evaluation mode.
==============================================================================
"""
import config
from models.rag_engine import HybridRAGEngine

def run_chat():
    print("=" * 80)
    print("⚡ [GSTGPT PURE RAG SEARCH v3.0] Direct Statutory Retrieval Engine")
    print("=" * 80)
    
    engine = HybridRAGEngine()
    
    print("\n💡 Type your GST legal query to see exact retrieved PDF source texts.")
    print("   Type 'exit' or 'quit' to stop.\n")
    print("-" * 80)

    while True:
        try:
            user_input = input("\n👤 Query: ").strip()
            if not user_input:
                continue
            if user_input.lower() in ["exit", "quit", "/bye"]:
                print("👋 Exiting GSTGPT Search.")
                break

            print("\n⚡ Searching statutory database...")
            retrieved_chunks = engine.search(user_input, top_k=3)

            if not retrieved_chunks:
                print("⚠️ No relevant GST legal documents found.")
                continue

            print("\n" + "=" * 80)
            print(f"🎯 TOP {len(retrieved_chunks)} RETRIEVED STATUTORY DOCUMENTS:")
            print("=" * 80)

            for idx, item in enumerate(retrieved_chunks, 1):
                fn = item.get("filename", "Doc")
                score = item.get("rerank_score", 0.0)
                year = item.get("year", "N/A")
                cat = item.get("category", "N/A")
                text = item.get("text", "").strip()

                print(f"\n📄 RANK [{idx}] | Source: {fn} | Score: {score:.4f} | Category: {cat} | Year: {year}")
                print("-" * 80)
                print(f"{text[:600]}...")
                print("-" * 80)

        except (KeyboardInterrupt, EOFError):
            print("\n👋 Exiting GSTGPT Search.")
            break

if __name__ == "__main__":
    run_chat()
