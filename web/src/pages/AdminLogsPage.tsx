import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import PageShell from "../components/ui/PageShell";
import SectionCard from "../components/ui/SectionCard";

export default function AdminLogsPage(){
  const [logs,setLogs]=useState<any[]>([]);
  useEffect(()=>{(async()=>{
    const col=collection(db,"ops","runLogs","entries");
    const qy=query(col, orderBy("at","desc"), limit(50));
    const snap=await getDocs(qy);
    setLogs(snap.docs.map(d=>({id:d.id,...d.data()})));
  })();},[]);
  return (
    <PageShell title="Logs" subtitle="Recent operational logs" maxWidth="7xl">
      <SectionCard>
        <div className="grid gap-3">
          {logs.map(l=> (
            <pre key={l.id} className="text-xs border rounded-xl p-3 overflow-auto bg-white/70">{JSON.stringify(l,null,2)}</pre>
          ))}
        </div>
      </SectionCard>
    </PageShell>
  );
}
