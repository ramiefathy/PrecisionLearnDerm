import { useState } from "react";
import { api } from "../lib/api";
import PageShell from "../components/ui/PageShell";
import SectionCard from "../components/ui/SectionCard";
import { GradientButton, MutedButton } from "../components/ui/Buttons";

type LogEntry = { who: 'user' | 'tutor'; text: string; at: number };
interface ChatResponse { answerMarkdown?: string }
type SendHandler = () => Promise<void>;
type ExportHandler = () => void;

export default function PatientSimulationPage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [input, setInput] = useState("");

  const send: SendHandler = async () => {
    if (!input.trim()) return;
    setLog(l => [...l, { who: 'user', text: input, at: Date.now() }]);
    const res = await (api as { ai: { chatExplain: (payload: { userQuery: string }) => Promise<ChatResponse> } }).ai.chatExplain({ userQuery: input });
    setLog(l => [...l, { who: 'tutor', text: String(res?.answerMarkdown || ''), at: Date.now() }]);
    setInput("");
  };

  const exportNotes: ExportHandler = () => {
    const text = log.map(l => `[${new Date(l.at).toLocaleTimeString()}] ${l.who.toUpperCase()}: ${l.text}`).join("\n");
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'patient_sim_notes.txt'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <PageShell title="Patient Simulation" subtitle="Practice clinical conversations with an AI tutor" maxWidth="5xl">
      <SectionCard title="Session">
        <div className="h-[50vh] overflow-auto bg-white/70 border rounded-xl p-4">
          {log.map((l,i)=> (
            <div key={i} className={l.who==='user'? 'text-right' : ''}>
              <div className="text-xs text-gray-500">{new Date(l.at).toLocaleTimeString()}</div>
              <div className={`inline-block px-3 py-2 my-1 rounded-lg ${l.who==='user'?'bg-blue-600 text-white':'bg-gray-100'}`}>{l.text}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Type message" className="border rounded-lg p-2 flex-1"/>
          <GradientButton onClick={send}>Send</GradientButton>
          <MutedButton onClick={exportNotes}>Export Notes</MutedButton>
        </div>
      </SectionCard>
    </PageShell>
  );
}
