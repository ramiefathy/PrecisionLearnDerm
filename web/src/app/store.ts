import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '../lib/firebase';

export interface QuizConfig {
  numQuestions: number;
  timed: boolean;
  durationMins: number;
  progressionMode: 'one-by-one' | 'batch';
  captureConfidence: boolean;
  topicIds: string[];
}

export interface ActiveQuizState {
  startedAt: number;
  items: any[];
  answers: Record<number, { chosenIndex: number; confidence?: string; timeToAnswerSec: number }>;
  config: QuizConfig;
  currentIndex: number;
  schemaVersion: number;
}

interface AppStore {
  // Auth state
  authUser: any | null;
  setAuthUser: (user: any | null) => void;
  
  // Profile state
  profile: UserProfile | null;
  profileLoading: boolean;
  setProfile: (profile: UserProfile | null) => void;
  setProfileLoading: (loading: boolean) => void;
  
  // Quiz state
  activeQuiz: ActiveQuizState | null;
  setActiveQuiz: (quiz: ActiveQuizState | null) => void;
  updateQuizAnswer: (index: number, answer: { chosenIndex: number; confidence?: string; timeToAnswerSec: number }) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Auth (not persisted - always starts fresh)
      authUser: null,
      setAuthUser: (user) => set({ authUser: user }),
      
      // Profile (not persisted - loaded fresh each session)
      profile: null,
      profileLoading: false,
      setProfile: (profile) => set({ profile }),
      setProfileLoading: (loading) => set({ profileLoading: loading }),
      
      // Quiz state (persisted)
      activeQuiz: null,
      setActiveQuiz: (quiz) => set({ activeQuiz: quiz }),
      updateQuizAnswer: (index, answer) => {
        const { activeQuiz } = get();
        if (activeQuiz) {
          set({
            activeQuiz: {
              ...activeQuiz,
              answers: { ...activeQuiz.answers, [index]: answer }
            }
          });
        }
      },
    }),
    {
      name: 'precision-learn-derm',
      partialize: (state) => ({ 
        activeQuiz: state.activeQuiz // Only persist quiz state, not auth or profile
      }),
    }
  )
);
