import { collection, getDocs, orderBy, query, limit, startAfter, Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import PageShell from "../components/ui/PageShell";
import SectionCard from "../components/ui/SectionCard";
import { Button } from "../components/ui/Buttons";

interface LogEntry {
  id: string;
  at: Timestamp;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  [key: string]: any;
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");

  const fetchLogs = async (loadMore = false) => {
    setLoading(true);
    const col = collection(db, "ops", "runLogs", "entries");
    let qy;
    if (loadMore && lastDoc) {
      qy = query(col, orderBy("at", "desc"), startAfter(lastDoc), limit(50));
    } else {
      qy = query(col, orderBy("at", "desc"), limit(50));
    }
    const snap = await getDocs(qy);
    const newLogs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry));

    if (loadMore) {
      setLogs(prevLogs => [...prevLogs, ...newLogs]);
    } else {
      setLogs(newLogs);
    }

    if (snap.docs.length > 0) {
      setLastDoc(snap.docs[snap.docs.length - 1]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    let result = logs;
    if (searchTerm) {
      result = result.filter(log =>
        log.message.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (levelFilter !== "all") {
      result = result.filter(log => log.level === levelFilter);
    }
    setFilteredLogs(result);
  }, [logs, searchTerm, levelFilter]);

  const getLogLevelClass = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-500';
      case 'warn': return 'text-yellow-500';
      case 'info': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <PageShell title="Logs" subtitle="Recent operational logs" maxWidth="7xl">
      <SectionCard>
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="p-2 border rounded"
            />
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="p-2 border rounded"
            >
              <option value="all">All Levels</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="debug">Debug</option>
            </select>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2">Timestamp</th>
                  <th className="p-2">Level</th>
                  <th className="p-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(l => (
                  <tr key={l.id} className="border-b">
                    <td className="p-2 whitespace-nowrap">{l.at.toDate().toLocaleString()}</td>
                    <td className={`p-2 font-medium ${getLogLevelClass(l.level)}`}>{l.level.toUpperCase()}</td>
                    <td className="p-2">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-center">
            <Button onClick={() => fetchLogs(true)} disabled={loading}>
              {loading ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}
