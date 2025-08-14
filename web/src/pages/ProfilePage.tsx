import PageShell from '../components/ui/PageShell';
import SectionCard from '../components/ui/SectionCard';

export default function Page() {
  return (
    <PageShell title="Profile" subtitle="Manage your account and preferences" maxWidth="5xl">
      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard title="Account">
          <div className="space-y-2 text-sm text-gray-700">
            <div>Name: —</div>
            <div>Email: —</div>
          </div>
        </SectionCard>
        <SectionCard title="Preferences">
          <div className="space-y-2 text-sm text-gray-700">
            <div>Learning pace: —</div>
            <div>Dark mode: —</div>
            <div>Email summaries: —</div>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
