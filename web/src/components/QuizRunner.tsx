import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { TutorDrawer } from './TutorDrawer';
import { renderSafeMarkdown } from '../lib/markdown';
import QuestionFeedback from './QuestionFeedback';
import { toast } from './Toast';
import { useAppStore } from '../app/store';
import { useNavigate } from 'react-router-dom';
import { saveAttempt, type StoredQuestionAttempt } from '../lib/attempts';
import { addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export function QuizRunner() {
  const [item, setItem] = useState<any | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [submitted, setSubmitted] = useState(false);
  const [start, setStart] = useState<number>(Date.now());
  const [loading, setLoading] = useState(true);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [adaptiveTriggered, setAdaptiveTriggered] = useState(false);
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [totalQuestions, setTotalQuestions] = useState<number>(1);
  const [note, setNote] = useState<string>('');
  const [creatingCard, setCreatingCard] = useState(false);
  const navigate = useNavigate();
  const activeQuiz = useAppStore(s => s.activeQuiz);

  // Handle time-up event from page timer
  useEffect(() => {
    const onTimeUp = () => {
      if (!submitted) {
        submit();
      }
    };
    document.addEventListener('quiz-timeup', onTimeUp as any);
    return () => document.removeEventListener('quiz-timeup', onTimeUp as any);
  }, [submitted]);

  // Keyboard shortcuts: 1-5 selects, Enter submits, C clears
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (loading || !item) return;
    if (!submitted) {
      if (e.key >= '1' && e.key <= '5') {
        const idx = Number(e.key) - 1;
        if (idx < (item.fullItem?.options?.length || 0)) setChoice(idx);
      }
      if (e.key.toLowerCase() === 'c') setChoice(null);
      if (e.key === 'Enter' && choice !== null) submit();
    } else {
      if (e.key === 'Enter') handleNext();
    }
  }, [loading, item, submitted, choice]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  // Attempt accumulation in memory
  const [attemptItems, setAttemptItems] = useState<StoredQuestionAttempt[]>([]);

  async function loadNext() {
    setLoading(true);
    try {
      // Initialize total from config once
      if (activeQuiz?.config?.numQuestions && totalQuestions === 1 && questionIndex === 0) {
        setTotalQuestions(activeQuiz.config.numQuestions);
      }
      // Check for personalized questions first
      const personalizedResult = await api.pe.getPersonalizedQuestions({ limit: 1 }) as any;
      
      if (personalizedResult.questions && personalizedResult.questions.length > 0) {
        const personalizedQuestion = personalizedResult.questions[0];
        setItem({ 
          itemId: personalizedQuestion.personalQuestionId,
          isPersonalized: true,
          personalizedFor: personalizedQuestion.personalizedFor,
          gapTargeted: personalizedQuestion.gapTargeted,
          focusArea: personalizedQuestion.focusArea,
          preview: {
            difficulty: personalizedQuestion.difficulty,
            stem: personalizedQuestion.stem,
            leadIn: personalizedQuestion.leadIn
          },
          fullItem: personalizedQuestion
        });
        toast.success('Personalized Question', 'This question was created specifically for your learning needs!');
      } else {
        // Load regular question with taxonomy or topic filtering
        const nextItemRequest: any = {};
        
        if (activeQuiz?.config?.taxonomyFilter) {
          nextItemRequest.taxonomyFilter = activeQuiz.config.taxonomyFilter;
        } else if (activeQuiz?.config?.topicIds?.length && activeQuiz.config.topicIds.length > 0) {
          nextItemRequest.topicIds = activeQuiz.config.topicIds;
        }
        
        const res: any = await api.pe.nextItem(nextItemRequest);
        if (res && res.itemId) {
          const full = await api.items.get(res.itemId);
          setItem({ 
            itemId: res.itemId, 
            isPersonalized: false,
            preview: res.preview, 
            fullItem: full 
          });
        } else {
          setItem(null);
        }
      }
      
      // Reset state for new question
      setChoice(null); 
      setSubmitted(false); 
      setStart(Date.now()); 
      setShowExplanation(false);
      setShowFeedback(false);
      setIsCorrect(null);
      setAdaptiveTriggered(false);
      setConfidence('Medium');
      setNote('');
      
      // Update index
      setQuestionIndex(prev => prev + 1);
      
    } catch (error: any) {
      console.error('Failed to load next question:', error);
      toast.error('Load failed', 'Failed to load next question');
    } finally { 
      setLoading(false); 
    }
  }

  useEffect(() => { loadNext(); }, []);

  async function createFlashcardNow(currentItem: any) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      setCreatingCard(true);
      const correctIndex = Number(currentItem?.fullItem?.keyIndex ?? -1);
      const front = currentItem?.fullItem?.stem || 'Card';
      const answerText = currentItem?.fullItem?.options?.[correctIndex]?.text || '';
      const back = `Answer: ${answerText}\n\n${currentItem?.fullItem?.explanation || ''}`;
      await addDoc(collection(db, 'flashcards', uid, 'cards'), {
        front,
        back,
        topicIds: currentItem?.fullItem?.topicIds || [],
        ease: 2.3,
        intervalDays: 0,
        dueAt: Date.now(),
        reviewHistory: []
      });
      toast.success('Flashcard created', 'Added to your flashcards');
    } catch (e: any) {
      toast.error('Flashcard failed', e.message || 'Could not create flashcard');
    } finally {
      setCreatingCard(false);
    }
  }

  async function submit() {
    if (!item || choice === null) return;
    
    setSubmitted(true);
    const timeToAnswerSec = Math.round((Date.now() - start) / 1000);
    const correctIndex = Number(item.fullItem?.keyIndex ?? 0);
    const correct = choice === correctIndex;
    setIsCorrect(correct);

    try {
      await api.pe.recordAnswer({
        itemId: item.itemId,
        correct,
        chosenIndex: choice,
        correctIndex,
        topicIds: item.fullItem?.topicIds || [],
        confidence,
        timeToAnswerSec,
      });

      // Accumulate for attempt save
      setAttemptItems(prev => ([...prev, {
        itemRef: item.itemId,
        topicIds: item.fullItem?.topicIds || [],
        chosenIndex: choice,
        correctIndex,
        correct,
        confidence: confidence as any,
        timeToAnswerSec,
        ratings: { question: null, explanation: null, reasons: [] },
        note: note || undefined,
      }]));

      // Trigger adaptive generation if question was missed
      if (!correct && !item.isPersonalized && !adaptiveTriggered) {
        try {
          const adaptiveResult: any = await api.pe.triggerAdaptiveGeneration({
            missedQuestionId: item.itemId,
            userSpecifiedFocus: item.gapTargeted?.gapType || undefined
          });
          
          if (adaptiveResult.questionsGenerated > 0) {
            toast.success(
              'Learning Opportunity', 
              `We've created ${adaptiveResult.questionsGenerated} personalized question(s) to help with this topic!`
            );
            setAdaptiveTriggered(true);
          }
        } catch (error: any) {
          console.warn('Adaptive generation failed:', error.message);
        }
      }

      setShowExplanation(true);
      
    } catch (error: any) {
      console.error('Failed to record answer:', error);
      toast.error('Save failed', 'Failed to record your answer');
      setSubmitted(false);
    }
  }

  async function finishAttemptIfNeeded() {
    const target = activeQuiz?.config?.numQuestions || totalQuestions || 0;
    if (attemptItems.length >= target && target > 0) {
      try {
        const startedAt = activeQuiz?.startedAt || Date.now();
        const numCorrect = attemptItems.filter(a => a.correct).length;
        const score = Math.round((numCorrect / attemptItems.length) * 100);
        const attemptId = await saveAttempt({
          startedAt,
          finishedAt: Date.now(),
          score,
          durationSec: attemptItems.reduce((acc, it) => acc + (it.timeToAnswerSec || 0), 0),
          items: attemptItems,
        });
        navigate(`/quiz/summary/${attemptId}`);
      } catch (e: any) {
        console.error('Attempt save failed:', e);
        toast.error('Attempt save failed', e.message || 'Could not save attempt');
      }
    }
  }

  const handleNext = () => {
    const target = activeQuiz?.config?.numQuestions || totalQuestions || 0;
    if (attemptItems.length >= target && target > 0) {
      finishAttemptIfNeeded();
    } else {
      loadNext();
    }
  };

  const handleFeedbackSubmitted = () => {
    setShowFeedback(false);
    toast.success('Thank you!', 'Your feedback helps improve question quality');
  };

  const getResultIcon = () => {
    if (!submitted || isCorrect === null) return null;
    return isCorrect ? '✅' : '❌';
  };

  const clearSelection = () => setChoice(null);

  const shortExplanation = !!(item?.fullItem?.explanation && String(item.fullItem.explanation).trim().length < 120);

  return (
    <div className="max-w-4xl mx-auto">
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your next question...</p>
          </div>
        </div>
      )}
      
      {!loading && item && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Question Header */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-500">Question {Math.max(1, questionIndex)} of {Math.max(totalQuestions, questionIndex || 1)}</div>
              {!submitted && (
                <button onClick={clearSelection} className="text-sm text-gray-600 hover:text-gray-900 underline">Clear</button>
              )}
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-lg">
                  Difficulty: {item.preview?.difficulty?.toFixed?.(2) || 'N/A'}
                </div>
                {item.isPersonalized && (
                  <div className="px-3 py-1 bg-gray-900 text-white rounded-lg text-sm font-medium">
                    🎯 Personalized for You
                  </div>
                )}
              </div>
              {item.isPersonalized && item.gapTargeted && (
                <div className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                  Focus: {item.focusArea} • Gap: {item.gapTargeted.gapType}
                </div>
              )}
            </div>

            {/* Question Content */}
            <div className={`transition-all duration-300 ${submitted ? 'opacity-75' : ''}`} role="group" aria-label="Multiple Choice Question">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="text-xl font-semibold text-gray-900 mb-3">
                    {item.fullItem?.stem || item.preview?.stem || 'Question'}
                  </div>
                  {item.fullItem?.leadIn && (
                    <div className="text-gray-700 leading-relaxed">
                      {item.fullItem.leadIn}
                    </div>
                  )}
                </div>
                {getResultIcon() && (
                  <div className="text-3xl ml-6 flex-shrink-0">
                    {getResultIcon()}
                  </div>
                )}
              </div>

              {/* Answer Options */}
              <div className="space-y-3">
                {(item.fullItem?.options || []).map((opt: any, i: number) => {
                  let optionClass = 'text-left border-2 rounded-lg p-4 transition-all duration-200 w-full';
                  
                  if (submitted) {
                    // Show results after submission
                    if (i === item.fullItem?.keyIndex) {
                      optionClass += ' border-green-500 bg-green-50 text-green-900';
                    } else if (i === choice) {
                      optionClass += ' border-red-500 bg-red-50 text-red-900';
                    } else {
                      optionClass += ' border-gray-200 bg-gray-50 text-gray-600';
                    }
                  } else {
                    // Interactive state before submission
                    if (choice === i) {
                      optionClass += ' border-gray-900 bg-gray-50 text-gray-900 shadow-sm';
                    } else {
                      optionClass += ' border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer';
                    }
                  }

                  return (
                    <button 
                      key={i} 
                      onClick={() => !submitted && setChoice(i)} 
                      className={optionClass}
                      disabled={submitted}
                      role="radio"
                      aria-checked={choice === i}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center text-sm font-semibold flex-shrink-0">
                          {String.fromCharCode(65 + i)}
                        </div>
                        <div className="flex-1 text-left">
                          {opt.text}
                        </div>
                        {submitted && i === item.fullItem?.keyIndex && (
                          <span className="text-green-600 text-lg">✓</span>
                        )}
                        {submitted && i === choice && i !== item.fullItem?.keyIndex && (
                          <span className="text-red-600 text-lg">✗</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Confidence Selector */}
          {!submitted && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-700">Confidence Level:</span>
                {['Low', 'Medium', 'High'].map((level) => (
                  <button
                    key={level}
                    onClick={() => setConfidence(level as any)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      confidence === level
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {!submitted ? (
                  <button 
                    onClick={submit} 
                    disabled={choice === null} 
                    className="px-8 py-3 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button 
                    onClick={handleNext}
                    className="px-8 py-3 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
                  >
                    {attemptItems.length >= (activeQuiz?.config?.numQuestions || totalQuestions || 0) ? 'Finish →' : 'Next Question →'}
                  </button>
                )}
                
                <TutorDrawer itemId={item.itemId} topicIds={item.fullItem?.topicIds || []} />
              </div>

              {submitted && (
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowFeedback(true)}
                    className="px-4 py-2 text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-lg transition-colors"
                    aria-label="Rate question"
                  >
                    📝 Rate Question
                  </button>
                </div>
              )}
            </div>

            {/* Result Summary + Actions */}
            {submitted && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-6 p-4 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}
                role="status"
                aria-live="polite"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className={isCorrect ? 'text-green-900' : 'text-red-900'}>
                    <span className="font-semibold">
                      {isCorrect ? '🎉 Correct!' : '💡 Learning Opportunity'}
                    </span>
                    {!isCorrect && adaptiveTriggered && (
                      <span className="ml-2 text-gray-600">• Personalized follow-up questions created</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    Confidence: {confidence} • Time: {Math.round((Date.now() - start) / 1000)}s
                  </div>
                </div>

                {/* Short explanation chip */}
                {shortExplanation && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 text-sm">
                    ⚠️ Short explanation detected
                    <button onClick={() => setShowFeedback(true)} className="underline" aria-label="Flag short explanation">Flag</button>
                  </div>
                )}

                {/* Notes & Flashcard */}
                <div className="mt-4 grid gap-3">
                  <label className="text-sm text-gray-700" htmlFor="quiz-note">Your note (optional)</label>
                  <textarea id="quiz-note" value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a note for yourself (optional)" className="w-full border rounded-lg p-2 text-sm" rows={2} />
                  <div className="flex gap-2">
                    <button onClick={() => createFlashcardNow(item)} disabled={creatingCard} className="px-3 py-2 rounded-lg border text-sm" aria-label="Create flashcard from this question">
                      {creatingCard ? 'Creating…' : 'Create Flashcard'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Explanation */}
          <AnimatePresence>
            {showExplanation && item.fullItem?.explanation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
              >
                <h4 className="font-semibold text-gray-900 mb-4">Explanation</h4>
                <div 
                  className="prose prose-sm max-w-none text-gray-700 leading-relaxed" 
                  dangerouslySetInnerHTML={{ 
                    __html: renderSafeMarkdown(String(item.fullItem.explanation)) 
                  }} 
                  aria-label="Question explanation"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {!loading && !item && (
        <div className="text-center py-16">
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100">
            <div className="text-6xl mb-6 opacity-50">🎯</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">No questions available</h3>
            <p className="text-gray-600">Check back later for new content</p>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {item && (
        <QuestionFeedback
          itemId={item.itemId}
          isOpen={showFeedback}
          onClose={() => setShowFeedback(false)}
          onSubmitted={handleFeedbackSubmitted}
        />
      )}
    </div>
  );
} 