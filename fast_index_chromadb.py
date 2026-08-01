"""
==============================================================================
FAST CHROMADB TWO-TIER INDEXER v3.5 (fast_index_chromadb.py)
==============================================================================
Indexes all GST documents into ChromaDB with two collections:
1. Full-text chunks ('gst_notifications') — for text retrieval
2. Synopsis summaries ('gst_synopsis') — for document identification

Usage:
    python fast_index_chromadb.py
    
Prerequisites:
    Run 'python generate_synopses.py' first to create synopsis data!
==============================================================================
"""
import time
from models.rag_engine import HybridRAGEngine

def build_index():
    start_t = time.time()
    print("🚀 Initializing Two-Tier ChromaDB Vector Indexing Engine...")
    engine = HybridRAGEngine()
    success = engine.build_or_reindex_chromadb()
    
    elapsed = time.time() - start_t
    if success:
        print(f"\n✅ [GSTGPT RAG v3.5] Two-Tier Indexing Complete in {elapsed:.1f}s!")
        print(f"   Full-text chunks: {len(engine.documents)}")
        print(f"   Synopsis enabled: {'Yes' if engine.has_synopsis else 'No (run generate_synopses.py first)'}")
    else:
        print("\n❌ Indexing failed! Check that cleaned JSONL file exists.")

if __name__ == "__main__":
    build_index()
