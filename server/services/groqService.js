const fetch = require('node-fetch');

/**
 * Isolated Groq LLM Service
 * Evaluates retrieved RAG documents, selects the most relevant document,
 * and streams a complete, high-quality Markdown response using Groq LLM API.
 */

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768'
];

/**
 * Stream Groq LLM response directly to Express Response object (res)
 * @param {Object} options
 * @param {string} options.query - User query string
 * @param {Array|string} options.documents - RAG context documents
 * @param {Object} options.res - Express HTTP response object
 * @returns {Promise<string>} Full generated text
 */
async function streamGroqLLM({ query, documents, res }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is missing in environment variables.');
  }

  // Format documents context
  let contextText = '';
  if (Array.isArray(documents) && documents.length > 0) {
    contextText = documents.map((doc, i) => {
      const name = doc.filename || `Document #${i + 1}`;
      const text = doc.text || doc.clean_text || doc.content || '';
      return `--- DOCUMENT #${i + 1} (${name}) ---\n${text}`;
    }).join('\n\n');
  } else if (typeof documents === 'string') {
    contextText = documents;
  }

  const isWebContext = Array.isArray(documents) && documents.some(d => (d.filename && d.filename.includes('Web Source')) || d.url);

  const systemPrompt = isWebContext ? 
    `You are a GST Legal AI Expert. Respond in Google AI Overview format for the query below.

STRICT INSTRUCTIONS:
1. Give a direct legal answer in 2-3 sentences mentioning exact Section/Act/Notification numbers.
2. Use inline numerical citations like [1], [2], [3] matching the web sources.
3. Add a section header: '### 📋 Key Aspects & Legal Provisions'
4. Add 3-4 detailed bullet points breaking down specific nuances (penalty limits, ITC rules, thresholds, effective dates) with [n] citations.
5. Ground your response strictly in the provided web context documents.

DEEP SCRAPED WEB CONTEXT:
${contextText || 'No web search context found.'}`
    :
    `You are GSTGPT, an authoritative AI Legal Assistant specializing in Indian Goods and Services Tax (GST) laws, Acts, Rules, Notifications, Circulars, and Orders.

Your Core Instructions:
1. Carefully analyze ALL retrieved official GST context documents provided below.
2. Select the SINGLE MOST RELEVANT document (or documents) that directly answers the user's specific query.
3. Formulate a comprehensive, complete, highly detailed, and professional response in clear GitHub-flavored Markdown.
4. DO NOT cut off, truncate, or abbreviate your answer. Provide full legal provisions, exact rule/section numbers, notification details, effective dates, and statutory conditions mentioned in the context.
5. Ground your answer strictly in the official GST context provided. Cite the specific official document (e.g. Notification No. XX/2017 - Central Tax, Rule XX, Circular No. XX) used as primary authority.
6. Use bold headers, clean lists, and tables where applicable for maximum clarity.

RETRIEVED OFFICIAL GST CONTEXT DOCUMENTS:
${contextText || 'No specific document context found.'}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: query }
  ];

  let groqRes = null;
  let usedModel = GROQ_MODELS[0];

  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 4096,
          stream: true
        })
      });

      if (response.ok) {
        groqRes = response;
        usedModel = model;
        break;
      } else {
        const errText = await response.text();
        console.warn(`[Groq Service] Model ${model} returned error status ${response.status}: ${errText}`);
      }
    } catch (e) {
      console.warn(`[Groq Service] Request failed for model ${model}:`, e.message);
    }
  }

  if (!groqRes) {
    throw new Error('All Groq API model attempts failed.');
  }

  let fullContent = '';
  let buffer = '';

  return new Promise((resolve, reject) => {
    groqRes.body.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              res.write(delta);
            }
          } catch (e) {
            // Ignore parse errors on partial JSON chunks
          }
        }
      }
    });

    groqRes.body.on('end', () => {
      if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
        try {
          const parsed = JSON.parse(buffer.trim().slice(6));
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            res.write(delta);
          }
        } catch (e) { }
      }
      resolve(fullContent);
    });

    groqRes.body.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  streamGroqLLM
};
