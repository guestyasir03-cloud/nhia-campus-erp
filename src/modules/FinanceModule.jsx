import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Save, Download, Image as ImageIcon,
  FileSpreadsheet, Copy, Wallet
} from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const ACADEMIC_YEAR = '2026-27';

export default function FinanceModule({ onBack, user }) {
  const isStudent = user?.role === 'student';
  const [tab, setTab] = useState('ledger'); // ledger | parent_report | admin_report
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Ledger State
  const [students, setStudents] = useState([]);
  const [amountMap, setAmountMap] = useState({}); // { adm_no: monthly_donation }
  const [paidMap, setPaidMap] = useState({}); // { adm_no: Set(['Apr', 'May']) }
  const [initialPaidMap, setInitialPaidMap] = useState({});

  // Admin Campus Summary State
  const [campusReport, setCampusReport] = useState(null);

  // Student Self-View State
  const [myData, setMyData] = useState(null);

  useEffect(() => {
    if (isStudent && user?.id) {
      loadStudentSelfView(user.id);
    } else {
      loadClasses();
    }
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    if (data) {
      setClasses([...new Set(data.map(d => d.class_name).filter(Boolean))].filter(c => c !== 'ALUMNI').sort());
    }
  }

  async function loadStudentSelfView(admNo) {
    setLoading(true);
    const [{ data: st }, { data: pay }] = await Promise.all([
      supabase.from('students').select('adm_no, name, class_name, monthly_donation').eq('adm_no', admNo).maybeSingle(),
      supabase.from('donation_payments').select('*').eq('adm_no', admNo).eq('academic_year', ACADEMIC_YEAR)
    ]);

    const paidSet = new Set((pay || []).map(p => p.month_code));
    const totalPaid = (pay || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    setMyData({
      student: st,
      paidSet,
      totalPaid,
      lastPaid: getLastPaidMonth(paidSet)
    });
    setLoading(false);
  }

  async function loadClassLedger(cls) {
    setSelectedClass(cls);
    setMsg('');
    if (!cls) {
      setStudents([]);
      return;
    }
    setLoading(true);

    const [{ data: stData }, { data: payData }] = await Promise.all([
      supabase
        .from('students')
        .select('adm_no, name, roll_no, monthly_donation')
        .eq('class_name', cls)
        .order('roll_no', { ascending: true, nullsFirst: false })
        .order('name'),
      supabase
        .from('donation_payments')
        .select('adm_no, month_code, amount')
        .eq('class_name', cls)
        .eq('academic_year', ACADEMIC_YEAR)
    ]);

    const aMap = {};
    const pMap = {};
    const initPMap = {};

    (stData || []).forEach(s => {
      aMap[s.adm_no] = s.monthly_donation ?? 0;
      pMap[s.adm_no] = new Set();
      initPMap[s.adm_no] = new Set();
    });

    (payData || []).forEach(p => {
      if (pMap[p.adm_no]) {
        pMap[p.adm_no].add(p.month_code);
        initPMap[p.adm_no].add(p.month_code);
      }
    });

    setStudents(stData || []);
    setAmountMap(aMap);
    setPaidMap(pMap);
    setInitialPaidMap(initPMap);
    setLoading(false);
  }

  function toggleMonth(admNo, mCode) {
    setPaidMap(prev => {
      const next = new Set(prev[admNo] || []);
      if (next.has(mCode)) next.delete(mCode);
      else next.add(mCode);
      return { ...prev, [admNo]: next };
    });
  }

  function getLastPaidMonth(paidSet) {
    if (!paidSet || paidSet.size === 0) return 'Not Paid';
    for (let i = MONTHS.length - 1; i >= 0; i--) {
      if (paidSet.has(MONTHS[i])) return MONTHS[i];
    }
    return 'Not Paid';
  }

  async function saveClassLedger() {
    if (students.length === 0) return;
    setLoading(true);
    setMsg('');

    try {
      // 1. Batch update custom monthly amounts on students table
      const studentUpdates = students.map(s => ({
        adm_no: s.adm_no,
        name: s.name,
        class_name: selectedClass,
        monthly_donation: Number(amountMap[s.adm_no]) || 0
      }));

      // 2. Prepare payment upserts & deletes
      const toUpsert = [];
      const toDelete = [];

      students.forEach(s => {
        const amt = Number(amountMap[s.adm_no]) || 0;
        const currSet = paidMap[s.adm_no] || new Set();
        const origSet = initialPaidMap[s.adm_no] || new Set();

        currSet.forEach(m => {
          toUpsert.push({
            adm_no: s.adm_no,
            class_name: selectedClass,
            academic_year: ACADEMIC_YEAR,
            month_code: m,
            amount: amt,
            recorded_by: user?.name || 'Admin'
          });
        });

        origSet.forEach(m => {
          if (!currSet.has(m)) {
            toDelete.push({ adm_no: s.adm_no, month_code: m });
          }
        });
      });

      const ops = [supabase.from('students').upsert(studentUpdates, { onConflict: 'adm_no' })];
      if (toUpsert.length > 0) {
        ops.push(supabase.from('donation_payments').upsert(toUpsert, { onConflict: 'adm_no,academic_year,month_code' }));
      }
      await Promise.all(ops);

      // Delete unchecked payments if any
      for (const del of toDelete) {
        await supabase
          .from('donation_payments')
          .delete()
          .eq('adm_no', del.adm_no)
          .eq('academic_year', ACADEMIC_YEAR)
          .eq('month_code', del.month_code);
      }

      // Sync initialPaidMap
      const synced = {};
      Object.keys(paidMap).forEach(k => { synced[k] = new Set(paidMap[k]); });
      setInitialPaidMap(synced);

      setMsg(`Monthly donation ledger saved for ${selectedClass}.`);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Generate Campus-wide Financial Summary
  async function generateCampusSummary() {
    setLoading(true);
    const [{ data: stData }, { data: payData }] = await Promise.all([
      supabase.from('students').select('adm_no, class_name, monthly_donation').neq('class_name', 'ALUMNI'),
      supabase.from('donation_payments').select('class_name, amount, month_code').eq('academic_year', ACADEMIC_YEAR)
    ]);

    const clsMap = {};
    (stData || []).forEach(s => {
      if (!s.class_name) return;
      if (!clsMap[s.class_name]) {
        clsMap[s.class_name] = { className: s.class_name, students: 0, monthlyTarget: 0, totalCollected: 0, paymentsCount: 0 };
      }
      clsMap[s.class_name].students += 1;
      clsMap[s.class_name].monthlyTarget += Number(s.monthly_donation) || 0;
    });

    (payData || []).forEach(p => {
      if (!clsMap[p.class_name]) return;
      clsMap[p.class_name].totalCollected += Number(p.amount) || 0;
      clsMap[p.class_name].paymentsCount += 1;
    });

    const rows = Object.values(clsMap).sort((a, b) => a.className.localeCompare(b.className));
    const grandTarget = rows.reduce((s, r) => s + r.monthlyTarget, 0);
    const grandCollected = rows.reduce((s, r) => s + r.totalCollected, 0);

    setCampusReport({ rows, grandTarget, grandCollected });
    setLoading(false);
  }

  // Export Helpers
  function downloadCSV(filename, headers, rows) {
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPDF(elId, filename, landscape = false) {
    const el = document.getElementById(elId);
    if (!el) return;
    html2pdf().set({
      margin: 8, filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' }
    }).from(el).save();
  }

  async function downloadJPEG(elId, filename) {
    const el = document.getElementById(elId);
    if (!el) return;
    try {
      const worker = html2pdf().set({
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }
      }).from(el);
      const canvas = await worker.toCanvas().get('canvas');
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (err) {
      alert('JPEG export error: ' + err.message);
    }
  }

  function copyParentWhatsApp() {
    let text = `NOORUL HIDAYA ISLAMIC ACADEMY\n`;
    text += `Monthly Donation Status — Class ${selectedClass} (${ACADEMIC_YEAR})\n\n`;
    students.forEach((s, i) => {
      const last = getLastPaidMonth(paidMap[s.adm_no]);
      text += `${i + 1}. ${s.name} (${s.adm_no}) — Last Paid: ${last}\n`;
    });
    navigator.clipboard.writeText(text);
    setMsg('Parent report copied to clipboard.');
  }

  const ExportBar = ({ onPDF, onJPEG, onExcel }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      <button onClick={onPDF} style={{ padding: '11px 6px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <Download size={14} /> PDF
      </button>
      <button onClick={onJPEG} style={{ padding: '11px 6px', borderRadius: 10, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <ImageIcon size={14} /> JPEG
      </button>
      <button onClick={onExcel} style={{ padding: '11px 6px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <FileSpreadsheet size={14} /> Excel
      </button>
    </div>
  );

  // ==========================================
  // STUDENT / PARENT SELF-VIEW
  // ==========================================
  if (isStudent) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Monthly Donation</h2>
        </div>

        {loading || !myData ? (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{myData.student?.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                Adm No: {myData.student?.adm_no} • Class: {myData.student?.class_name}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ background: '#f8fafc', padding: 10, borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Monthly</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>₹{myData.student?.monthly_donation || 0}</div>
                </div>
                <div style={{ background: '#ecfdf5', padding: 10, borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#047857' }}>Total Paid</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#047857' }}>₹{myData.totalPaid}</div>
                </div>
                <div style={{ background: '#eff6ff', padding: 10, borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#1d4ed8' }}>Last Paid</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1d4ed8' }}>{myData.lastPaid}</div>
                </div>
              </div>
            </div>

            <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
                Payment Status ({ACADEMIC_YEAR})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {MONTHS.map(m => {
                  const paid = myData.paidSet.has(m);
                  return (
                    <div
                      key={m}
                      style={{
                        padding: '10px 4px', borderRadius: 10, textAlign: 'center', fontWeight: 700, fontSize: 12,
                        background: paid ? '#dcfce7' : '#f1f5f9',
                        color: paid ? '#15803d' : '#64748b',
                        border: paid ? '1px solid #86efac' : '1px solid #e2e8f0'
                      }}
                    >
                      {m}
                      <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2 }}>{paid ? 'Paid' : 'Pending'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // ADMIN / STAFF VIEW
  // ==========================================
  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Finance & Donations</h2>
      </div>

      {/* TOP TABS */}
      <div style={{ display: 'flex', background: '#e2e8f0', padding: 4, borderRadius: 14, marginBottom: 14, gap: 4 }}>
        {[
          { id: 'ledger', label: 'Monthly Ledger' },
          { id: 'parent_report', label: 'Parent Report' },
          { id: 'admin_report', label: 'Financial Report' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setMsg(''); }}
            style={{
              flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#2e44d2' : '#475569'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ background: '#eff6ff', color: '#1e40af', padding: 11, borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* CLASS SELECTOR (For Ledger & Parent Report) */}
      {(tab === 'ledger' || tab === 'parent_report') && (
        <div style={{ marginBottom: 12 }}>
          <select
            value={selectedClass}
            onChange={e => loadClassLedger(e.target.value)}
            style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, fontSize: 13 }}
          >
            <option value="">Select Class</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 1: MONTHLY DONATION LEDGER (APR-MAR)          */}
      {/* ================================================= */}
      {tab === 'ledger' && students.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {students.map((s, idx) => {
            const pSet = paidMap[s.adm_no] || new Set();
            const amt = amountMap[s.adm_no] ?? 0;
            return (
              <div key={s.adm_no} style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{idx + 1}. {s.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      Adm: {s.adm_no} • Last Paid: <b style={{ color: '#2e44d2' }}>{getLastPaidMonth(pSet)}</b>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>₹</span>
                    <input
                      type="number"
                      value={amt}
                      onChange={e => setAmountMap(prev => ({ ...prev, [s.adm_no]: e.target.value }))}
                      style={{ width: 72, padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700, fontSize: 13, textAlign: 'right' }}
                    />
                  </div>
                </div>

                {/* APR - MAR CHIPS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
                  {MONTHS.map(m => {
                    const paid = pSet.has(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMonth(s.adm_no, m)}
                        style={{
                          padding: '6px 2px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          border: paid ? '1px solid #16a34a' : '1px solid #e2e8f0',
                          background: paid ? '#16a34a' : '#f8fafc',
                          color: paid ? '#fff' : '#64748b'
                        }}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <button
            onClick={saveClassLedger}
            disabled={loading}
            style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Save size={16} /> {loading ? 'Saving...' : 'Save Monthly Ledger'}
          </button>
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 2: PARENT REPORT (PRIVACY-SAFE: NO AMOUNTS)   */}
      {/* ================================================= */}
      {tab === 'parent_report' && students.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div id="nhia-parent-donation-report" style={{ background: '#fff', borderRadius: 14, border: '1px solid #cbd5e1', padding: 14 }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #1e293b', paddingBottom: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>NOORUL HIDAYA ISLAMIC ACADEMY</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#2e44d2', marginTop: 2 }}>
                Monthly Donation Status — Class {selectedClass} ({ACADEMIC_YEAR})
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: '#1e293b', color: '#fff' }}>
                <tr>
                  <th style={{ padding: 8, textAlign: 'center', border: '1px solid #334155' }}>Sl</th>
                  <th style={{ padding: 8, textAlign: 'center', border: '1px solid #334155' }}>Adm No</th>
                  <th style={{ padding: 8, textAlign: 'left', border: '1px solid #334155' }}>Student Name</th>
                  <th style={{ padding: 8, textAlign: 'center', border: '1px solid #334155' }}>Last Paid Month</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const last = getLastPaidMonth(paidMap[s.adm_no]);
                  return (
                    <tr key={s.adm_no}>
                      <td style={{ padding: 8, textAlign: 'center', border: '1px solid #e2e8f0', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: 8, textAlign: 'center', border: '1px solid #e2e8f0', color: '#475569' }}>{s.adm_no}</td>
                      <td style={{ padding: 8, fontWeight: 700, border: '1px solid #e2e8f0' }}>{s.name}</td>
                      <td style={{ padding: 8, textAlign: 'center', fontWeight: 800, border: '1px solid #e2e8f0', color: last === 'Not Paid' ? '#dc2626' : '#16a34a' }}>
                        {last}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button onClick={copyParentWhatsApp} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Copy size={14} /> Copy for WhatsApp
          </button>

          <ExportBar
            onPDF={() => downloadPDF('nhia-parent-donation-report', `Donation_Status_${selectedClass}.pdf`)}
            onJPEG={() => downloadJPEG('nhia-parent-donation-report', `Donation_Status_${selectedClass}.jpg`)}
            onExcel={() => downloadCSV(
              `Donation_Status_${selectedClass}.csv`,
              ['Sl No', 'Adm No', 'Student Name', 'Last Paid Month'],
              students.map((s, i) => [i + 1, s.adm_no, s.name, getLastPaidMonth(paidMap[s.adm_no])])
            )}
          />
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 3: ADMIN FINANCIAL REPORT (FULL DETAILS)      */}
      {/* ================================================= */}
      {tab === 'admin_report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Class-wise Detailed Financial Report */}
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Class Financial Report</div>
            <select value={selectedClass} onChange={e => loadClassLedger(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}>
              <option value="">Select Class</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {selectedClass && students.length > 0 && (
            <>
              <div id="nhia-admin-class-finance" style={{ background: '#fff', borderRadius: 14, border: '1px solid #cbd5e1', padding: 14, overflowX: 'auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 10, borderBottom: '2px solid #1e293b', paddingBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>FINANCIAL COLLECTION REPORT — {selectedClass}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Academic Year {ACADEMIC_YEAR}</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                  <thead style={{ background: '#1e293b', color: '#fff' }}>
                    <tr>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Adm</th>
                      <th style={{ padding: 7, border: '1px solid #334155', textAlign: 'left' }}>Name</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Monthly (₹)</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Months Paid</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Total Paid (₹)</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Last Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => {
                      const amt = Number(amountMap[s.adm_no]) || 0;
                      const pSet = paidMap[s.adm_no] || new Set();
                      const tot = amt * pSet.size;
                      return (
                        <tr key={s.adm_no}>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center' }}>{s.adm_no}</td>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', fontWeight: 700 }}>{s.name}</td>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'right' }}>₹{amt}</td>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center' }}>{pSet.size} / 12</td>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>₹{tot}</td>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700 }}>{getLastPaidMonth(pSet)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ExportBar
                onPDF={() => downloadPDF('nhia-admin-class-finance', `Finance_Report_${selectedClass}.pdf`, true)}
                onJPEG={() => downloadJPEG('nhia-admin-class-finance', `Finance_Report_${selectedClass}.jpg`)}
                onExcel={() => downloadCSV(
                  `Finance_Report_${selectedClass}.csv`,
                  ['Adm No', 'Name', 'Monthly Amount', 'Months Paid', 'Total Collected', 'Last Paid Month'],
                  students.map(s => {
                    const amt = Number(amountMap[s.adm_no]) || 0;
                    const pSet = paidMap[s.adm_no] || new Set();
                    return [s.adm_no, s.name, amt, pSet.size, amt * pSet.size, getLastPaidMonth(pSet)];
                  })
                )}
              />
            </>
          )}

          {/* Campus-wide Summary */}
          <button
            onClick={generateCampusSummary}
            disabled={loading}
            style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}
          >
            <Wallet size={15} /> {loading ? 'Generating...' : 'Generate Campus-Wide Financial Summary'}
          </button>

          {campusReport && (
            <>
              <div id="nhia-campus-finance" style={{ background: '#fff', borderRadius: 14, border: '1px solid #cbd5e1', padding: 14 }}>
                <div style={{ textAlign: 'center', marginBottom: 10, borderBottom: '2px solid #1e293b', paddingBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>CAMPUS FINANCIAL SUMMARY ({ACADEMIC_YEAR})</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'left' }}>Class</th>
                      <th style={{ padding: 7, border: '1px solid #cbd5e1' }}>Students</th>
                      <th style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'right' }}>Monthly Target</th>
                      <th style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'right' }}>Total Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campusReport.rows.map(r => (
                      <tr key={r.className}>
                        <td style={{ padding: 7, border: '1px solid #cbd5e1', fontWeight: 700 }}>{r.className}</td>
                        <td style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'center' }}>{r.students}</td>
                        <td style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'right' }}>₹{r.monthlyTarget}</td>
                        <td style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>₹{r.totalCollected}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#eef2ff', fontWeight: 800 }}>
                      <td colSpan={2} style={{ padding: 8, border: '1px solid #cbd5e1' }}>GRAND TOTAL</td>
                      <td style={{ padding: 8, border: '1px solid #cbd5e1', textAlign: 'right' }}>₹{campusReport.grandTarget}</td>
                      <td style={{ padding: 8, border: '1px solid #cbd5e1', textAlign: 'right', color: '#2e44d2' }}>₹{campusReport.grandCollected}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <ExportBar
                onPDF={() => downloadPDF('nhia-campus-finance', `Campus_Finance_Summary_${ACADEMIC_YEAR}.pdf`)}
                onJPEG={() => downloadJPEG('nhia-campus-finance', `Campus_Finance_Summary_${ACADEMIC_YEAR}.jpg`)}
                onExcel={() => downloadCSV(
                  `Campus_Finance_Summary_${ACADEMIC_YEAR}.csv`,
                  ['Class', 'Students', 'Monthly Target', 'Total Collected'],
                  campusReport.rows.map(r => [r.className, r.students, r.monthlyTarget, r.totalCollected])
                )}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}