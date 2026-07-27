"""
==============================================================================
GSTGPT - HYBRID RAG ENGINE MODEL (models/rag_engine.py)
==============================================================================
[MVC ROLE: MODEL LAYER - RETRIEVAL ENGINE]
Is file me GSTGPT ka Sabse Accurate **Hybrid RAG Engine (v3.0 - Stable)** hai.
Dono Retrievers ka Combination:
1. BM25 Lexical Keyword Search (Section 52, GSTR-3B, Notification Numbers)
2. ChromaDB Vector Store with BAAI/bge-small-en-v1.5 Embeddings (Semantic Search)
3. Reciprocal Rank Fusion (RRF)
4. Cross-Encoder Re-Ranker (ms-marco-MiniLM-L-6-v2)
==============================================================================
"""

import json
import re
from pathlib import Path
from typing import List, Dict, Any

from sentence_transformers import SentenceTransformer, CrossEncoder
from rank_bm25 import BM25Okapi
import chromadb

import config

from models.query_rewriter import QueryRewriter

class HybridRAGEngine:
    def __init__(self, 
                 chroma_path: str = config.CHROMA_DB_PATH,
                 collection_name: str = config.COLLECTION_NAME,
                 embedding_model_name: str = config.EMBEDDING_MODEL,
                 reranker_model_name: str = config.RERANKER_MODEL):
        
        print("🤖 [RAG Model] Loading Embedding Model & Re-Ranker...")
        self.embedder = SentenceTransformer(embedding_model_name)
        self.reranker = CrossEncoder(reranker_model_name)
        self.rewriter = QueryRewriter()

        print(f"🗄️  [RAG Model] Connecting to ChromaDB at: {chroma_path}")
        self.client = chromadb.PersistentClient(path=chroma_path)
        
        # Ensure collection exists
        try:
            self.collection = self.client.get_collection(name=collection_name)
        except Exception:
            print(f"⚠️ Collection '{collection_name}' not found. Creating empty collection...")
            self.collection = self.client.create_collection(name=collection_name)

        self.documents = []
        self.metadatas = []
        self.doc_ids = []
        self.bm25 = None
        
        # Initialize BM25 Keyword Search Index
        self.refresh_bm25()

    def _tokenize(self, text: str) -> List[str]:
        """Lowercases and extracts words + section/year/notification numbers."""
        return re.findall(r'\w+', text.lower())

    def refresh_bm25(self):
        """Loads indexed chunks from ChromaDB and builds BM25 index."""
        data = self.collection.get(include=["documents", "metadatas"])
        self.documents = data.get("documents", [])
        self.metadatas = data.get("metadatas", [])
        self.doc_ids = data.get("ids", [])

        if self.documents:
            tokenized_corpus = [self._tokenize(doc) for doc in self.documents]
            self.bm25 = BM25Okapi(tokenized_corpus)
            print(f"✅ [RAG Model] BM25 Index Ready! Total Chunks Indexed: {len(self.documents)}")
        else:
            print("⚠️ [RAG Model] ChromaDB is currently empty. Run indexing first!")
            self.bm25 = None

    def build_or_reindex_chromadb(self, cleaned_file: Path = config.INPUT_CLEANED_FILE):
        """Builds ChromaDB vector database from cleaned JSONL dataset."""
        print(f"⚡ [RAG Model] Building ChromaDB vector index from: {cleaned_file}")
        if not cleaned_file.exists():
            print(f"❌ Cleaned dataset not found at {cleaned_file}")
            return False

        # Reset collection
        try:
            self.client.delete_collection(name=config.COLLECTION_NAME)
        except Exception:
            pass
        self.collection = self.client.create_collection(name=config.COLLECTION_NAME)

        all_chunks = []
        all_metas = []
        all_ids = []

        def chunk_text(text: str, chunk_size: int = 300, overlap: int = 50):
            words = text.split()
            if len(words) <= chunk_size:
                return [text]
            chunks = []
            start = 0
            while start < len(words):
                end = min(start + chunk_size, len(words))
                chunks.append(" ".join(words[start:end]))
                if end == len(words):
                    break
                start += (chunk_size - overlap)
            return chunks

        with open(cleaned_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                rec = json.loads(line)
                raw_text = rec.get("clean_text", "")
                chunks = chunk_text(raw_text)

                for idx, c_text in enumerate(chunks):
                    doc_id = f"{rec.get('id', 'doc')}_{idx}"
                    all_chunks.append(c_text)
                    all_ids.append(doc_id)
                    all_metas.append({
                        "filename": rec.get("filename", ""),
                        "category": rec.get("category", ""),
                        "year": str(rec.get("year", ""))
                    })

        print(f"📦 Computing dense embeddings for {len(all_chunks)} chunks...")
        embeddings = self.embedder.encode(
            [f"Represent this sentence: {t}" for t in all_chunks],
            normalize_embeddings=True,
            show_progress_bar=True
        ).tolist()

        # Batch insert into ChromaDB
        batch_size = 500
        for i in range(0, len(all_chunks), batch_size):
            end_i = i + batch_size
            self.collection.add(
                documents=all_chunks[i:end_i],
                embeddings=embeddings[i:end_i],
                metadatas=all_metas[i:end_i],
                ids=all_ids[i:end_i]
            )

        print("✅ Vector Store Indexing Complete!")
        self.refresh_bm25()
        return True

    def search(self, query: str, top_k: int = config.RAG_TOP_K, candidate_k: int = config.RAG_CANDIDATE_K) -> List[Dict[str, Any]]:
        """
        Executes Hybrid RAG Pipeline v3.0:
        1. BM25 Keyword Search -> Candidate Pool
        2. ChromaDB Dense Vector Search -> Candidate Pool
        3. Reciprocal Rank Fusion (RRF) -> Merged Pool
        4. Cross-Encoder Re-Ranking -> Final Ranked Results
        """
        if not self.documents or not self.bm25:
            print("⚠️ Cannot search: Index is empty!")
            return []

        # Dynamic LLM / Semantic Query Expansion
        expanded_query = self.rewriter.rewrite(query)
        query_tokens = self._tokenize(expanded_query)

        # 1. BM25 Lexical Keyword Search
        bm25_scores = self.bm25.get_scores(query_tokens)
        bm25_top_indices = sorted(range(len(bm25_scores)), key=lambda i: bm25_scores[i], reverse=True)[:candidate_k]

        # 2. Dense Vector Search
        query_embedding = self.embedder.encode(f"Represent this sentence: {expanded_query}", normalize_embeddings=True).tolist()
        vector_res = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(candidate_k, len(self.documents)),
            include=["documents", "metadatas", "distances"]
        )

        vector_doc_ids = vector_res["ids"][0] if vector_res["ids"] else []
        id_to_idx = {doc_id: i for i, doc_id in enumerate(self.doc_ids)}

        # 3. Reciprocal Rank Fusion (RRF)
        rrf_scores = {}
        K_RRF = 60

        for rank, idx in enumerate(bm25_top_indices):
            doc_id = self.doc_ids[idx]
            rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (K_RRF + rank + 1)

        for rank, doc_id in enumerate(vector_doc_ids):
            rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (K_RRF + rank + 1)

        sorted_candidates = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:candidate_k]

        candidate_docs, candidate_metas = [], []
        for doc_id, _ in sorted_candidates:
            if doc_id in id_to_idx:
                idx = id_to_idx[doc_id]
                candidate_docs.append(self.documents[idx])
                candidate_metas.append(self.metadatas[idx])

        if not candidate_docs:
            return []

        # 4. Cross-Encoder Re-Ranking
        pairs = [[query, doc] for doc in candidate_docs]
        rerank_scores = self.reranker.predict(pairs)

        ranked_results = []
        for i in range(len(candidate_docs)):
            ranked_results.append({
                "rerank_score": float(rerank_scores[i]),
                "text": candidate_docs[i],
                "filename": candidate_metas[i].get("filename", ""),
                "category": candidate_metas[i].get("category", ""),
                "year": candidate_metas[i].get("year", ""),
            })

        ranked_results.sort(key=lambda x: x["rerank_score"], reverse=True)
        return ranked_results[:top_k]
