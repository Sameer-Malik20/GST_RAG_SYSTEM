import os
import json
import csv
import hashlib
import re

TAXOBUGGY_DIR = "TaxoBuggyDataJson"
OUTPUT_BASE = "processed_data"
MASTER_OUTPUT_DIR = "extracted_data/jsonl"

os.makedirs(OUTPUT_BASE, exist_ok=True)
os.makedirs(MASTER_OUTPUT_DIR, exist_ok=True)

# Category Folder Mapping
CATEGORY_MAPPING = {
    "01_central_tax": ["central 2017.json", "central 2018.json", "central 2019.json", "central 2020.json", "central 2021.json", "central 2022.json", "central 2023.json", "central 2024.json", "central 2025.json"],
    "02_central_tax_rate": ["central tax rate 2017.json", "central tax rate 2018.json", "central tax rate 2019.json", "central tax rate 2020.json", "central tax rate 2021.json", "central tax rate 2022.json", "central tax rate 2023.json", "central tax rate 2024.json", "central tax rate 2025.json"],
    "03_integrated_tax": ["integrated tax 2017.json", "integrated tax rate.json", "integrated tax.json"],
    "04_union_territory_and_sgst": ["onion terrotiry tax rate.json", "union tratory tax.json", "SGST_ACT.json"],
    "05_circulars_and_orders": ["circular_IGST.json", "circulor_CGST.json", "orders.json"],
    "06_compensation_cess": ["commision_cess.json", "compensation cess 2017.json", "compensation cess 2018.json", "compensation cess 2019.json", "compensation cess rate 2017.json", "compensation cess rate 2018.json", "compensation cess rate 2019.json", "compensation cess rate 2021.json", "compensation cess rate 2023.json", "compensation cess rate 2024.json", "compensation cess rate 2025.json", "compensations cess 2022.json", "compensations cess 2023.json"],
    "07_court_judgements": ["gst_judgement_chunks.json"],
    "08_case_studies_and_replies": ["Case scenarios.json", "Case_study.json", "draft_reply.json"],
    "09_advisories_and_faqs": ["faqs.json", "forms.json", "gstn_advisory.json", "guidelines.json", "kits.json", "tempary_issues.json"],
    "10_general_notifications": ["TaxoBuddyData.json", "nofication_data.json", "notification.json", "structured_output.json"]
}

def clean_text(text):
    if not text:
        return ""
    # Fix common encoding artifacts
    text = text.replace("â\x80\x93", "–").replace("â\x80\x94", "—").replace("â\x80\x99", "'").replace("â\x80\x9c", '"').replace("â\x80\x9d", '"')
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def hash_content(text):
    return hashlib.sha256(text.lower().encode('utf-8')).hexdigest()

def extract_chunks_from_file(file_path, category_name):
    chunks = []
    fname = os.path.basename(file_path)
    
    if not os.path.exists(file_path):
        return chunks
        
    try:
        if file_path.endswith(".json"):
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                data = json.load(f)
                
            if isinstance(data, list):
                for idx, item in enumerate(data):
                    if isinstance(item, dict):
                        # Extract text field
                        raw_txt = item.get("text") or item.get("clean_text") or item.get("content") or ""
                        if not raw_txt and "chunks" in item and isinstance(item["chunks"], list):
                            raw_txt = " ".join([c.get("text", "") for c in item["chunks"] if isinstance(c, dict)])
                        
                        txt = clean_text(raw_txt)
                        if len(txt) < 20: # Filter out empty/too small chunks
                            continue
                            
                        chunk_id = item.get("chunk_id") or item.get("doc_id") or f"{fname}_{idx}"
                        source_file = item.get("source_file") or item.get("source") or item.get("title") or fname
                        year = item.get("year") or ""
                        tax_type = item.get("tax_type") or item.get("doc_type") or category_name
                        
                        chunks.append({
                            "chunk_id": str(chunk_id),
                            "clean_text": txt,
                            "filename": str(source_file),
                            "category": str(tax_type),
                            "year": str(year),
                            "raw_source_file": fname
                        })
            elif isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, list):
                        for idx, item in enumerate(v):
                            if isinstance(item, dict):
                                txt = clean_text(item.get("text") or item.get("clean_text") or "")
                                if len(txt) >= 20:
                                    chunks.append({
                                        "chunk_id": f"{fname}_{k}_{idx}",
                                        "clean_text": txt,
                                        "filename": str(item.get("source_file", fname)),
                                        "category": category_name,
                                        "year": str(item.get("year", "")),
                                        "raw_source_file": fname
                                    })

        elif file_path.endswith(".csv"):
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.DictReader(f)
                for idx, row in enumerate(reader):
                    txt = clean_text(row.get("text") or row.get("clean_text") or row.get("judgement") or "")
                    if len(txt) >= 20:
                        chunks.append({
                            "chunk_id": f"{fname}_{idx}",
                            "clean_text": txt,
                            "filename": row.get("case_number") or row.get("source_file") or fname,
                            "category": category_name,
                            "year": str(row.get("year", "")),
                            "raw_source_file": fname
                        })
    except Exception as e:
        print(f"⚠️ Error processing {file_path}: {e}")
        
    return chunks

def generate_synopsis_for_chunk(chunk):
    txt = chunk["clean_text"]
    fn = chunk["filename"]
    cat = chunk["category"]
    yr = chunk["year"]
    
    first_sentence = txt.split(". ")[0][:200]
    synopsis_text = f"{cat} ({yr}). {first_sentence}"
    
    return {
        "synopsis": synopsis_text,
        "category": cat,
        "year": yr,
        "word_count": len(txt.split()),
        "method": "auto_extracted"
    }

def main():
    print("🚀 Starting TaxoBuggy Data Processing & Categorization Pipeline...\n")
    
    global_seen_hashes = set()
    master_chunks = []
    master_synopses = {}
    
    category_summary = {}
    
    for cat_name, file_list in CATEGORY_MAPPING.items():
        cat_folder = os.path.join(OUTPUT_BASE, cat_name)
        os.makedirs(cat_folder, exist_ok=True)
        
        cat_chunks = []
        cat_synopses = {}
        cat_seen_hashes = set()
        
        print(f"📂 Processing Category: {cat_name} ({len(file_list)} files)")
        
        for fname in file_list:
            fpath = os.path.join(TAXOBUGGY_DIR, fname)
            extracted = extract_chunks_from_file(fpath, cat_name)
            
            dedup_count = 0
            for item in extracted:
                c_hash = hash_content(item["clean_text"])
                if c_hash not in global_seen_hashes:
                    global_seen_hashes.add(c_hash)
                    cat_seen_hashes.add(c_hash)
                    cat_chunks.append(item)
                    master_chunks.append(item)
                    
                    # Generate synopsis
                    fn_key = item["filename"]
                    if fn_key not in cat_synopses:
                        syn_item = generate_synopsis_for_chunk(item)
                        cat_synopses[fn_key] = syn_item
                        master_synopses[fn_key] = syn_item
                else:
                    dedup_count += 1
                    
            print(f"   - {fname}: Extracted {len(extracted)} chunks (Deduplicated {dedup_count})")
            
        # Write Category Output Files
        cat_jsonl_path = os.path.join(cat_folder, "gst_ai_dataset_cleaned.jsonl")
        with open(cat_jsonl_path, "w", encoding="utf-8") as f:
            for item in cat_chunks:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
                
        cat_synopses_path = os.path.join(cat_folder, "gst_synopses.json")
        with open(cat_synopses_path, "w", encoding="utf-8") as f:
            json.dump(cat_synopses, f, indent=2, ensure_ascii=False)
            
        category_summary[cat_name] = {
            "unique_chunks": len(cat_chunks),
            "unique_documents": len(cat_synopses)
        }
        print(f"   ✅ Saved {len(cat_chunks)} clean chunks to {cat_jsonl_path}\n")

    # Write Master Output Files
    master_jsonl_path = os.path.join(MASTER_OUTPUT_DIR, "gst_ai_dataset_cleaned.jsonl")
    with open(master_jsonl_path, "w", encoding="utf-8") as f:
        for item in master_chunks:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    master_synopses_path = os.path.join(MASTER_OUTPUT_DIR, "gst_synopses.json")
    with open(master_synopses_path, "w", encoding="utf-8") as f:
        json.dump(master_synopses, f, indent=2, ensure_ascii=False)
        
    print("="*80)
    print("🎉 DATASET PROCESSING & CATEGORIZATION COMPLETE!")
    print("="*80)
    print(f"📊 Total Master Cleaned Unique Chunks: {len(master_chunks)}")
    print(f"📋 Total Master Unique Document Summaries: {len(master_synopses)}")
    print(f"💾 Master Cleaned Dataset saved to: {master_jsonl_path}")
    print(f"💾 Master Synopses saved to: {master_synopses_path}\n")
    
    print("📁 CATEGORY SUMMARY:")
    for cat_name, stats in category_summary.items():
        print(f"   • {cat_name}: {stats['unique_chunks']} Chunks | {stats['unique_documents']} Summaries")

if __name__ == "__main__":
    main()
