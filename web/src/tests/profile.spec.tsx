import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfilePage from '../pages/ProfilePage';
import { auth, db, getUserProfile } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

vi.mock('firebase/app', () => ({
    initializeApp: vi.fn(() => ({})),
    getApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', async () => {
    const actual = await vi.importActual('firebase/auth');
    return {
        ...actual,
        getAuth: vi.fn(() => ({
            onAuthStateChanged: vi.fn(),
        })),
    };
});

// Mock Firebase auth and Firestore
vi.mock('../lib/firebase', async () => {
  const actual = await vi.importActual('../lib/firebase');
  return {
    ...actual,
    auth: {
      onAuthStateChanged: vi.fn(),
    },
    db: {},
    getUserProfile: vi.fn(),
  };
});

vi.mock('firebase/firestore', async () => {
    const actual = await vi.importActual('firebase/firestore');
    return {
        ...actual,
        getFirestore: vi.fn(() => ({})),
        updateDoc: vi.fn(),
        doc: vi.fn(),
    };
});


const mockUserProfile = {
  uid: '123',
  displayName: 'Test User',
  email: 'test@example.com',
  preferences: {
    learningPace: 'steady',
    darkMode: false,
    emailSummary: true,
    quizConfidenceAssessment: true,
  },
  stats: {
    quizzesTaken: 10,
    averageScore: 85,
    streak: 5,
    lastStudiedAt: new Date(),
  },
};

describe('ProfilePage', () => {
  it('renders user profile information correctly', async () => {
    vi.mocked(auth.onAuthStateChanged).mockImplementation((callback) => {
      callback({ uid: '123' });
      return () => {};
    });
    vi.mocked(getUserProfile).mockResolvedValue(mockUserProfile);

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Name: Test User')).toBeInTheDocument();
      expect(screen.getByText('Email: test@example.com')).toBeInTheDocument();
      expect(screen.getByText('Quizzes Taken: 10')).toBeInTheDocument();
    });
  });

  it('allows editing and saving preferences', async () => {
    vi.mocked(auth.onAuthStateChanged).mockImplementation((callback) => {
      callback({ uid: '123' });
      return () => {};
    });
    vi.mocked(getUserProfile).mockResolvedValue(mockUserProfile);
    const mockDoc = {};
    vi.mocked(doc).mockReturnValue(mockDoc);
    vi.mocked(updateDoc).mockResolvedValue(undefined);


    render(<ProfilePage />);
    const user = userEvent.setup();

    await waitFor(async () => {
      await user.click(screen.getByRole('button', { name: /edit/i }));
    });

    const paceSelect = screen.getByLabelText('Learning Pace');
    await user.selectOptions(paceSelect, 'fast');

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledWith(
        mockDoc,
        {
          preferences: {
            ...mockUserProfile.preferences,
            learningPace: 'fast',
          },
        }
      );
    });
  });
});
