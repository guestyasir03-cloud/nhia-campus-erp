import React, { useState, useEffect } from 'react';
import { Users, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ClassSummaryBoard() {
  const [classCounts, setClassCounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadCounts() {
      try {
        const { data, error } = await supabase.from('students').select('class_name');
        if (error || !data || !active) return;

        const map = {};
        for (const row of data) {
          const cls = (row.class_name || 'Unassigned').trim();
          map[cls] = (map[cls] || 0) + 1;
        }

        const sorted = Object.entries(map).sort((a, b) =>
          a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' })
        );

        setClassCounts(sorted);
        setTotal(data.length);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadCounts();
    return () => { active = false; };
  }, []);

  if (loading || classCounts.length === 0) return null;

  const maxCount = Math.max(...classCounts.map(([, c]) => c), 1);

  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      border: '1px solid #e2e8f0',
      padding: '14px 16px',
      marginBottom: 16
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: '#eef2ff', color: '#2e44d2',
            display: 'grid', placeItems: 'center'
          }}>
            <Users size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Class-wise Strength</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {classCounts.length} Classes • Total {total} Students
            </div>
          </div>
        </div>
        <div style={{ color: '#64748b' }}>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      {expanded && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))',
          gap: 8,
          marginTop: 14
        }}>
          {classCounts.map(([cls, count]) => {
            const pct = Math.round((count / maxCount) * 100);
            return (
              <div key={cls} style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '10px 10px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: '#475569',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {cls}
                </div>
                <div style={{ fontSize: 19, fontWeight: 800, color: '#2e44d2', lineHeight: 1.1 }}>
                  {count}
                </div>
                <div style={{ height: 4, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginTop: 2 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#2e44d2', borderRadius: 99 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
