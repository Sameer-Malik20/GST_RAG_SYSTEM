"""
==============================================================================
GSTGPT - MAIN EXECUTION SCRIPT (main.py)
==============================================================================
[MVC ROLE: MAIN ENTRY POINT / APPLICATION ROUTER]
Aapko poora project chalane ke liye sirf is ek file ko run karna hai!
Command: python main.py

Is file se aap:
1. Interactive Chatbot chala sakte hain
2. Retrieval Accuracy Benchmark test kar sakte hain
3. ChromaDB Vector DB ko re-index kar sakte hain
4. Raw data cleaning kar sakte hain
==============================================================================
"""

import sys
from views.cli_view import CLIView

def main():
    view = CLIView()
    view.show_banner()
    
    rag_engine = None

    while True:
        view.show_main_menu()
        choice = view.get_user_input("Enter choice [1-5]: ")

        if choice == "1":
            try:
                from models.rag_engine import HybridRAGEngine
                from controllers.chat_controller import ChatController
                if not rag_engine:
                    rag_engine = HybridRAGEngine()
                chat_controller = ChatController(rag_engine=rag_engine)
                chat_controller.run_interactive_loop()
            except ModuleNotFoundError as e:
                view.show_error(f"Missing required ML dependency: {e}. Please ensure dependencies are installed.")

        elif choice == "2":
            try:
                from models.rag_engine import HybridRAGEngine
                from controllers.eval_controller import EvalController
                if not rag_engine:
                    rag_engine = HybridRAGEngine()
                eval_controller = EvalController(rag_engine=rag_engine)
                eval_controller.run_benchmark()
            except ModuleNotFoundError as e:
                view.show_error(f"Missing required ML dependency: {e}. Please ensure dependencies are installed.")

        elif choice == "3":
            try:
                from models.rag_engine import HybridRAGEngine
                if not rag_engine:
                    rag_engine = HybridRAGEngine()
                view.show_status("Rebuilding ChromaDB Vector Store Index...")
                success = rag_engine.build_or_reindex_chromadb()
                if success:
                    view.show_message("Vector Database Index successfully rebuilt!")
            except ModuleNotFoundError as e:
                view.show_error(f"Missing required ML dependency: {e}. Please ensure dependencies are installed.")

        elif choice == "4":
            from controllers.training_controller import TrainingController
            training_controller = TrainingController()
            training_controller.run_data_cleaning()

        elif choice in ["5", "exit", "quit", "q"]:
            view.show_message("Thank you for using GSTGPT! Goodbye!")
            sys.exit(0)

        else:
            view.show_error("Invalid choice! Please select a number from 1 to 5.")

if __name__ == "__main__":
    main()
