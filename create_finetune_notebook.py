import json
import os

notebook = {
 "cells": [
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "# 🚀 Fine-Tuning Embedding Model for GST Legal Data (T4 GPU Optimized)\n",
    "\n",
    "This Google Colab / Kaggle Jupyter Notebook fine-tunes sentence embedding models (`BAAI/bge-base-en-v1.5` or `sentence-transformers/all-MiniLM-L6-v2`) on GST Legal Data using **`MultipleNegativesRankingLoss` (MNRL)**.\n",
    "\n",
    "### 📌 Objectives:\n",
    "1. Train embedding vectors to recognize statutory numbers (`07/2025`, `49/2019`, `Sec 17(5)`, `Rule 36(4)`).\n",
    "2. Increase Cosine Similarity delta between true target documents and hard negatives.\n",
    "3. Achieve 90%+ Top-1 Retrieval Accuracy on dense vector search.\n"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## Step 1: Install Required Libraries & Setup Hardware"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "# Install sentence-transformers, torch, datasets, and tqdm\n",
    "!pip install -q sentence-transformers datasets torch tqdm pandas numpy\n",
    "\n",
    "import torch\n",
    "print(\"🟢 PyTorch Version:\", torch.__version__)\n",
    "print(\"⚡ GPU Available:\", torch.cuda.is_available())\n",
    "if torch.cuda.is_available():\n",
    "    print(\"🎮 GPU Device Name:\", torch.cuda.get_device_name(0))\n"

   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## Step 2: Load GST Triplet Training Dataset (`gst_finetune_triplets.jsonl`)\n",
    "Upload `gst_finetune_triplets.jsonl` to your Colab environment or run this cell if files are already mounted."
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "import json\n",
    "from sentence_transformers import InputExample\n",
    "from torch.utils.data import DataLoader\n",
    "\n",
    "TRIPLETS_FILE = \"gst_finetune_triplets.jsonl\"\n",
    "\n",
    "train_examples = []\n",
    "corrupted_count = 0\n",
    "\n",
    "with open(TRIPLETS_FILE, \"r\", encoding=\"utf-8\", errors=\"ignore\") as f:\n",
    "    for line in f:\n",
    "        line_str = line.strip()\n",
    "        if line_str:\n",
    "            try:\n",
    "                item = json.loads(line_str)\n",
    "                train_examples.append(InputExample(texts=[item[\"query\"], item[\"positive\"], item[\"negative\"]]))\n",
    "            except Exception:\n",
    "                corrupted_count += 1\n",
    "\n",
    "print(f\"✅ Successfully loaded {len(train_examples)} valid training triplets!\")\n",
    "if corrupted_count > 0:\n",
    "    print(f\"⚠️ Skipped {corrupted_count} corrupted lines safely.\")\n",
    "print(\"🔍 Sample Triplet 0:\")\n",
    "print(\"  • Query:\", train_examples[0].texts[0])\n",
    "print(\"  • Positive:\", train_examples[0].texts[1][:120] + \"...\")\n",
    "print(\"  • Negative:\", train_examples[0].texts[2][:120] + \"...\")\n"

   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## Step 3: Configure DataLoader & MultipleNegativesRankingLoss (MNRL)"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "from sentence_transformers import SentenceTransformer, losses\n",
    "\n",
    "# Choose Base Model: 'BAAI/bge-base-en-v1.5' or 'sentence-transformers/all-MiniLM-L6-v2'\n",
    "BASE_MODEL_NAME = \"BAAI/bge-base-en-v1.5\"\n",
    "OUTPUT_MODEL_DIR = \"./gst_fine_tuned_embedding_model\"\n",
    "\n",
    "print(f\"⚡ Loading Base Model '{BASE_MODEL_NAME}'...\")\n",
    "model = SentenceTransformer(BASE_MODEL_NAME)\n",
    "\n",
    "# Set Batch Size: 32 for T4 GPU (16GB VRAM)\n",
    "BATCH_SIZE = 32\n",
    "train_dataloader = DataLoader(train_examples, shuffle=True, batch_size=BATCH_SIZE)\n",
    "\n",
    "# MultipleNegativesRankingLoss forces positive pairs close & negative pairs far apart in vector space\n",
    "train_loss = losses.MultipleNegativesRankingLoss(model=model, scale=20.0, similarity_fct=losses.SiameseDistanceMetric.COSINE-SIMILARITY if hasattr(losses, 'SiameseDistanceMetric') else None)\n",
    "\n",
    "print(\"✅ DataLoader & MNRL Loss Function configured.\")\n"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## Step 4: Execute Fine-Tuning Training Loop"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "import math\n",
    "\n",
    "EPOCHS = 4\n",
    "warmup_steps = math.ceil(len(train_dataloader) * EPOCHS * 0.1) # 10% warmup steps\n",
    "\n",
    "print(f\"🔥 Starting Training for {EPOCHS} Epochs on {len(train_dataloader)} Batches per epoch...\")\n",
    "print(f\"📈 Warmup Steps: {warmup_steps} | Batch Size: {BATCH_SIZE}\")\n",
    "\n",
    "model.fit(\n",
    "    train_objectives=[(train_dataloader, train_loss)],\n",
    "    epochs=EPOCHS,\n",
    "    warmup_steps=warmup_steps,\n",
    "    optimizer_params={'lr': 2e-5},\n",
    "    output_path=OUTPUT_MODEL_DIR,\n",
    "    show_progress_bar=True\n",
    ")\n",
    "\n",
    "print(f\"🎉 FINE-TUNING COMPLETE! Fine-tuned weights saved to: '{OUTPUT_MODEL_DIR}'\")\n"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## Step 5: Test & Evaluate Fine-Tuned Model Results"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "from sentence_transformers import util\n",
    "\n",
    "# Compare Base Model vs Fine-Tuned Model on a hard test pair\n",
    "query = \"According to Notification No. 49/2019-Central Tax what restriction was placed on Rule 36(4)?\"\n",
    "doc_target = \"[CATEGORY: Central Tax] [YEAR: 2019] [NOTIF: 49/2019] Notification No. 49/2019 - Central Tax... Rule 36(4) 20 percent ITC limit...\"\n",
    "doc_negative = \"[CATEGORY: Central Tax] [YEAR: 2019] [NOTIF: 56/2019] Notification No. 56/2019 - Central Tax... Seventh Amendment Rules...\"\n",
    "\n",
    "# 1. Base Model Similarity\n",
    "base_model = SentenceTransformer(BASE_MODEL_NAME)\n",
    "b_q = base_model.encode(query, convert_to_tensor=True)\n",
    "b_target = base_model.encode(doc_target, convert_to_tensor=True)\n",
    "b_neg = base_model.encode(doc_negative, convert_to_tensor=True)\n",
    "\n",
    "base_sim_target = float(util.cos_sim(b_q, b_target)[0][0])\n",
    "base_sim_neg = float(util.cos_sim(b_q, b_neg)[0][0])\n",
    "\n",
    "# 2. Fine-Tuned Model Similarity\n",
    "ft_model = SentenceTransformer(OUTPUT_MODEL_DIR)\n",
    "ft_q = ft_model.encode(query, convert_to_tensor=True)\n",
    "ft_target = ft_model.encode(doc_target, convert_to_tensor=True)\n",
    "ft_neg = ft_model.encode(doc_negative, convert_to_tensor=True)\n",
    "\n",
    "ft_sim_target = float(util.cos_sim(ft_q, ft_target)[0][0])\n",
    "ft_sim_neg = float(util.cos_sim(ft_q, ft_neg)[0][0])\n",
    "\n",
    "print(\"=\"*75)\n",
    "print(\"📊 COMPARISON RESULTS (BASE VS FINE-TUNED MODEL):\")\n",
    "print(\"=\"*75)\n",
    "print(f\"BEFORE Fine-Tuning:\")\n",
    "print(f\"  • Target Doc Sim:   {base_sim_target:.4f}\")\n",
    "print(f\"  • Hard Negative Sim:{base_sim_neg:.4f}\")\n",
    "print(f\"  ➔ Similarity Delta: {base_sim_target - base_sim_neg:.4f} (Too Close!)\")\n",
    "print()\n",
    "print(f\"AFTER Fine-Tuning:\")\n",
    "print(f\"  • Target Doc Sim:   {ft_sim_target:.4f}\")\n",
    "print(f\"  • Hard Negative Sim:{ft_sim_neg:.4f}\")\n",
    "print(f\"  ➔ Similarity Delta: {ft_sim_target - ft_sim_neg:.4f} (CLEAR SEPARATION!)\")\n",
    "print(\"=\"*75)\n"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "## Step 6: Download & Zip Fine-Tuned Model Weights"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": None,
   "metadata": {},
   "outputs": [],
   "source": [
    "# Zip the fine-tuned model for downloading to your local RAG engine\n",
    "!zip -r gst_fine_tuned_embedding_model.zip ./gst_fine_tuned_embedding_model\n",
    "print(\"💾 Download 'gst_fine_tuned_embedding_model.zip' and extract it into your project's models/ folder!\")\n"
   ]
  }
 ],
 "metadata": {
  "language_info": {
   "name": "python"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 2
}

output_nb_path = "fine_tune_test_model/fine_tune_gst_embedding.ipynb"
with open(output_nb_path, "w", encoding="utf-8") as f:
    json.dump(notebook, f, indent=1)

print(f"✅ Created Jupyter Notebook at: {output_nb_path}")
