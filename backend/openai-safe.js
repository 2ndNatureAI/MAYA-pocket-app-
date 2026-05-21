import { OpenAI } from 'openai';
import { estimateTokenCount, validateTokenBudget } from './security.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS) || 30000,
});

const MODELS = {
  CHAT: process.env.OPENAI_MODEL || 'gpt-4-turbo',
  CLASSIFY: 'gpt-3.5-turbo', // Always use cheaper model for classification
};

const SYSTEM_PROMPTS = {
  ASSISTANT:
    'You are MAYA, a helpful business assistant. Respond concisely and professionally. Keep responses under 300 words.',
  CLASSIFIER:
    'Classify the user intent into ONE of: maintenance, billing, inquiry, complaint, other. Respond with ONLY the intent word.',
};

// ============= COST ESTIMATION =============
const COST_PER_1K_TOKENS = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
};

function estimateCost(model, inputTokens, outputTokens = 0) {
  const pricing = COST_PER_1K_TOKENS[model] || COST_PER_1K_TOKENS['gpt-3.5-turbo'];
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return inputCost + outputCost;
}

// ============= SAFE CHAT COMPLETION =============
export async function safeChatCompletion(messages, maxTokens = 500) {
  try {
    // Validate token budget before making API call
    const budgetCheck = validateTokenBudget(messages);
    if (!budgetCheck.valid) {
      throw new Error(budgetCheck.error);
    }

    // Estimate cost
    const estimatedCost = estimateCost(MODELS.CHAT, budgetCheck.estimatedTokens, maxTokens);
    console.log(`[OPENAI] Chat request cost estimate: $${estimatedCost.toFixed(4)}`);

    // Make API call with strict limits
    const response = await openai.chat.completions.create({
      model: MODELS.CHAT,
      messages,
      temperature: 0.7,
      max_tokens: Math.min(maxTokens, 500), // Hard cap at 500
      top_p: 0.9,
      frequency_penalty: 0.5,
      presence_penalty: 0.5,
    });

    const content = response.choices[0].message.content;
    const actualCost = estimateCost(
      MODELS.CHAT,
      response.usage.prompt_tokens,
      response.usage.completion_tokens
    );

    console.log(`[OPENAI] Chat request completed. Cost: $${actualCost.toFixed(4)}`);

    return {
      content,
      tokens: response.usage,
      cost: actualCost,
    };
  } catch (err) {
    console.error('[OPENAI_ERROR]', err.message);
    throw new Error('Failed to generate response: ' + err.message);
  }
}

// ============= SAFE CLASSIFICATION =============
export async function safeClassify(userMessage) {
  try {
    // Truncate message to prevent token abuse
    const truncated = userMessage.substring(0, 500);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPTS.CLASSIFIER },
      { role: 'user', content: truncated },
    ];

    const budgetCheck = validateTokenBudget(messages);
    if (!budgetCheck.valid) {
      console.warn('[CLASSIFY] Token budget exceeded, falling back to regex');
      return regexBasedClassification(userMessage);
    }

    const estimatedCost = estimateCost(MODELS.CLASSIFY, budgetCheck.estimatedTokens, 5);
    console.log(`[OPENAI] Classification cost estimate: $${estimatedCost.toFixed(6)}`);

    const response = await openai.chat.completions.create({
      model: MODELS.CLASSIFY,
      messages,
      temperature: 0.3,
      max_tokens: 5, // Very small for classification
      top_p: 1,
    });

    const result = response.choices[0].message.content.trim().toLowerCase();
    const validIntents = ['maintenance', 'billing', 'inquiry', 'complaint', 'other'];
    const classification = validIntents.includes(result) ? result : 'other';

    const actualCost = estimateCost(
      MODELS.CLASSIFY,
      response.usage.prompt_tokens,
      response.usage.completion_tokens
    );

    console.log(`[OPENAI] Classification: ${classification} (cost: $${actualCost.toFixed(6)})`);

    return {
      intent: classification,
      confidence: 0.9,
      tokens: response.usage,
      cost: actualCost,
    };
  } catch (err) {
    console.error('[CLASSIFY_ERROR]', err.message);
    // Fallback to simple pattern matching
    return regexBasedClassification(userMessage);
  }
}

// ============= FALLBACK CLASSIFICATION (no API calls) =============
function regexBasedClassification(message) {
  const lower = message.toLowerCase();

  const patterns = {
    maintenance: /leak|break|repair|fix|plumb|electric|hvac|wall|door|window|roof/i,
    billing: /bill|charge|invoice|rent|payment|refund|price|cost|fee|deposit/i,
    complaint: /bad|terrible|awful|horrible|angry|upset|disappointed|frustrated|poor/i,
    inquiry: /what|how|when|where|why|tell me|information|can you|is it/i,
  };

  for (const [intent, regex] of Object.entries(patterns)) {
    if (regex.test(message)) {
      return { intent, confidence: 0.6, fallback: true };
    }
  }

  return { intent: 'other', confidence: 0.5, fallback: true };
}

// ============= HEALTH CHECK =============
export async function checkOpenAIHealth() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { status: 'disabled', reason: 'No API key configured' };
    }

    // Try a minimal call to verify API key
    await openai.models.retrieve('gpt-3.5-turbo');

    return { status: 'ok', model: MODELS.CHAT };
  } catch (err) {
    console.error('[OPENAI_HEALTH] Check failed:', err.message);
    return { status: 'error', reason: err.message };
  }
}

export { MODELS, SYSTEM_PROMPTS };
