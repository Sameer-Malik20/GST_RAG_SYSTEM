"""
==============================================================================
GSTGPT - TWO-TIER HYBRID RAG ENGINE (models/rag_engine.py)
==============================================================================
[MVC ROLE: MODEL LAYER - RETRIEVAL ENGINE]
Hybrid RAG Engine v3.5 (Two-Tier Synopsis + Full-Text Search):
1. Tier-1: Synopsis Vector Search (Finds correct DOCUMENT from plain-English summaries)
2. Tier-2: Full-Text BM25 + Dense Vector Search (Finds correct CHUNK from document)
3. Reciprocal Rank Fusion (RRF) with Synopsis Boosting
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
                 synopsis_collection_name: str = config.SYNOPSIS_COLLECTION_NAME,
                 embedding_model_name: str = config.EMBEDDING_MODEL,
                 reranker_model_name: str = config.RERANKER_MODEL):
        
        print("🤖 [RAG Model] Loading Embedding Model & Re-Ranker...")
        self.embedder = SentenceTransformer(embedding_model_name)
        self.reranker = CrossEncoder(reranker_model_name)
        self.rewriter = QueryRewriter()

        print(f"🗄️  [RAG Model] Connecting to ChromaDB at: {chroma_path}")
        self.client = chromadb.PersistentClient(path=chroma_path)
        
        # Full-text chunks collection (v3 original)
        try:
            self.collection = self.client.get_collection(name=collection_name)
        except Exception:
            print(f"⚠️ Collection '{collection_name}' not found. Creating empty collection...")
            self.collection = self.client.create_collection(name=collection_name)

        # Synopsis collection (new Tier-1)
        try:
            self.synopsis_collection = self.client.get_collection(name=synopsis_collection_name)
            syn_count = self.synopsis_collection.count()
            if syn_count > 0:
                print(f"📋 [RAG Model] Synopsis Index Loaded: {syn_count} document summaries")
            self.has_synopsis = syn_count > 0
        except Exception:
            print(f"⚠️ Synopsis collection '{synopsis_collection_name}' not found. Creating empty...")
            self.synopsis_collection = self.client.create_collection(name=synopsis_collection_name)
            self.has_synopsis = False

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
        """Builds ChromaDB with two collections: Full-Text chunks + Synopsis summaries."""
        print(f"⚡ [RAG Model] Building Two-Tier ChromaDB index from: {cleaned_file}")
        if not cleaned_file.exists():
            print(f"❌ Cleaned dataset not found at {cleaned_file}")
            return False

        # --- TIER 1: Full-Text Chunks (v3 original logic) ---
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

        print(f"📦 Computing dense embeddings for {len(all_chunks)} full-text chunks...")
        embeddings = self.embedder.encode(
            [f"Represent this sentence: {t}" for t in all_chunks],
            normalize_embeddings=True,
            show_progress_bar=True
        ).tolist()

        batch_size = 500
        for i in range(0, len(all_chunks), batch_size):
            end_i = i + batch_size
            self.collection.add(
                documents=all_chunks[i:end_i],
                embeddings=embeddings[i:end_i],
                metadatas=all_metas[i:end_i],
                ids=all_ids[i:end_i]
            )

        print("✅ Tier-1 Full-Text Indexing Complete!")

        # --- TIER 2: Synopsis Collection ---
        synopses_file = config.SYNOPSES_FILE
        if synopses_file.exists():
            try:
                self.client.delete_collection(name=config.SYNOPSIS_COLLECTION_NAME)
            except Exception:
                pass
            self.synopsis_collection = self.client.create_collection(name=config.SYNOPSIS_COLLECTION_NAME)

            with open(synopses_file, "r", encoding="utf-8") as sf:
                synopses_data = json.load(sf)

            syn_texts = []
            syn_metas = []
            syn_ids = []

            for filename, syn_info in synopses_data.items():
                syn_texts.append(syn_info["synopsis"])
                syn_metas.append({
                    "filename": filename,
                    "category": syn_info.get("category", ""),
                    "year": syn_info.get("year", "")
                })
                syn_ids.append(f"syn_{filename}")

            print(f"📦 Computing embeddings for {len(syn_texts)} synopses...")
            syn_embeddings = self.embedder.encode(
                [f"Represent this sentence: {s}" for s in syn_texts],
                normalize_embeddings=True,
                show_progress_bar=True
            ).tolist()

            for i in range(0, len(syn_texts), batch_size):
                end_i = i + batch_size
                self.synopsis_collection.add(
                    documents=syn_texts[i:end_i],
                    embeddings=syn_embeddings[i:end_i],
                    metadatas=syn_metas[i:end_i],
                    ids=syn_ids[i:end_i]
                )

            self.has_synopsis = True
            print(f"✅ Tier-2 Synopsis Indexing Complete! ({len(syn_texts)} summaries)")
        else:
            print(f"⚠️ Synopsis file not found at {synopses_file}. Run 'python generate_synopses.py' first!")
            self.has_synopsis = False

        self.refresh_bm25()
        return True

    def _synopsis_pre_search(self, query_embedding: list) -> set:
        """Tier-1: Searches synopsis collection to identify top matching filenames."""
        if not self.has_synopsis:
            return set()

        try:
            synopsis_res = self.synopsis_collection.query(
                query_embeddings=[query_embedding],
                n_results=config.SYNOPSIS_TOP_K,
                include=["metadatas", "distances"]
            )
            
            matched = set()
            if synopsis_res and synopsis_res.get("metadatas"):
                for meta in synopsis_res["metadatas"][0]:
                    if meta and "filename" in meta:
                        matched.add(meta["filename"])
            return matched
        except Exception:
            return set()

    def _regex_notification_boost(self, query: str) -> tuple:
        """
        Extracts notification, order, and circular numbers (e.g. 49/2019, 07/2025, 01/2017)
        and matches target filenames from database metadatas and chunk texts.
        Returns: (all_exact_matches, primary_header_matches)
        """
        exact_matches = set()
        header_matches = set()
        matches = re.findall(r'(\d{1,3})[/_-](\d{4})', query)
        if not matches:
            return exact_matches, header_matches

        q_lower = query.lower()
        is_rate_query = any(k in q_lower for k in ["rate", "ctr", "itr", "utr", "tax (rate)", "rate)"])

        for num, year in matches:
            num_clean = str(int(num))
            num_padded = num.zfill(2)
            
            pattern_fn = r'(?:ctr|ct|itr|utr|order|cir|notfctn|notification|[-_\s]|^)' + re.escape(num_padded) + r'[-_\s\.\(a-z]'
            pattern_fn_clean = r'(?:ctr|ct|itr|utr|order|cir|notfctn|notification|[-_\s]|^)' + re.escape(num_clean) + r'[-_\s\.\(a-z]'
            
            # Flexible regex pattern for headers in document text (e.g. Notification No. 49/2019, Order No. 01/2017)
            header_regex = re.compile(rf'(?:notification|order|circular)\s+no\.?\s*{num_clean}[\s/_-]+{year}', re.IGNORECASE)
            
            text_patterns = [
                f"notification no. {num_clean}/{year}",
                f"notification no. {num_padded}/{year}",
                f"notification {num_clean}/{year}",
                f"order no. {num_clean}/{year}",
                f"order no. {num_padded}/{year}",
                f"circular no. {num_clean}/{year}",
                f"{num_clean}/{year} – central tax",
                f"{num_clean}/{year}-central tax"
            ]
            
            for idx, meta in enumerate(self.metadatas):
                fn = meta.get("filename", "").lower()
                cat = meta.get("category", "").lower()
                meta_year = str(meta.get("year", ""))
                doc_text = self.documents[idx].lower() if idx < len(self.documents) else ""
                
                year_compatible = (year in fn) or (meta_year == year) or (year in doc_text[:500])
                if not year_compatible:
                    continue


                fn_matched = bool(re.search(pattern_fn, fn) or re.search(pattern_fn_clean, fn))
                header_matched = bool(header_regex.search(doc_text[:800])) or any(p in doc_text[:800] for p in text_patterns)
                text_matched = any(p in doc_text for p in text_patterns)
                
                if fn_matched or header_matched:
                    header_matches.add(meta.get("filename"))
                    exact_matches.add(meta.get("filename"))
                elif text_matched:
                    exact_matches.add(meta.get("filename"))


        # Date pattern extraction (e.g. July 10, 2024 -> 11072024)
        month_map = {"january":"01","february":"02","march":"03","april":"04","may":"05","june":"06","july":"07","august":"08","september":"09","october":"10","november":"11","december":"12"}
        date_matches = re.findall(r'(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})', q_lower)
        
        for month, day, yr in date_matches:
            m_num = month_map.get(month, "")
            d_num = day.zfill(2)
            for meta in self.metadatas:
                fn = meta.get("filename", "").lower()
                if yr in fn and (f"{d_num}{m_num}{yr}" in fn or f"11{m_num}{yr}" in fn):
                    exact_matches.add(meta.get("filename"))

        return exact_matches, header_matches

    def search(self, query: str, top_k: int = config.RAG_TOP_K, candidate_k: int = config.RAG_CANDIDATE_K) -> List[Dict[str, Any]]:
        """
        Two-Tier Hybrid RAG Pipeline v3.5 with Regex Notification Booster:
        1. Regex Notification Booster -> Detects exact notification numbers
        2. Synopsis Pre-Search -> Identify target filenames
        3. BM25 Keyword Search + Dense Vector Search -> Candidate Pool
        4. RRF Merge + Regex/Synopsis Heavy Boost
        5. Cross-Encoder Re-Ranking -> Final Results
        """
        if not self.documents or not self.bm25:
            print("⚠️ Cannot search: Index is empty!")
            return []

        # Query Expansion
        expanded_query = self.rewriter.rewrite(query)
        query_tokens = self._tokenize(expanded_query)

        # Compute query embedding (shared between synopsis search and vector search)
        query_embedding = self.embedder.encode(
            f"Represent this sentence: {expanded_query}",
            normalize_embeddings=True
        ).tolist()

        # TIER 1a: Regex Notification Number Booster
        regex_matched, header_matched_filenames = self._regex_notification_boost(query)
        if regex_matched:
            print(f"⚡ [Regex Booster] Exact Notification Match: {regex_matched}")

        # TIER 1b: Synopsis Pre-Search (find target documents)
        matched_filenames = self._synopsis_pre_search(query_embedding)
        if regex_matched:
            matched_filenames.update(regex_matched)

        if matched_filenames:
            print(f"📋 [Synopsis & Regex] Matched documents: {matched_filenames}")

        # TIER 2a: BM25 Lexical Keyword Search
        bm25_scores = self.bm25.get_scores(query_tokens)
        bm25_top_indices = sorted(range(len(bm25_scores)), key=lambda i: bm25_scores[i], reverse=True)[:candidate_k]

        # TIER 2b: Dense Vector Search
        vector_res = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(candidate_k, len(self.documents)),
            include=["documents", "metadatas", "distances"]
        )

        vector_doc_ids = vector_res["ids"][0] if vector_res["ids"] else []
        id_to_idx = {doc_id: i for i, doc_id in enumerate(self.doc_ids)}

        # TIER 3: Reciprocal Rank Fusion (RRF) + Synopsis Heavy Boost
        rrf_scores = {}
        K_RRF = 60

        for rank, idx in enumerate(bm25_top_indices):
            doc_id = self.doc_ids[idx]
            rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (K_RRF + rank + 1)

        for rank, doc_id in enumerate(vector_doc_ids):
            doc_id = self.doc_ids[id_to_idx[doc_id]] if doc_id in id_to_idx else doc_id
            rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (K_RRF + rank + 1)

        # Force candidate inclusion for exact regex notification matched files
        if regex_matched:
            for idx, meta in enumerate(self.metadatas):
                fn = meta.get("filename", "")
                if fn in regex_matched:
                    doc_id = self.doc_ids[idx]
                    rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 5.0 # Guaranteed inclusion

        # Synopsis & Regex Heavy Boost
        if matched_filenames:
            for doc_id in list(rrf_scores.keys()):
                if doc_id in id_to_idx:
                    idx = id_to_idx[doc_id]
                    fn = self.metadatas[idx].get("filename", "")
                    if fn in header_matched_filenames:
                        rrf_scores[doc_id] += 15.0
                    elif fn in regex_matched:
                        rrf_scores[doc_id] += 10.0
                    elif fn in matched_filenames:
                        rrf_scores[doc_id] += 0.50

        sorted_candidates = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:candidate_k]

        candidate_docs, candidate_metas = [], []
        for doc_id, _ in sorted_candidates:
            if doc_id in id_to_idx:
                idx = id_to_idx[doc_id]
                candidate_docs.append(self.documents[idx])
                candidate_metas.append(self.metadatas[idx])

        if not candidate_docs:
            return []

        # TIER 4: Cross-Encoder Re-Ranking with Regex & Synopsis Priority Preservation
        pairs = [[query, doc] for doc in candidate_docs]
        rerank_scores = self.reranker.predict(pairs)

        ranked_results = []
        for i in range(len(candidate_docs)):
            fn = candidate_metas[i].get("filename", "")
            base_score = float(rerank_scores[i])
            
            # Preserve regex & synopsis match priority in cross-encoder ranking
            boost = 0.0
            if fn in header_matched_filenames:
                boost += 40.0
            elif fn in regex_matched:
                boost += 20.0
            elif fn in matched_filenames:
                boost += 10.0

            final_score = base_score + boost
            
            ranked_results.append({
                "rerank_score": final_score,
                "raw_score": base_score,
                "text": candidate_docs[i],
                "filename": fn,
                "category": candidate_metas[i].get("category", ""),
                "year": candidate_metas[i].get("year", ""),
            })

        ranked_results.sort(key=lambda x: x["rerank_score"], reverse=True)
        return ranked_results[:top_k]



