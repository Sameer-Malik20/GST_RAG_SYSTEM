import sys
sys.path.append('c:/Projects/GSTGPT')
from models.rag_engine import HybridRAGEngine

def main():
    engine = HybridRAGEngine()

    categories_queries = {
        "1. SECTIONS": "Under Section 17(5) of the CGST Act 2017 what are the specific restrictions on claiming blocked Input Tax Credit on motor vehicles and personal consumption",
        "2. RULES": "According to Notification No. 49/2019-Central Tax introducing Rule 36(4) of the CGST Rules 2017 what was the restriction imposed on claiming Input Tax Credit for invoices not in GSTR-2A",
        "3. CIRCULARS / ORDERS": "Under Order No. 01/2017-GST issued on 21st July 2017 what extension of time limit was granted for furnishing the return in FORM GSTR-3B",
        "4. ACT YEARS & AMENDMENTS": "Under the CGST Act 2017 what changes were made in the Central Goods and Services Tax Amendment Act 2018 regarding section 39 return filing"
    }

    print("\n" + "="*80)
    print("🎯 TESTING 4 STATUTORY CATEGORIES: SECTIONS, RULES, CIRCULARS/ORDERS, ACT YEARS")
    print("="*80)

    for cat_name, q in categories_queries.items():
        res = engine.search(q, top_k=1)
        print(f"\n📌 [{cat_name}]")
        print(f"   Query: \"{q}\"")
        if res:
            top_fn = res[0]['filename']
            score = res[0]['rerank_score']
            snippet = res[0]['text'][:300].replace('\n', ' ')
            print(f"   ➔ Top #1 Retrieved PDF: {top_fn} | Rerank Score: {score:.4f}")
            print(f"   ➔ Source Snippet: {snippet}")
        else:
            print("   ❌ No document retrieved!")
        print("-" * 80)

if __name__ == "__main__":
    main()
