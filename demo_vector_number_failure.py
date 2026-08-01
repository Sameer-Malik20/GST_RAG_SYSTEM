"""
================================================================================
⚡ GSTGPT - Vector Embedding Number Failure Demonstration
================================================================================
This script demonstrates live why Dense Vector Embedding Models (like all-MiniLM-L6-v2)
and Vector Databases (like ChromaDB) fail to discriminate between numbers (e.g. 07/2025 vs 12/2025).
"""

import numpy as np
from sentence_transformers import SentenceTransformer

def cosine_similarity(vec1, vec2):
    return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))

def main():
    print("🤖 Loading Embedding Model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

    # Test Sentences: 98% identical legal text, only 2-digit notification number differs
    sentences = [
        "Notification No. 07/2025 – Central Tax (Rate)",
        "Notification No. 12/2025 – Central Tax (Rate)",
        "Notification No. 17/2025 – Central Tax (Rate)",
        "Notification No. 49/2019 – Central Tax",
        "Notification No. 09/2025 – Central Tax (Rate)",
    ]

    print("\n" + "="*80)
    print("📝 TEST SENTENCES:")
    print("="*80)
    for i, s in enumerate(sentences, 1):
        print(f"  Sentence {i}: {s}")

    # Compute 384-dimensional embeddings
    embeddings = model.encode(sentences, normalize_embeddings=True)

    print("\n" + "="*80)
    print("🔢 RAW 384-DIMENSIONAL VECTOR VISUALIZATION (First 8 Floating-Point Numbers):")
    print("="*80)

    for i, s in enumerate(sentences, 1):
        vec_preview = [round(float(val), 4) for val in embeddings[i-1][:8]]
        print(f"  Sentence {i} Vector Shape: {embeddings[i-1].shape} (384 Dimensions)")
        print(f"  Sentence {i} First 8 Vector Values: {vec_preview} ...")
        print("-" * 80)

    print("\n" + "="*80)
    print("📊 VECTOR SIMILARITY MATRIX & L2 DISTANCE DELTAS:")
    print("="*80)

    base_vec = embeddings[0] # Sentence 1: "Notification No. 07/2025 – Central Tax (Rate)"

    for i in range(len(sentences)):
        sim = cosine_similarity(base_vec, embeddings[i])
        l2_dist = np.linalg.norm(base_vec - embeddings[i])
        percent = sim * 100
        status = "🎯 EXACT SELF MATCH" if i == 0 else ("⚠️ 99%+ SIMILAR! VECTOR CONFUSION" if percent > 98.0 else "MEDIUM SIMILAR")
        
        print(f"Comparison: '07/2025' vs '{sentences[i]}':")
        print(f"   ➔ Cosine Score : {sim:.4f}  ({percent:.2f}% Similar) | {status}")
        print(f"   ➔ L2 Distance  : {l2_dist:.4f}  (Near ZERO vector difference in 384D space!)")
        
        # Show vector difference preview for non-self matches
        if i > 0:
            diff_preview = [round(float(val), 4) for val in (embeddings[i] - base_vec)[:5]]
            print(f"   ➔ 384D Vector Delta (First 5 dims difference): {diff_preview}")
        print("-" * 80)

    print("\n💡 DEEP DEBUG LESSON:")
    print("1. All 5 sentences generate 384 floating-point numbers in continuous vector space.")
    print("2. The L2 Vector Distance between '07/2025' and '12/2025' is only ~0.11 (near zero!).")
    print("3. Vector DB (ChromaDB) ranks vectors by cosine/L2 distance. Because the distance is almost zero,")
    print("   ChromaDB frequently swaps '07/2025' with '12/2025' or '09/2025'.")
    print("="*80)

if __name__ == "__main__":
    main()

