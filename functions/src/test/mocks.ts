import * as sinon from 'sinon';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export const mockGeminiResponse = {
  text: 'Mock Gemini response for testing',
  generationConfig: {},
  safetyRatings: []
};

export const mockOpenAIResponse = {
  choices: [
    {
      message: {
        content: 'Mock OpenAI response for testing',
        role: 'assistant' as const
      },
      finish_reason: 'stop' as const,
      index: 0
    }
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 10,
    total_tokens: 20
  }
};

export class MockAI {
  private static geminiStubs: sinon.SinonStub[] = [];
  private static openaiStubs: sinon.SinonStub[] = [];

  static mockGemini(customResponse?: any) {
    const response = customResponse || mockGeminiResponse;
    
    // Mock the generateContent method
    const generateContentStub = sinon.stub().resolves({
      response: {
        text: () => typeof response === 'string' ? response : response.text || 'Mock response'
      }
    });

    // Mock the getGenerativeModel method
    const getModelStub = sinon.stub(GoogleGenerativeAI.prototype, 'getGenerativeModel').returns({
      generateContent: generateContentStub,
      generateContentStream: sinon.stub(),
      countTokens: sinon.stub().resolves({ totalTokens: 10 })
    } as any);

    this.geminiStubs.push(getModelStub, generateContentStub);
    return { getModelStub, generateContentStub };
  }

  static mockOpenAI(customResponse?: any) {
    const response = customResponse || mockOpenAIResponse;
    
    const createStub = sinon.stub().resolves(response);
    
    // Mock the OpenAI chat completions
    const openaiStub = sinon.stub(OpenAI.prototype, 'chat').value({
      completions: {
        create: createStub
      }
    });

    this.openaiStubs.push(openaiStub, createStub);
    return { openaiStub, createStub };
  }

  static mockQuestionGeneration(questions: any[] = []) {
    const mockQuestions = questions.length > 0 ? questions : [
      {
        question: 'What is the primary cause of atopic dermatitis?',
        options: [
          { id: 'a', text: 'Genetic factors', correct: true },
          { id: 'b', text: 'Environmental factors', correct: false },
          { id: 'c', text: 'Dietary factors', correct: false },
          { id: 'd', text: 'Stress', correct: false }
        ],
        explanation: 'Atopic dermatitis has a strong genetic component with environmental triggers.',
        taxonomy: ['dermatology', 'inflammatory', 'eczema'],
        difficulty: 0.6
      }
    ];

    return this.mockGemini(JSON.stringify(mockQuestions));
  }

  static mockReview(score: number = 8.5, feedback: string = 'Well-written question') {
    const reviewResponse = {
      score,
      feedback,
      suggestions: ['Consider adding more distractors'],
      approved: score >= 7.0
    };

    return this.mockGemini(JSON.stringify(reviewResponse));
  }

  static mockScoring(score: number = 0.75, explanation: string = 'Correct reasoning demonstrated') {
    const scoringResponse = {
      score,
      explanation,
      feedback: 'Good understanding of the concept',
      nextDifficulty: score > 0.7 ? 'increase' : 'decrease'
    };

    return this.mockOpenAI({
      choices: [{
        message: {
          content: JSON.stringify(scoringResponse),
          role: 'assistant' as const
        },
        finish_reason: 'stop' as const,
        index: 0
      }]
    });
  }

  static restoreAll() {
    // Restore all Gemini stubs
    this.geminiStubs.forEach(stub => {
      if (stub.restore) {
        stub.restore();
      }
    });
    this.geminiStubs = [];

    // Restore all OpenAI stubs
    this.openaiStubs.forEach(stub => {
      if (stub.restore) {
        stub.restore();
      }
    });
    this.openaiStubs = [];

    // Restore all sinon stubs
    sinon.restore();
  }
}

// Mock HTTP responses for external APIs
export const mockHttpResponses = {
  // Mock successful API responses
  success: (data: any) => ({
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data))
  }),

  // Mock error responses
  error: (status: number = 500, message: string = 'Internal Server Error') => ({
    status,
    json: () => Promise.resolve({ error: message }),
    text: () => Promise.resolve(JSON.stringify({ error: message }))
  }),

  // Mock rate limit responses
  rateLimited: () => ({
    status: 429,
    json: () => Promise.resolve({ error: 'Rate limit exceeded' }),
    headers: {
      'retry-after': '60'
    }
  })
};

// Mock Firebase admin functions for testing
export const mockFirebaseAdmin = {
  mockFirestore: () => {
    const mockDoc = {
      get: sinon.stub().resolves({ exists: true, data: () => ({}) }),
      set: sinon.stub().resolves(),
      update: sinon.stub().resolves(),
      delete: sinon.stub().resolves()
    };

    const mockCollection = {
      doc: sinon.stub().returns(mockDoc),
      add: sinon.stub().resolves(mockDoc),
      get: sinon.stub().resolves({ docs: [] }),
      where: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      orderBy: sinon.stub().returnsThis()
    };

    return {
      collection: sinon.stub().returns(mockCollection),
      batch: sinon.stub().returns({
        set: sinon.stub().returnsThis(),
        update: sinon.stub().returnsThis(),
        delete: sinon.stub().returnsThis(),
        commit: sinon.stub().resolves()
      }),
      runTransaction: sinon.stub().callsFake((updateFunction: any) => updateFunction({
        get: mockDoc.get,
        set: sinon.stub(),
        update: sinon.stub(),
        delete: sinon.stub()
      }))
    };
  }
};