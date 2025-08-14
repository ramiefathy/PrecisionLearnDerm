import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { toast } from './Toast';

interface QuestionFeedbackProps {
  itemId: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

interface FeedbackData {
  questionQuality: number;
  explanationQuality: number;
  difficultyRating: number;
  clarityRating: number;
  relevanceRating: number;
  reportedIssues: string[];
  feedbackText: string;
}

const ISSUE_OPTIONS = [
  { id: 'unclear_wording', label: 'Unclear wording', icon: '❓' },
  { id: 'incorrect_answer', label: 'Incorrect answer', icon: '❌' },
  { id: 'poor_distractors', label: 'Poor answer options', icon: '🎯' },
  { id: 'outdated_information', label: 'Outdated information', icon: '📅' },
  { id: 'too_difficult', label: 'Too difficult', icon: '🔥' },
  { id: 'too_easy', label: 'Too easy', icon: '😴' },
  { id: 'irrelevant_topic', label: 'Not relevant', icon: '🚫' },
  { id: 'poor_explanation', label: 'Poor explanation', icon: '📝' },
  { id: 'missing_details', label: 'Missing key details', icon: '🔍' },
  { id: 'confusing_format', label: 'Confusing format', icon: '🌀' }
];

const StarRating: React.FC<{
  rating: number;
  onRatingChange: (rating: number) => void;
  label: string;
  disabled?: boolean;
}> = ({ rating, onRatingChange, label, disabled = false }) => {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex space-x-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onRatingChange(star)}
            className={`text-2xl transition-all duration-200 hover:scale-110 ${
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            } ${
              star <= rating
                ? 'text-yellow-400 hover:text-yellow-500'
                : 'text-gray-300 hover:text-yellow-300'
            }`}
            role="radio"
            aria-checked={star === rating}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
          >
            ⭐
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-500">
        {rating === 0 ? 'No rating' : 
         rating === 1 ? 'Very Poor' :
         rating === 2 ? 'Poor' :
         rating === 3 ? 'Average' :
         rating === 4 ? 'Good' : 'Excellent'}
      </div>
    </div>
  );
};

const IssueSelector: React.FC<{
  selectedIssues: string[];
  onIssuesChange: (issues: string[]) => void;
  disabled?: boolean;
}> = ({ selectedIssues, onIssuesChange, disabled = false }) => {
  const toggleIssue = (issueId: string) => {
    if (disabled) return;
    
    if (selectedIssues.includes(issueId)) {
      onIssuesChange(selectedIssues.filter(id => id !== issueId));
    } else {
      onIssuesChange([...selectedIssues, issueId]);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Report Issues (optional)
      </label>
      <div className="grid grid-cols-2 gap-2">
        {ISSUE_OPTIONS.map((issue) => (
          <button
            key={issue.id}
            type="button"
            disabled={disabled}
            onClick={() => toggleIssue(issue.id)}
            className={`flex items-center space-x-2 p-2 rounded-lg border text-sm transition-all duration-200 ${
              disabled 
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer hover:shadow-md'
            } ${
              selectedIssues.includes(issue.id)
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
            aria-pressed={selectedIssues.includes(issue.id)}
            aria-label={issue.label}
          >
            <span>{issue.icon}</span>
            <span className="flex-1 text-left">{issue.label}</span>
            {selectedIssues.includes(issue.id) && (
              <span className="text-red-500">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default function QuestionFeedback({ itemId, isOpen, onClose, onSubmitted }: QuestionFeedbackProps) {
  const [feedback, setFeedback] = useState<FeedbackData>({
    questionQuality: 0,
    explanationQuality: 0,
    difficultyRating: 0,
    clarityRating: 0,
    relevanceRating: 0,
    reportedIssues: [],
    feedbackText: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (feedback.questionQuality === 0 || feedback.explanationQuality === 0) {
      toast.error('Required ratings missing', 'Please rate both question and explanation quality');
      return;
    }

    setIsSubmitting(true);

    try {
      await api.quality.submitFeedback({
        itemId,
        questionQuality: feedback.questionQuality,
        explanationQuality: feedback.explanationQuality,
        difficultyRating: feedback.difficultyRating || 3,
        clarityRating: feedback.clarityRating || 3,
        relevanceRating: feedback.relevanceRating || 3,
        reportedIssues: feedback.reportedIssues,
        feedbackText: feedback.feedbackText
      });

      setIsSubmitted(true);
      toast.success('Feedback submitted!', 'Thank you for helping improve question quality');
      
      setTimeout(() => {
        onSubmitted?.();
        onClose();
      }, 2000);

    } catch (error: any) {
      console.error('Failed to submit feedback:', error);
      toast.error('Submission failed', error.message || 'Please try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const canSubmit = feedback.questionQuality > 0 && feedback.explanationQuality > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="Question Feedback"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Question Feedback</h2>
                  <p className="text-blue-100 text-sm">Help us improve this question for all learners</p>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {isSubmitted ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center py-8"
                >
                  <div className="text-6xl mb-4">🎉</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Feedback Submitted!
                  </h3>
                  <p className="text-gray-600">
                    Your input helps us maintain high-quality educational content
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Primary Ratings */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-xl space-y-4">
                    <h3 className="font-semibold text-gray-900 mb-4">⭐ Quality Ratings (Required)</h3>
                    
                    <div className="grid md:grid-cols-2 gap-6">
                      <StarRating
                        rating={feedback.questionQuality}
                        onRatingChange={(rating) => setFeedback(prev => ({ ...prev, questionQuality: rating }))}
                        label="Question Quality"
                        disabled={isSubmitting}
                      />
                      
                      <StarRating
                        rating={feedback.explanationQuality}
                        onRatingChange={(rating) => setFeedback(prev => ({ ...prev, explanationQuality: rating }))}
                        label="Explanation Quality"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  {/* Additional Ratings */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">📊 Additional Ratings (Optional)</h3>
                    
                    <div className="grid md:grid-cols-3 gap-4">
                      <StarRating
                        rating={feedback.difficultyRating}
                        onRatingChange={(rating) => setFeedback(prev => ({ ...prev, difficultyRating: rating }))}
                        label="Difficulty Level"
                        disabled={isSubmitting}
                      />
                      
                      <StarRating
                        rating={feedback.clarityRating}
                        onRatingChange={(rating) => setFeedback(prev => ({ ...prev, clarityRating: rating }))}
                        label="Clarity"
                        disabled={isSubmitting}
                      />
                      
                      <StarRating
                        rating={feedback.relevanceRating}
                        onRatingChange={(rating) => setFeedback(prev => ({ ...prev, relevanceRating: rating }))}
                        label="Relevance"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  {/* Issue Reporting */}
                  <IssueSelector
                    selectedIssues={feedback.reportedIssues}
                    onIssuesChange={(issues) => setFeedback(prev => ({ ...prev, reportedIssues: issues }))}
                    disabled={isSubmitting}
                  />

                  {/* Additional Comments */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700" htmlFor="feedback-notes">
                      Additional Comments (optional)
                    </label>
                    <textarea
                      id="feedback-notes"
                      value={feedback.feedbackText}
                      onChange={(e) => setFeedback(prev => ({ ...prev, feedbackText: e.target.value }))}
                      disabled={isSubmitting}
                      placeholder="Share any specific thoughts or suggestions..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      rows={3}
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="flex items-center justify-between pt-4">
                    <div className="text-sm text-gray-500">
                      {canSubmit ? (
                        <span className="text-green-600">✓ Ready to submit</span>
                      ) : (
                        <span>Please rate question and explanation quality</span>
                      )}
                    </div>
                    
                    <div className="flex space-x-3">
                      <button
                        type="button"
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      
                      <button
                        type="submit"
                        disabled={!canSubmit || isSubmitting}
                        className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2"
                        aria-label="Submit feedback"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Submitting...</span>
                          </>
                        ) : (
                          <span>Submit Feedback</span>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 