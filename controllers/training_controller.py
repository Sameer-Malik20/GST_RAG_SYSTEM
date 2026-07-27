"""
==============================================================================
GSTGPT - TRAINING CONTROLLER (controllers/training_controller.py)
==============================================================================
[MVC ROLE: CONTROLLER LAYER - TRAINING & DATASET PIPELINE]
Is file ka kaam training dataset generator (instruction QA pairs) aur model
fine-tuning pipelines (LoRA / CPT / Colab setup) ko manage karna hai.
==============================================================================
"""

import json
from pathlib import Path
from models.data_cleaner import GSTDataCleaner
from views.cli_view import CLIView
import config

class TrainingController:
    def __init__(self):
        self.view = CLIView()
        self.cleaner = GSTDataCleaner()

    def run_data_cleaning(self):
        """Triggers data cleaning pipeline."""
        self.view.show_status("Running dataset cleaning pipeline...")
        summary = self.cleaner.process()
        if summary:
            self.view.show_message(f"Dataset cleaning completed. Words reduced by {summary.get('word_reduction_percentage', 0)}%")
        return summary

    def generate_instruction_dataset(self):
        """Generates instruction-tuning Q&A dataset from cleaned GST texts."""
        input_file = config.INPUT_CLEANED_FILE
        output_file = config.DATA_DIR / "jsonl" / "gst_instruction_dataset.jsonl"

        self.view.show_status(f"Generating Instruction Q&A pairs from: {input_file}")
        if not input_file.exists():
            self.view.show_error(f"Cleaned dataset not found at {input_file}. Run cleaning first!")
            return False

        instruction_data = []
        with open(input_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                rec = json.loads(line)
                clean_text = rec.get("clean_text", "")
                filename = rec.get("filename", "")

                prompt = f"What is specified in official GST document '{filename}'?"
                instruction_data.append({
                    "instruction": prompt,
                    "input": "",
                    "output": clean_text
                })

        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            for item in instruction_data:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

        self.view.show_message(f"Instruction Dataset created with {len(instruction_data)} pairs at: {output_file}")
        return True
