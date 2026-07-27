"""
==============================================================================
GSTGPT - CHAT CONTROLLER (controllers/chat_controller.py)
==============================================================================
[MVC ROLE: CONTROLLER LAYER - CHAT ROUTER]
Is file ka kaam User (View) ki query lena, use RAG Engine (Model) ko pass karna,
retrieved context ko LLM (Model) me bhejna, aur final answer View ko lautana hai.
==============================================================================
"""

from models.rag_engine import HybridRAGEngine
from models.llm_interface import LLMInterface
from views.cli_view import CLIView

class ChatController:
    def __init__(self, rag_engine: HybridRAGEngine = None, llm: LLMInterface = None):
        self.rag_engine = rag_engine or HybridRAGEngine()
        self.llm = llm or LLMInterface()
        self.view = CLIView()

    def process_query(self, query: str):
        """Processes a single query through the RAG + LLM pipeline."""
        if not query.strip():
            return

        self.view.show_status("Step 1/2: Executing Hybrid RAG Search (BM25 + Vector + Re-Ranker)...")
        results = self.rag_engine.search(query, top_k=3)

        if not results:
            self.view.show_message("No relevant official GST documents found matching your query.")
            return

        # Prepare context from top RAG results
        context_blocks = []
        sources = []
        scores = []

        for doc in results:
            context_blocks.append(f"Source ({doc['filename']}):\n{doc['text']}")
            sources.append(doc['filename'])
            scores.append(doc['rerank_score'])

        full_context = "\n\n".join(context_blocks)

        self.view.show_status("Step 2/2: Generating Grounded Answer using LLM Synthesizer...")
        answer = self.llm.generate_response(query, full_context)

        self.view.show_results(query, answer, sources, scores)

    def run_interactive_loop(self):
        """Runs the continuous CLI chat loop."""
        self.view.show_banner()
        self.view.show_message("Interactive Chat Session Started. Type your question (or 'exit' / 'q' to quit):")

        while True:
            query = self.view.get_user_input("\n👤 You: ")
            if query.lower() in ["exit", "quit", "q"]:
                self.view.show_message("Exiting interactive chat. Goodbye!")
                break
            self.process_query(query)
