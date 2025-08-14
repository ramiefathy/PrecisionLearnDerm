import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { api } from "../lib/api";
import PageShell from "../components/ui/PageShell";
import SectionCard from "../components/ui/SectionCard";
import { GradientButton, MutedButton } from "../components/ui/Buttons";

export default function AdminItemsPage(){
  const [items,setItems]=useState<any[]>([]);
  const [drafts,setDrafts]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [reviseItemId,setReviseItemId]=useState<string>("");
  const [reviseInstr,setReviseInstr]=useState<string>("");
  const [proposeTopics,setProposeTopics]=useState<string>("");

  async function load(){
    setLoading(true);
    try{
      const itemsSnap=await getDocs(query(collection(db,"items"), where("status","==","active"), limit(50)));
      setItems(itemsSnap.docs.map(d=>({ id: d.id, ...(d.data() as any) })));
      const draftsSnap=await getDocs(query(collection(db,"drafts"), orderBy("status","asc"), limit(50)) as any);
      setDrafts(draftsSnap.docs.map(d=>({ id: d.id, ...(d.data() as any) })));
    } finally { setLoading(false); }
  }

  useEffect(()=>{ load(); },[]);

  async function propose(){
    const topicIds = proposeTopics.split(",").map(s=>s.trim()).filter(Boolean);
    await (api as any).items.propose({ topicIds });
    await load();
  }
  async function revise(){
    if(!reviseItemId || !reviseInstr) return;
    await (api as any).items.revise({ itemId: reviseItemId, instructions: reviseInstr });
    setReviseInstr("");
    await load();
  }
  async function promote(draftId: string){
    await (api as any).items.promote({ draftId });
    await load();
  }

  return (
    <PageShell title="Admin: Items" subtitle="Manage questions and drafts" maxWidth="7xl">
      <div className="space-y-6">
        <SectionCard title="Propose New">
          <div className="flex gap-2 items-center">
            <input value={proposeTopics} onChange={e=>setProposeTopics(e.target.value)} placeholder="topicIds comma-separated" className="border rounded-lg p-2 flex-1"/>
            <GradientButton onClick={propose}>Propose</GradientButton>
          </div>
        </SectionCard>

        <SectionCard title="Revise Existing">
          <div className="flex gap-2 items-center">
            <input value={reviseItemId} onChange={e=>setReviseItemId(e.target.value)} placeholder="itemId" className="border rounded-lg p-2"/>
            <input value={reviseInstr} onChange={e=>setReviseInstr(e.target.value)} placeholder="instructions" className="border rounded-lg p-2 flex-1"/>
            <MutedButton onClick={revise}>Revise</MutedButton>
          </div>
        </SectionCard>

        <SectionCard title="Active Items">
          {loading && <div>Loading…</div>}
          {!loading && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b"><th className="p-2">ID</th><th className="p-2">Difficulty</th><th className="p-2">Attempts</th><th className="p-2">pCorrect</th><th className="p-2">AvgTime</th></tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-mono text-xs">{it.id}</td>
                      <td className="p-2">{Number(it.difficulty||0).toFixed(2)}</td>
                      <td className="p-2">{it.telemetry?.attempts||0}</td>
                      <td className="p-2">{it.telemetry?.pCorrect||0}</td>
                      <td className="p-2">{it.telemetry?.avgTimeSec||0}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Drafts">
          <div className="grid gap-2">
            {drafts.map(d => (
              <div key={d.id} className="border rounded-xl p-3 text-sm bg-white/70">
                <div className="flex justify-between items-center">
                  <div>Draft {d.id} — status: {d.status}</div>
                  <div className="flex gap-2">
                    <GradientButton onClick={()=>promote(d.id)}>Promote</GradientButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
