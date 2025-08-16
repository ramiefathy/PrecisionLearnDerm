import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db, getUserProfile, UserProfile } from '../lib/firebase';
import PageShell from '../components/ui/PageShell';
import SectionCard from '../components/ui/SectionCard';
import { Button } from '../components/ui/Buttons';

export default function Page() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const profile = await getUserProfile(user.uid);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handlePreferencesChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!userProfile) return;
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setUserProfile({
      ...userProfile,
      preferences: {
        ...userProfile.preferences,
        [name]: type === 'checkbox' ? checked : value,
      },
    });
  };

  const handleSave = async () => {
    if (!userProfile) return;
    const userDocRef = doc(db, 'users', userProfile.uid);
    await updateDoc(userDocRef, {
      preferences: userProfile.preferences,
    });
    setIsEditing(false);
  };

  if (!userProfile) {
    return (
      <PageShell title="Profile" subtitle="Manage your account and preferences" maxWidth="5xl">
        <div>Loading...</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Profile" subtitle="Manage your account and preferences" maxWidth="5xl">
      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard title="Account">
          <div className="space-y-2 text-sm text-gray-700">
            <div>Name: {userProfile.displayName}</div>
            <div>Email: {userProfile.email}</div>
          </div>
        </SectionCard>
        <SectionCard title="Stats">
          <div className="space-y-2 text-sm text-gray-700">
            <div>Quizzes Taken: {userProfile.stats.quizzesTaken}</div>
            <div>Average Score: {userProfile.stats.averageScore.toFixed(2)}%</div>
            <div>Streak: {userProfile.stats.streak} days</div>
            <div>Last Studied: {userProfile.stats.lastStudiedAt ? new Date(userProfile.stats.lastStudiedAt).toLocaleDateString() : 'Never'}</div>
          </div>
        </SectionCard>
        <SectionCard title="Preferences" className="md:col-span-2">
          {isEditing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="learningPace" className="text-sm font-medium">Learning Pace</label>
                <select
                  id="learningPace"
                  name="learningPace"
                  value={userProfile.preferences.learningPace}
                  onChange={handlePreferencesChange}
                  className="w-1/2 p-2 border rounded"
                >
                  <option value="slow">Slow</option>
                  <option value="steady">Steady</option>
                  <option value="medium">Medium</option>
                  <option value="fast">Fast</option>
                  <option value="accelerated">Accelerated</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <label htmlFor="darkMode" className="text-sm font-medium">Dark Mode</label>
                <input
                  id="darkMode"
                  name="darkMode"
                  type="checkbox"
                  checked={userProfile.preferences.darkMode}
                  onChange={handlePreferencesChange}
                />
              </div>
              <div className="flex items-center justify-between">
                <label htmlFor="emailSummary" className="text-sm font-medium">Email Summaries</label>
                <input
                  id="emailSummary"
                  name="emailSummary"
                  type="checkbox"
                  checked={userProfile.preferences.emailSummary}
                  onChange={handlePreferencesChange}
                />
              </div>
              <div className="flex items-center justify-between">
                <label htmlFor="quizConfidenceAssessment" className="text-sm font-medium">Quiz Confidence Assessment</label>
                <input
                  id="quizConfidenceAssessment"
                  name="quizConfidenceAssessment"
                  type="checkbox"
                  checked={userProfile.preferences.quizConfidenceAssessment}
                  onChange={handlePreferencesChange}
                />
              </div>
              <div className="flex justify-end gap-4">
                <Button variant="muted" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button onClick={handleSave}>Save</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-gray-700">
              <div>Learning Pace: {userProfile.preferences.learningPace}</div>
              <div>Dark Mode: {userProfile.preferences.darkMode ? 'On' : 'Off'}</div>
              <div>Email Summaries: {userProfile.preferences.emailSummary ? 'On' : 'Off'}</div>
              <div>Quiz Confidence Assessment: {userProfile.preferences.quizConfidenceAssessment ? 'On' : 'Off'}</div>
              <div className="flex justify-end">
                <Button onClick={() => setIsEditing(true)}>Edit</Button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}
