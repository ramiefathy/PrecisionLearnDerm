import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { api } from "../lib/api";
import PageShell from "../components/ui/PageShell";
import SectionCard from "../components/ui/SectionCard";
import { GradientButton, MutedButton } from "../components/ui/Buttons";

export default function AdminItemEditorPage(){
  const { itemId } = useParams();
  const [orig,setOrig]=useState<any>(null);
  const [edit,setEdit]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [reviseInstr,setReviseInstr]=useState("");
  const [msg,setMsg]=useState<string>("");

  useEffect(()=>{(async()=>{
    if(!itemId) return;
    setLoading(true);
    const ref = doc(db,'items',itemId);
    const snap = await getDoc(ref);
    if(snap.exists()){
      const d=snap.data();
      setOrig(d); setEdit(JSON.parse(JSON.stringify(d)));
    }
    setLoading(false);
  })();},[itemId]);

  async function save(){
    if(!itemId || !edit) return;
    await updateDoc(doc(db,'items',itemId), edit);
    setMsg('Saved');
  }
  async function revise(){
    if(!itemId || !reviseInstr) return;
    await (api as any).items.revise({ itemId, instructions: reviseInstr });
    setMsg('Revision draft created'); setReviseInstr('');
  }

  return (
    <PageShell title={`Admin: Edit Item ${itemId}`} subtitle="Edit item content and create revisions" maxWidth="7xl">
      {loading && <div>Loading…</div>}
      {!loading && orig && (
        <div className="grid md:grid-cols-2 gap-6">
          <SectionCard title="Original">
            <pre className="text-xs border rounded-xl p-3 overflow-auto bg-gray-50">{JSON.stringify(orig,null,2)}</pre>
          </SectionCard>
          <SectionCard title="Edit">
            <div className="grid gap-3 text-sm">
              <label>Stem<textarea className="border rounded-lg p-2 w-full" rows={4} value={edit?.stem||''} onChange={e=>setEdit((x:any)=>({...x, stem: e.target.value}))}/></label>
              <label>Lead-in<input className="border rounded-lg p-2 w-full" value={edit?.leadIn||''} onChange={e=>setEdit((x:any)=>({...x, leadIn: e.target.value}))}/></label>
              <label>Options (JSON)
                <textarea className="border rounded-lg p-2 w-full" rows={6} value={JSON.stringify(edit?.options||[],null,2)} onChange={e=>{ try{ const v=JSON.parse(e.target.value); setEdit((x:any)=>({...x, options: v})); } catch{} }}/>
              </label>
              <label>Explanation<textarea className="border rounded-lg p-2 w-full" rows={6} value={edit?.explanation||''} onChange={e=>setEdit((x:any)=>({...x, explanation: e.target.value}))}/></label>
              <label>Key Index<input type="number" className="border rounded-lg p-2 w-full" value={edit?.keyIndex??0} onChange={e=>setEdit((x:any)=>({...x, keyIndex: Number(e.target.value) }))}/></label>
              <div className="flex gap-2">
                <GradientButton onClick={save}>Save Item</GradientButton>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
      <div className="grid gap-3 mt-6">
        <SectionCard title="Revise with instructions">
          <div className="flex gap-2">
            <input value={reviseInstr} onChange={e=>setReviseInstr(e.target.value)} placeholder="e.g., shorten stem by 20%" className="border rounded-lg p-2 flex-1"/>
            <MutedButton onClick={revise}>Revise</MutedButton>
          </div>
          {msg && <div className="text-sm text-green-700 mt-3">{msg}</div>}
        </SectionCard>
      </div>
    </PageShell>
  );
}
