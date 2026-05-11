require('dotenv').config();
const { env } = require('process');

// Embeddings configuration
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'; // 384-dim local model
const EMBEDDING_DIM = 384;

class EmbeddingsManager {
  constructor() {
    this.pipeline = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = await pipeline('feature-extraction', EMBEDDING_MODEL);
      this.initialized = true;
      console.log('✓ Embeddings model loaded:', EMBEDDING_MODEL);
    } catch (error) {
      console.error('Failed to load embeddings model:', error);
      throw error;
    }
  }

  async embed(text) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!text || typeof text !== 'string') {
      throw new Error('Text must be a non-empty string');
    }

    try {
      const result = await this.pipeline(text, { pooling: 'mean', normalize: true });
      return Array.from(result.data);
    } catch (error) {
      console.error('Embedding error:', error);
      throw error;
    }
  }

  async embedBatch(texts) {
    const embeddings = [];
    for (const text of texts) {
      const embedding = await this.embed(text);
      embeddings.push(embedding);
    }
    return embeddings;
  }
}

module.exports = {
  EmbeddingsManager,
  EMBEDDING_MODEL,
  EMBEDDING_DIM
};
