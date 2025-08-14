import { useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../components/Toast';

export default function AdminSetupPage() {
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const handleSeedDatabase = async () => {
    if (seeded) {
      toast.warning('Already seeded', 'Database has already been seeded with sample data.');
      return;
    }

    setSeeding(true);
    try {
      const result = await api.util.seedDatabase();
      console.log('Seed result:', result);
      
      toast.success(
        'Database seeded successfully!', 
        `Created ${(result as any).itemsCreated} sample dermatology questions.`
      );
      setSeeded(true);
    } catch (error: any) {
      console.error('Seeding error:', error);
      toast.error(
        'Failed to seed database', 
        error.message || 'An unexpected error occurred'
      );
    } finally {
      setSeeding(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/80 backdrop-blur rounded-3xl shadow-xl border border-gray-200/50 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 grid place-items-center text-white text-2xl mx-auto mb-4">
              ⚙️
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Setup</h1>
            <p className="text-gray-600">Initialize the database with sample content</p>
          </div>

          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-blue-900 mb-3">🚀 Database Initialization</h2>
              <p className="text-blue-800 mb-4">
                This will populate the database with sample dermatology quiz questions to make the app functional for testing and demonstration.
              </p>
              
              <div className="bg-white/50 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">What will be created:</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• 5 Sample dermatology questions (Psoriasis, Acne, Tinea, Atopic Dermatitis, Melanoma)</li>
                  <li>• Proper item structure with explanations and citations</li>
                  <li>• Realistic telemetry data for testing personalization</li>
                  <li>• Test admin user account</li>
                </ul>
              </div>

              <button
                onClick={handleSeedDatabase}
                disabled={seeding || seeded}
                className={`w-full px-6 py-4 rounded-xl font-semibold text-lg transition-all duration-300 ${
                  seeded 
                    ? 'bg-green-500 text-white cursor-not-allowed'
                    : seeding
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:shadow-xl hover:scale-105'
                }`}
              >
                {seeding ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Seeding Database...
                  </div>
                ) : seeded ? (
                  <div className="flex items-center justify-center gap-2">
                    ✅ Database Seeded Successfully
                  </div>
                ) : (
                  '🌱 Seed Database with Sample Questions'
                )}
              </button>
            </div>

            {seeded && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-green-900 mb-3">🎉 Setup Complete!</h3>
                <p className="text-green-800 mb-4">
                  The database has been successfully initialized. You can now:
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white/50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">✅ Test Quiz Functionality</h4>
                    <p className="text-sm text-gray-700">Navigate to the quiz section and start a quiz to test the system.</p>
                  </div>
                  <div className="bg-white/50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">📚 Review Sample Questions</h4>
                    <p className="text-sm text-gray-700">Check the Admin Items page to see the created questions.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-amber-900 mb-3">⚠️ Important Notes</h3>
              <ul className="text-amber-800 space-y-2 text-sm">
                <li>• This is a one-time setup for testing purposes</li>
                <li>• Sample questions are for demonstration only</li>
                <li>• In production, questions would be generated via AI or imported from real content</li>
                <li>• You can delete and re-seed if needed for testing</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
} 