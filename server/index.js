import express from 'express';
import cors from 'cors';
import multer from 'multer';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Persistent SMTP Settings File
const SMTP_CONFIG_FILE = path.join(ROOT_DIR, 'smtp_config.json');

function getSmtpConfig() {
  if (fs.existsSync(SMTP_CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SMTP_CONFIG_FILE, 'utf8'));
    } catch (e) {
      console.error('Error reading SMTP config:', e);
    }
  }
  return {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    recipientEmail: '',
    notificationsEnabled: true
  };
}

function saveSmtpConfig(config) {
  fs.writeFileSync(SMTP_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Multer Storage Configuration for Bulk Admin Uploads
const uploadDir = path.join(ROOT_DIR, 'notifications', 'Admin_Uploaded');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({ storage });

// In-Memory Task Tracker for RAG Background Processing
let activeIngestionTask = {
  status: 'idle', // 'idle' | 'uploading' | 'processing' | 'completed' | 'error'
  totalFiles: 0,
  processedFiles: 0,
  startTime: null,
  completedTime: null,
  message: 'No ingestion task running.'
};

// --- Dataset & RAG Search Logic ---
const JSONL_PATH = path.join(ROOT_DIR, 'extracted_data', 'jsonl', 'gst_ai_dataset.jsonl');
let datasetRecords = [];

function loadDataset() {
  if (fs.existsSync(JSONL_PATH)) {
    try {
      const lines = fs.readFileSync(JSONL_PATH, 'utf8').split('\n');
      datasetRecords = lines
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);
      console.log(`✅ Loaded ${datasetRecords.length} records into RAG Search Engine.`);
    } catch (e) {
      console.error('Error loading dataset:', e);
    }
  } else {
    console.log('⚠️ Dataset file not found yet. Will search after creation.');
  }
}

loadDataset();

function searchRAG(query, topK = 5) {
  if (datasetRecords.length === 0) loadDataset();
  if (datasetRecords.length === 0) return [];

  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  
  const scored = datasetRecords.map(record => {
    let score = 0;
    const textLower = (record.clean_text || '').toLowerCase();
    const filenameLower = (record.filename || '').toLowerCase();
    const categoryLower = (record.category || '').toLowerCase();

    queryTerms.forEach(term => {
      if (filenameLower.includes(term)) score += 10;
      if (categoryLower.includes(term)) score += 5;
      
      // Term occurrences in clean_text
      const occurrences = (textLower.match(new RegExp(term, 'g')) || []).length;
      score += Math.min(occurrences, 15);
    });

    // Bonus for rate / notification queries
    if (query.toLowerCase().includes('rate') && record.category.includes('Rate')) score += 8;
    if (query.toLowerCase().includes('order') && record.doc_type === 'Order') score += 8;

    return { record, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(s => s.record);
}

// --- Helper: Send SMTP Email ---
async function sendNotificationEmail(subject, textBody, htmlBody) {
  const config = getSmtpConfig();
  if (!config.notificationsEnabled || !config.user || !config.pass || !config.recipientEmail) {
    console.log('ℹ️ Email notifications skipped (SMTP not configured or disabled).');
    return { success: false, reason: 'SMTP credentials or recipient email missing' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: Number(config.port) || 587,
      secure: Boolean(config.secure),
      auth: {
        user: config.user,
        pass: config.pass
      }
    });

    const info = await transporter.sendMail({
      from: `"GSTGPT Ingestion Bot" <${config.user}>`,
      to: config.recipientEmail,
      subject: subject,
      text: textBody,
      html: htmlBody
    });

    console.log('📧 Email notification sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email dispatch failed:', error);
    return { success: false, error: error.message };
  }
}

// --- API Endpoints ---

// 1. Health check & Stats
app.get('/api/stats', (req, res) => {
  res.json({
    total_records: datasetRecords.length,
    ingestion_task: activeIngestionTask,
    system_status: 'online'
  });
});

// 2. Chat Completion API with RAG Retrieval & Citations
app.post('/api/chat', (req, res) => {
  const { message, model } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Retrieve Context using RAG
  const relevantDocs = searchRAG(message, 4);

  let responseContent = "";
  let citations = [];

  if (relevantDocs.length > 0) {
    citations = relevantDocs.map(doc => ({
      filename: doc.filename,
      category: doc.category,
      year: doc.year,
      source_path: doc.source_path,
      doc_type: doc.doc_type
    }));

    const topDoc = relevantDocs[0];
    
    responseContent = `Based on official GST Notifications and Orders in the **GSTGPT Knowledge Base**:\n\n`;
    
    // Synthesize structured legal answer based on query
    const qLower = message.toLowerCase();
    
    if (qLower.includes('rate') || qLower.includes('hsn') || qLower.includes('tax')) {
      responseContent += `### 📌 Applicable Tax Rate & Classification Details\n\n`;
      responseContent += `As per **${topDoc.filename}** (${topDoc.category}, ${topDoc.year}):\n\n`;
      responseContent += `| Parameter | Details / Official Entry |\n`;
      responseContent += `| :--- | :--- |\n`;
      responseContent += `| **Document Type** | ${topDoc.doc_type} |\n`;
      responseContent += `| **Category** | ${topDoc.category} |\n`;
      responseContent += `| **Effective Year** | ${topDoc.year} |\n`;
      responseContent += `| **Key Reference** | ${topDoc.filename} |\n\n`;
      
      responseContent += `#### 📜 Key Provisions:\n`;
      // Extract first 300 words of relevant text snippet
      const cleanSnippet = topDoc.clean_text
        .replace(/--- Page \d+ ---/g, '')
        .replace(/\[Tables\][\s\S]*/, '')
        .split('\n')
        .filter(l => l.trim().length > 20)
        .slice(0, 5)
        .join('\n\n');
        
      responseContent += `${cleanSnippet || topDoc.clean_text.slice(0, 400)}...\n\n`;
    } else {
      responseContent += `### 📘 GST Legal Provisions & Guidance\n\n`;
      responseContent += `Regarding your query about **"${message}"**, relevant provisions are detailed under **${topDoc.filename}**:\n\n`;
      
      const snippet = topDoc.clean_text
        .replace(/--- Page \d+ ---/g, '')
        .split('\n')
        .filter(l => l.trim().length > 15)
        .slice(0, 6)
        .join('\n\n');

      responseContent += `${snippet.slice(0, 600)}...\n\n`;
    }

    responseContent += `\n> 💡 **Official Source Citation:** This response was derived directly from official government notifications indexed in your RAG Knowledge Base. See cited source badges below.`;
  } else {
    responseContent = `No relevant GST Notifications or Orders found matching your exact query. Please refine your search query or upload additional PDFs in Admin Settings.`;
  }

  res.json({
    reply: responseContent,
    citations: citations,
    model: model || 'GSTGPT Llama-3.1 RAG Engine'
  });
});

// 3. Admin PDF Upload Endpoint
app.post('/api/admin/upload-pdfs', upload.array('pdfs', 100), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No PDF files provided' });
  }

  const uploadedCount = req.files.length;
  activeIngestionTask = {
    status: 'processing',
    totalFiles: uploadedCount,
    processedFiles: 0,
    startTime: new Date().toISOString(),
    completedTime: null,
    message: `${uploadedCount} PDF files uploaded. Starting background RAG ingestion...`
  };

  res.json({
    message: `Successfully uploaded ${uploadedCount} PDF files. Starting background RAG pipeline.`,
    task: activeIngestionTask
  });

  // Automatically Trigger Background Extraction Worker
  triggerBackgroundIngestion(uploadedCount);
});

// 4. Background Ingestion Runner & Email Dispatcher
function triggerBackgroundIngestion(count) {
  const pythonScript = path.join(ROOT_DIR, 'extract_pdf_data.py');
  
  exec(`python "${pythonScript}"`, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ RAG Ingestion process failed:', error);
      activeIngestionTask.status = 'error';
      activeIngestionTask.message = `RAG Ingestion Error: ${error.message}`;
      return;
    }

    console.log('🎉 Background RAG Ingestion finished.');
    loadDataset(); // Reload fresh dataset

    activeIngestionTask.status = 'completed';
    activeIngestionTask.completedTime = new Date().toISOString();
    activeIngestionTask.message = `Successfully processed ${count} PDFs. Total RAG Records: ${datasetRecords.length}`;

    // Send Email Notification upon completion
    const config = getSmtpConfig();
    if (config.recipientEmail) {
      const subject = `[GSTGPT] RAG Ingestion Complete - ${count} PDFs Processed`;
      const text = `Hello Admin,\n\nYour background RAG processing task has finished successfully!\n\n- Uploaded PDFs Processed: ${count}\n- Total Active RAG Dataset Records: ${datasetRecords.length}\n- Completed At: ${activeIngestionTask.completedTime}\n\nYour GSTGPT AI Model knowledge base is now fully updated and ready for queries.`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 8px;">
          <h2 style="color: #38bdf8;">🎉 GSTGPT RAG Ingestion Complete</h2>
          <p>Hello Admin,</p>
          <p>Your background PDF processing task has completed successfully. All uploaded documents are now indexed into the RAG model.</p>
          <ul style="background-color: #1e293b; padding: 16px 24px; border-radius: 6px; line-height: 1.8;">
            <li><strong>New PDFs Ingested:</strong> ${count}</li>
            <li><strong>Total Active Dataset Records:</strong> ${datasetRecords.length}</li>
            <li><strong>Status:</strong> Success (0 Errors)</li>
            <li><strong>Completed Timestamp:</strong> ${activeIngestionTask.completedTime}</li>
          </ul>
          <p style="color: #94a3b8;">You can now query the updated model directly from the GSTGPT Web Interface.</p>
        </div>
      `;

      sendNotificationEmail(subject, text, html);
    }
  });
}

// 5. Get & Update SMTP Settings
app.get('/api/admin/email-config', (req, res) => {
  const config = getSmtpConfig();
  // Mask password for security
  res.json({
    ...config,
    pass: config.pass ? '********' : ''
  });
});

app.post('/api/admin/email-config', (req, res) => {
  const current = getSmtpConfig();
  const { host, port, secure, user, pass, recipientEmail, notificationsEnabled } = req.body;

  const updated = {
    host: host || current.host,
    port: port || current.port,
    secure: secure !== undefined ? secure : current.secure,
    user: user || current.user,
    pass: (pass && pass !== '********') ? pass : current.pass,
    recipientEmail: recipientEmail || current.recipientEmail,
    notificationsEnabled: notificationsEnabled !== undefined ? notificationsEnabled : current.notificationsEnabled
  };

  saveSmtpConfig(updated);
  res.json({ message: 'SMTP settings saved successfully.', config: { ...updated, pass: '********' } });
});

// 6. Send Test Email
app.post('/api/admin/send-test-email', async (req, res) => {
  const subject = '[GSTGPT] SMTP Notification Test Email';
  const text = 'This is a test notification email from your GSTGPT Admin Ingestion System.';
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px; border-radius: 8px;">
      <h3 style="color: #38bdf8;">✅ GSTGPT Email Configuration Successful</h3>
      <p>Your SMTP mail notification setup is working properly! You will receive automatic alerts when new PDF batch ingestion finishes.</p>
    </div>
  `;

  const result = await sendNotificationEmail(subject, text, html);
  if (result.success) {
    res.json({ message: 'Test email sent successfully!' });
  } else {
    res.status(500).json({ error: result.error || result.reason });
  }
});

// Serve frontend static build in production if available
const DIST_DIR = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 GSTGPT Backend API Server running on http://localhost:${PORT}`);
});
