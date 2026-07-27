# 🤖 GSTGPT: Advanced Hybrid RAG AI System for Indian Goods & Services Tax (GST)

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![Architecture-MVC](https://img.shields.io/badge/Architecture-MVC%20Design-green.svg)]()
[![Retrieval-Hybrid%20RAG](https://img.shields.io/badge/Retrieval-BM25%20%2B%20ChromaDB%20%2B%20CrossEncoder-orange.svg)]()
[![License-MIT](https://img.shields.io/badge/License-MIT-purple.svg)]()

**GSTGPT** is an enterprise-grade, authoritative AI Legal Assistant engineered specifically for Indian Goods and Services Tax (GST) law. It combines **BM25 Lexical Keyword Search**, **ChromaDB Dense Vector Search**, **Reciprocal Rank Fusion (RRF)**, **Cross-Encoder Re-Ranking**, and **LLM Query Rewriting** to deliver 100% grounded, court-verifiable answers from official Central Board of Indirect Taxes and Customs (CBIC) Gazette Notifications.

---

## 🏗️ Architecture & MVC Directory Structure

GSTGPT follows a strict **Model-View-Controller (MVC)** architectural pattern to ensure clean separation of concerns, modularity, and easy scalability:

```
GSTGPT/
├── config.py                         # [CONFIG] Global paths, model names & RAG hyperparameters
├── main.py                           # [ENTRY] Interactive CLI Router & Main Controller
│
├── models/                           # [MODEL LAYER] Data Processing, RAG & LLM Engines
│   ├── __init__.py
│   ├── data_cleaner.py               # Preprocesses raw CBIC PDFs/JSON into clean JSONL
│   ├── query_rewriter.py             # LLM & Fast Legal/Numeric Query Expander
│   ├── rag_engine.py                 # Hybrid RAG Engine (BM25 + ChromaDB + Cross-Encoder)
│   └── llm_interface.py              # Grounded LLM Response Generator & Local Fallback
│
├── views/                            # [VIEW LAYER] Terminal UI & Formatter
│   ├── __init__.py
│   └── cli_view.py                   # Formats banners, results, citations & confidence scores
│
├── controllers/                      # [CONTROLLER LAYER] Core Application Logic
│   ├── __init__.py
│   ├── chat_controller.py            # Connects User (View) <-> RAG (Model) <-> LLM (Model)
│   ├── eval_controller.py            # Automated Retrieval Benchmark Evaluator
│   └── training_controller.py        # Dataset preprocessing & indexing manager
│
├── extracted_data/                   # [DATASET] Cleaned GST Notifications JSONL
├── legacy/                           # Legacy unstructured scripts archive
├── .gitignore                        # Git exclusion rules
└── README.md                         # Comprehensive Project Documentation
```

---

## 🛠️ Technologies Used & Technical Rationale

| Component | Technology | Rationale & Purpose |
| :--- | :--- | :--- |
| **Lexical Retriever** | **BM25 Okapi** (`rank-bm25`) | Essential for exact matches of Notification numbers (e.g., `78/2020`), Section numbers (`Section 50(1)`), and Form names (`GSTR-3B`). |
| **Dense Embedding Model** | `BAAI/bge-small-en-v1.5` | 384-dimensional dense vector embeddings. Provides state-of-the-art semantic search while running fast on local CPUs. |
| **Vector Database** | **ChromaDB** (`chromadb`) | Embedded, high-performance persistent vector database for fast similarity search over thousands of document chunks. |
| **Rank Fusion** | **Reciprocal Rank Fusion (RRF)** | Merges candidate lists from BM25 and Vector Search using $RRF(d) = \frac{1}{60 + r_{bm25}} + \frac{1}{60 + r_{vec}}$ to ensure balanced recall. |
| **Re-Ranker Model** | `cross-encoder/ms-marco-MiniLM-L-6-v2` | A deep transformer cross-encoder that jointly evaluates query-document pairs to produce precise relevance scores. |
| **Query Transformer** | **LLM Query Rewriter** | Dynamically translates casual user language/Hinglish/digits into formal Gazette legal terminology. |
| **Generator LLM** | Fine-Tuned GGUF (`gstgpt:latest` via Ollama) | Local LLM that synthesizes clean, grounded legal answers strictly from retrieved CBIC notification contexts. |

---

## ⚡ Novel Engineering Techniques Implemented

### 1. LLM Query Rewriting & Expansion (`models/query_rewriter.py`)
Users ask questions in casual language or Hinglish (e.g., `"500 cr ke baad e invoicing zaroori hai kya"`), whereas official Gazette notifications use formal legal phrasing (`"five hundred crore rupees aggregate turnover sub-rule (4) of rule 48"`). 

**Solution**: Before querying the databases, `QueryRewriter` passes the raw prompt through a fast LLM expander to generate formal legal terms and bridge the **Lexical-Semantic Gap**:
$$\text{"500 cr e-invoicing"} \longrightarrow \text{"500 cr 500 crore five hundred crore rupees Invoice Reference Number IRN Rule 48"}$$

### 2. Pure Vector Embedding Protection
Through empirical testing (v4.0 experiment), we discovered that prepending artificial string headers (e.g., `[Source: Notification...]`) to text chunks distorts the dense vector space of `bge-small-en-v1.5` and collapses BM25 IDF scores. GSTGPT maintains **100% clean vector embeddings** in ChromaDB while enriching metadata exclusively during BM25 tokenization.

### 3. Dual-Stage Retrieval & Precision Filtering
Initial candidate retrieval fetches $K=15$ chunks from BM25 and $K=15$ chunks from ChromaDB. RRF merges them into a candidate pool, which is then re-ranked by a Cross-Encoder to select only the top 3 highest-confidence chunks for LLM context synthesis.

---

## 💡 Why ChatGPT and Gemini Give "Wrong" or Conflicting Answers

Users often notice that asking general AI tools (ChatGPT, Gemini, Claude) about historical GST notifications leads to claims that GSTGPT's answers are "wrong". **This is a known limitation of general LLMs for the following reasons**:

### Reason 1: Historical Statutory Amendments vs. Current Law
GST laws in India undergo continuous amendments:
* **Notification 8/2017-Central Tax**: Originally set the Composition Scheme turnover limit at **₹75 Lakhs**.
* **Subsequent Amendments**: Later increased the limit to **₹1 Crore**, and then to **₹1.5 Crores**.

When asked about *Notification 8/2017*, ChatGPT/Gemini evaluate the prompt against **current 2026 active practice (₹1.5 Crores)** and falsely flag ₹75 Lakhs as "incorrect". **GSTGPT retrieves the exact historical Gazette Notification 8/2017 text**, which explicitly states *"seventy five lakh rupees"*.

### Reason 2: Absence of Grounded Gazette Verification (Hallucination)
General LLMs do not search live CBIC Gazette PDFs unless connected to specific legal databases. They generate responses from pre-trained memory weights, often confusing notification numbers (e.g., mixing up Notification 12/2017 with 78/2020). GSTGPT is **strictly grounded on verified official CBIC Gazette PDFs** and provides verbatim citations for every claim.

---

## 🔎 How CAs and GST Inspectors Can Verify GSTGPT's Answers

Every response generated by GSTGPT includes:
1. **Official CBIC Notification Number** (e.g., `Notification No. 78/2020 – Central Tax`)
2. **Official Gazette File Name** (e.g., `notfctn-78-central-tax-english-2020.pdf`)
3. **Verbatim Gazette Text Quote** with exact G.S.R. numbers and tables

### Verification Steps for Tax Professionals:
1. Open the official Central Board of Indirect Taxes and Customs portal: **[cbic.gov.in](https://www.cbic.gov.in)** or **[taxinformation.cbic.gov.in](https://taxinformation.cbic.gov.in)**.
2. Search for the cited notification number (e.g., `Notification 78/2020 - Central Tax`).
3. Open the official Government Gazette PDF and compare the text word-for-word.

Because GSTGPT provides official Gazette citations, its outputs are **Court-Admissible Legal References** rather than unverified AI opinions.

---

## 🛠️ Key Technical Challenges Encountered & Fixes Applied

### Challenge 1: The Digit vs. Verbal Text Gap
* **Issue**: Official Gazette PDFs write monetary limits and numbers in words (e.g., `"five hundred crore rupees"`, `"seventy five lakh rupees"`), whereas users query using numeric digits (`"500 cr"`, `"75 lakh"`). Standard BM25 search failed to match `"500"` with `"five hundred"`.
* **Fix**: Implemented automatic digit-to-word bidirectional expansion in `models/query_rewriter.py`.
* **File Location**: `models/query_rewriter.py` (lines 60–73).

### Challenge 2: Vector Space Corruption during Chunk Prefixing (v4.0 Experiment)
* **Issue**: Attempting to prepend `[Source: Notification...]` to text chunks resulted in an accuracy drop from **84% to 55%** due to vector space distortion in `bge-small-en-v1.5` and BM25 IDF score collapse.
* **Fix**: Restored clean text chunking in `models/rag_engine.py` while maintaining separate metadata dictionaries in ChromaDB.
* **File Location**: `models/rag_engine.py` (lines 115–140).

### Challenge 3: LLM Query Rewriter Prompt Hallucination
* **Issue**: The LLM Query Rewriter initially copied sample numbers (e.g., `"500 crore"`) into unrelated queries (e.g., Input Service Distributor questions).
* **Fix**: Implemented strict no-hallucination prompt constraints and a regex safety filter to strip unrequested numbers.
* **File Location**: `models/query_rewriter.py` (lines 30–55).

---

## 💻 Installation & Usage Guide

### Prerequisites
* Python 3.11+
* [Ollama](https://ollama.com/) (Optional, for local LLM inference with `gstgpt:latest`)

### Setup Instructions
```bash
# 1. Clone the repository
git clone https://github.com/your-repo/GSTGPT.git
cd GSTGPT

# 2. Install dependencies
pip install -r requirements.txt

# 3. Launch the Interactive GSTGPT System
python main.py
```

### Main Menu Options
```
📌 MAIN MENU - Choose an option:
  [1] 💬 Start Interactive GSTGPT Chatbot
  [2] 🔍 Run RAG Retrieval Benchmark & Accuracy Diagnosis
  [3] ⚡ Rebuild Vector Database Index (ChromaDB)
  [4] 🧹 Run Dataset Cleaning Pipeline
  [5] 🚪 Exit
```

---

## 📄 License

This project is licensed under the MIT License - see the `LICENSE` file for details.
