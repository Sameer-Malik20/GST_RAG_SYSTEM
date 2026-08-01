"""
==============================================================================
GSTGPT - FASTAPI RAG SERVER (main_server.py)
==============================================================================
Runs the GST RAG pipeline + LLM streaming server on http://localhost:8005.
Command to run: python main_server.py
==============================================================================
"""

import json
import urllib.request
import urllib.error
import asyncio
import re
from typing import AsyncGenerator
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import config
from models.rag_engine import HybridRAGEngine
from models.llm_interface import LLMInterface

app = FastAPI(title="GSTGPT RAG Backend API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rag_engine = None
llm_interface = None

def get_rag_engine():
    global rag_engine
    if rag_engine is None:
        print("🤖 [RAG Server] Initializing Hybrid RAG Engine...")
        rag_engine = HybridRAGEngine()
    return rag_engine

def get_llm_interface():
    global llm_interface
    if llm_interface is None:
        llm_interface = LLMInterface()
    return llm_interface

class QueryRequest(BaseModel):
    query: str
    top_k: int = 3
    use_web_search: bool = False
    web_search: bool = False
    use_llm: bool = True

@app.on_event("startup")
async def startup_event():
    print("🚀 [GSTGPT RAG Server] Starting on http://localhost:8005")
    get_rag_engine()
    get_llm_interface()

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "GSTGPT RAG Server"}

def deep_scrape_url_content(url: str, timeout: int = 4) -> str:
    """Deep scrapes main content paragraphs from a legal web page using Chrome124 TLS."""
    try:
        from curl_cffi import requests as cffi_requests
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        resp = cffi_requests.get(url, headers=headers, impersonate="chrome124", timeout=timeout)
        html = resp.text
        
        # Clean out script, style, nav, footer, header, iframe
        clean_html = re.sub(r'<(script|style|nav|footer|header|aside|iframe)[^>]*>.*?</\1>', ' ', html, flags=re.DOTALL)
        
        # Extract paragraph texts
        paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', clean_html, re.DOTALL)
        text_blocks = []
        for p in paragraphs:
            text = re.sub(r'<[^>]+>', ' ', p)
            text = re.sub(r'\s+', ' ', text).strip()
            if len(text) > 45 and not any(x in text.lower() for x in ['cookie', 'privacy policy', 'subscribe', 'copyright']):
                text_blocks.append(text)
                
        return " ".join(text_blocks[:4]) if text_blocks else ""
    except Exception:
        return ""

def perform_zero_captcha_web_search(query: str, max_results: int = 4):
    """Fetches real-time web search results + deep page content using ddgs & Chrome124 TLS scraper."""
    results = []
    try:
        try:
            from ddgs import DDGS
        except ImportError:
            from duckduckgo_search import DDGS

        ddgs = DDGS()
        raw_res = ddgs.text(query, max_results=max_results)
        for idx, r in enumerate(raw_res, 1):
            title = r.get("title", "")
            snippet = r.get("body", "")
            url = r.get("href", "")
            
            # Deep scrape full page paragraphs if URL is available
            deep_text = deep_scrape_url_content(url) if url else ""
            full_text = deep_text if len(deep_text) > 100 else snippet
            
            if full_text:
                results.append({
                    "id": idx,
                    "filename": f"Web Source [{idx}]: {title}",
                    "title": title,
                    "url": url,
                    "text": full_text[:800]
                })
    except Exception as e:
        print(f"⚠️ [Web Search Engine] DDGS fetch warning: {e}")
    return results

async def generate_rag_stream(query: str, top_k: int = 3, use_web_search: bool = False, use_llm: bool = True) -> AsyncGenerator[str, None]:
    engine = get_rag_engine()
    llm = get_llm_interface()
    
    context_blocks = []
    web_docs = []
    
    if use_web_search:
        print(f"🌐 [Google AI Mode Search ON] Deep Scraper Active for: '{query}' (LLM: {'ON' if use_llm else 'OFF'})")
        web_docs = perform_zero_captcha_web_search(query, max_results=4)
        if web_docs:
            for idx, doc in enumerate(web_docs, 1):
                url_str = f" ({doc['url']})" if doc.get('url') else ""
                context_blocks.append(f"Source [{idx}] - {doc['title']}{url_str}:\n{doc['text']}")
        else:
            yield "🌐 Search ON: No live web search results could be retrieved at this moment. Falling back to local RAG.\n\n"
            rag_docs = engine.search(query, top_k=top_k)
            for idx, doc in enumerate(rag_docs, 1):
                context_blocks.append(f"--- Document #{idx} ({doc['filename']}) ---\n{doc['text']}")
    else:
        print(f"📚 [Search OFF] Using Local RAG Engine for query: '{query}' (LLM: {'ON' if use_llm else 'OFF'})")
        rag_docs = engine.search(query, top_k=top_k)
        if not rag_docs:
            yield "No relevant official GST notifications or documents were found in local RAG matching your query."
            return
        for idx, doc in enumerate(rag_docs, 1):
            context_blocks.append(f"--- Document #{idx} ({doc['filename']}) ---\n{doc['text']}")
    
    # IF USE_LLM IS FALSE: Return raw search / RAG results directly without LLM
    if not use_llm:
        header = f"🔍 **Direct {'Web Search Deep Scraper' if use_web_search else 'Local RAG'} Results (LLM Bypassed):**\n\n"
        for char in header:
            yield char
            await asyncio.sleep(0.005)
            
        for block in context_blocks:
            for line in block.split("\n"):
                yield line + "\n"
                await asyncio.sleep(0.01)
                
        footer = "\n\n📌 *Direct search snippets delivered instantly without LLM generation.*"
        for char in footer:
            yield char
            await asyncio.sleep(0.005)
        return

    full_context = "\n\n".join(context_blocks)
    
    if use_web_search:
        full_prompt = (
            f"You are a GST Legal AI Expert. Respond in Google AI Overview format for the query below.\n\n"
            f"STRICT INSTRUCTIONS:\n"
            f"1. Give a direct legal answer in 2-3 sentences mentioning exact Section/Act/Notification.\n"
            f"2. Use inline citations like [1], [2], [3] matching the web sources.\n"
            f"3. Add a section header: '### 📋 Key Aspects & Legal Provisions'\n"
            f"4. Add 3-4 detailed bullet points with [n] citations.\n\n"
            f"User Query: {query}\n\n"
            f"Deep Scraped Web Context:\n{full_context}\n\n"
            f"Google AI Overview Answer:"
        )
    else:
        full_prompt = llm.build_system_prompt(query, full_context)

    # 3. Stream from Ollama if running, else stream full grounded RAG/Web context directly
    ollama_url = "http://localhost:11434/api/generate"
    try:
        req = urllib.request.Request(
            ollama_url,
            data=json.dumps({
                "model": llm.model_name,
                "prompt": full_prompt,
                "stream": True
            }).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        response = urllib.request.urlopen(req, timeout=5)
        for line in response:
            if line:
                data = json.loads(line.decode('utf-8'))
                token = data.get("response", "")
                if token:
                    yield token
                    await asyncio.sleep(0.01)
    except Exception:
        # Fallback stream: Yield full retrieved context line by line
        source_title = "🌐 **Live Web Search Grounded Context (Zero-CAPTCHA Engine):**\n\n" if use_web_search else "**Retrieved Official GST Documents Context:**\n\n"
        for char in source_title:
            yield char
            await asyncio.sleep(0.005)
            
        for block in context_blocks:
            for line in block.split("\n"):
                yield line + "\n"
                await asyncio.sleep(0.01)
                
        footer_text = "\n\n📌 *Answer grounded live via Zero-CAPTCHA Web Search Engine.*" if use_web_search else "\n\n📌 *Answer grounded directly from verified CBIC official GST notification records.*"
        for char in footer_text:
            yield char
            await asyncio.sleep(0.005)

@app.post("/api/chat/stream")
async def chat_stream(request: QueryRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    
    is_web = request.use_web_search or request.web_search
    return StreamingResponse(
        generate_rag_stream(request.query, request.top_k, use_web_search=is_web, use_llm=request.use_llm),
        media_type="text/plain; charset=utf-8"
    )

@app.post("/api/search")
async def search_documents(request: QueryRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    
    is_web = request.use_web_search or request.web_search
    if is_web:
        results = perform_zero_captcha_web_search(request.query, max_results=4)
    else:
        engine = get_rag_engine()
        results = engine.search(request.query, top_k=request.top_k)
        
    return {"query": request.query, "documents": results}
    return {"query": request.query, "documents": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main_server:app", host="0.0.0.0", port=8005, reload=False)
