import React, { useState, useEffect } from 'react';
import { BarChart3, Download, ChevronLeft, Users, Wallet, Calendar, Trophy } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

export default function ReportsModule({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    loadCampusReport();
  }, []);

  async function loadCampusReport() {
    setLoading(true);
    const [
      { data: students },
      { data: staff },
      { data: attendance },
      { data: donations },
      { data: points }
    ] = await Promise.all([
      supabase.from('students').select('adm_no, name, class_name'),
      supabase.from('staff_directory').select('id'),
      supabase.from('attendance').select('adm_no, working_days, attended_days'),
      supabase.from('donations').select('expected_amount, paid_amount'),
      supabase.from('activity_points').select('adm_no, points')
    ]);

    const stList = students || [];
    const classCounts = {};
    stList.forEach(s => {
      const c = s.class_name || 'Unassigned';
      classCounts[c] = (classCounts[c] || 0) + 1;
    });

    // Attendance Average
    const totalW = (attendance || []).reduce((a, b) => a + (Number(b.working_days) || 0), 0);
    const totalP = (attendance || []).reduce((a, b) => a + (Number(b.attended_days) || 0), 0);
    const avgAtt = totalW > 0 ? ((totalP / totalW) * 100).toFixed(1) : '0.0';

    // Finance Totals
    const totalExp = (donations || []).reduce((a, b) => a + (Number(b.expected_amount) || 0), 0);
    const totalPaid = (donations || []).reduce((a, b) => a + (Number(b.paid_amount) || 0), 0);

    // Top 5 Activity Students
    const ptMap = {};
    (points || []).forEach(p => { ptMap[p.adm_no] = (ptMap[p.adm_no] || 0) + (Number(p.points) || 0); });
    const topStudents = stList
      .map(s => ({ ...s, net: ptMap[s.adm_no] || 0 }))
      .filter(s => s.net > 0)
      .sort((a, b) => b.net - a.net)
      .slice(0, 5);

    setSummary({
      totalStudents: stList.length,
      totalStaff: (staff || []).length,
      classCounts: Object.entries(classCounts).sort(),
      avgAtt,
      totalExp,
      totalPaid,
      totalPending: Math.max(0, totalExp - totalPaid),
      topStudents
    });
    setLoading(false);
  }

  function downloadPDF() {
    const el = document.getElementById('nhia-campus-report');
    if (!el) return;
    html2pdf().set({
      margin: 10,
      filename: `NHIA_Campus_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Campus Reports</h2>
        </div>

        {summary && (
          <button onClick={downloadPDF} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            <Download size={15} /> PDF
          </button>
        )}
      </div>

      {loading || !summary ? (
        <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>റിപ്പോർട്ട് തയ്യാറാക്കുന്നു...</p>
      ) : (
        <div id="nhia-campus-report" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* OVERVIEW CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2e44d2', fontSize: 12, fontWeight: 700 }}><Users size={15} /> Total Students</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{summary.totalStudents}</div>
            </div>
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a', fontSize: 12, fontWeight: 700 }}><Calendar size={15} /> Avg Attendance</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{summary.avgAtt}%</div>
            </div>
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontSize: 12, fontWeight: 700 }}><Wallet size={15} /> Fee Collected</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#16a34a' }}>₹{summary.totalPaid}</div>
            </div>
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 12, fontWeight: 700 }}><BarChart3 size={15} /> Fee Pending</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#dc2626' }}>₹{summary.totalPending}</div>
            </div>
          </div>

          {/* CLASS-WISE STRENGTH */}
          <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
            <h4 style={{ marginBottom: 10, fontSize: 14 }}>Class-wise Student Strength</h4>
            {summary.classCounts.length === 0 ? <p style={{ fontSize: 12, color: '#94a3b8' }}>ഡാറ്റയില്ല</p> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {summary.classCounts.map(([cls, cnt]) => (
                  <div key={cls} style={{ background: '#f8fafc', padding: '10px 8px', borderRadius: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{cls}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#2e44d2' }}>{cnt}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TOP ACTIVITY STUDENTS */}
          <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
            <h4 style={{ marginBottom: 10, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Trophy size={16} color="#d97706" /> Top Activity Performers</h4>
            {summary.topStudents.length === 0 ? <p style={{ fontSize: 12, color: '#94a3b8' }}>പോയിന്റുകളൊന്നും രേഖപ്പെടുത്തിയിട്ടില്ല.</p> : summary.topStudents.map((s, idx) => (
              <div key={s.adm_no} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span><b>#{idx + 1} {s.name}</b> ({s.class_name})</span>
                <b style={{ color: '#16a34a' }}>+{s.net} pts</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}