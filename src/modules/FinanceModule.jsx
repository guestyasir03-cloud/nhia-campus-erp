import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Save, Download, Image as ImageIcon,
  FileSpreadsheet, Copy, Wallet, Plus
} from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';
import { useClassAccess } from '../lib/useClassAccess';
import { exportReportPDF, exportReportJPEG } from '../lib/exportReport';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getCurrentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatYM(ym) {
  if (!ym || !ym.includes('-')) return 'Not Set';
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return 'Not Set';
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function addOneMonth(ym) {
  const base = ym && ym.includes('-') ? ym : getCurrentYM();
  let [y, m] = base.split('-').map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function getPendingMonths(lastPaidYM, refYM = getCurrentYM()) {
  if (!lastPaidYM || !lastPaidYM.includes('-')) return null;
  const [y1, m1] = lastPaidYM.split('-').map(Number);
  const [y2, m2] = refYM.split('-').map(Number);
  const diff = (y2 - y1) * 12 + (m2 - m1);
  return Math.max(0, diff);
}

export default function FinanceModule({ onBack, user }) {
  const isStudent = user?.role === 'student';
  const { isAdmin, allowedClasses: classes, isClassTeacher, loading: accessLoading } = useClassAccess(user);

  const [tab, setTab] = useState('ledger');
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const [students, setStudents] = useState([]);
  const [amountMap, setAmountMap] = useState({});
  const [lastPaidMap, setLastPaidMap] = useState({});
  const [campusReport, setCampusReport] = useState(null);
  const [myData, setMyData] = useState(null);

  const currentYM = getCurrentYM();

  useEffect(() => {
    if (isStudent && user?.id) {
      loadStudentSelfView(user.id);
    }
  }, []);

  async function loadStudentSelfView(admNo) {
    setLoading(true);
    const [{ data: st }, { data: recs }] = await Promise.all([
      supabase.from('students').select('adm_no, name, class_name, monthly_donation, last_paid_month').eq('adm_no', admNo).maybeSingle(),
      supabase.from('donation_receipts').select('*').gt('amount', 0).eq('adm_no', admNo).order('created_at', { ascending: false }).limit(12)
    ]);

    const pendingMo = getPendingMonths(st?.last_paid_month, currentYM);
    const monthlyAmt = Number(st?.monthly_donation) || 0;
    setMyData({
      student: st,
      pendingMo,
      pendingAmt: pendingMo !== null ? pendingMo * monthlyAmt : 0,
      receipts: recs || []
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
    const { data } = await supabase
      .from('students')
      .select('adm_no, name, roll_no, monthly_donation, last_paid_month')
      .eq('class_name', cls)
      .order('roll_no', { ascending: true, nullsFirst: false })
      .order('name');

    const aMap = {};
    const lpMap = {};
    (data || []).forEach(s => {
      aMap[s.adm_no] = s.monthly_donation ?? 0;
      lpMap[s.adm_no] = s.last_paid_month || '';
    });

    setStudents(data || []);
    setAmountMap(aMap);
    setLastPaidMap(lpMap);
    setLoading(false);
  }

  async function handleQuickPayOneMonth(s) {
    const amt = Number(amountMap[s.adm_no]) || 0;
    if (amt <= 0) {
      return alert(`First set the Monthly Donation amount (> ₹0) for ${s.name}, then use +1 Mo.`);
    }
    const currentLP = lastPaidMap[s.adm_no];
    if (!currentLP) {
      return alert(`First set the Last Paid Month for ${s.name}, then use +1 Mo.`);
    }
    const nextYM = addOneMonth(currentLP);

    setLastPaidMap(prev => ({ ...prev, [s.adm_no]: nextYM }));
    setMsg(`Recorded ${formatYM(nextYM)} (₹${amt}) for ${s.name}.`);

    await Promise.all([
      supabase.from('students').update({ last_paid_month: nextYM, monthly_donation: amt }).eq('adm_no', s.adm_no),
      supabase.from('donation_receipts').insert({
        adm_no: s.adm_no,
        class_name: selectedClass,
        month_paid: nextYM,
        amount: amt,
        recorded_by: user?.name || 'Admin'
      })
    ]);
  }

  async function saveClassSetup() {
    if (students.length === 0) return;
    setLoading(true);
    setMsg('');

    const updates = students.map(s => ({
      adm_no: s.adm_no,
      name: s.name,
      class_name: selectedClass,
      monthly_donation: Number(amountMap[s.adm_no]) || 0,
      last_paid_month: lastPaidMap[s.adm_no] || null
    }));

    const { error } = await supabase.from('students').upsert(updates, { onConflict: 'adm_no' });
    if (!error) {
      // Clean up ₹0 receipts and any receipts newer than each student's Last Paid Month
      await supabase.from('donation_receipts').delete().eq('class_name', selectedClass).lte('amount', 0);
      await Promise.all(
        updates
          .filter(u => u.last_paid_month)
          .map(u =>
            supabase
              .from('donation_receipts')
              .delete()
              .eq('adm_no', u.adm_no)
              .gt('month_paid', u.last_paid_month)
          )
      );

      // Auto-create receipt for the saved Last Paid Month if not already present
      const { data: existingRecs } = await supabase
        .from('donation_receipts')
        .select('adm_no, month_paid')
        .gt('amount', 0)
        .eq('class_name', selectedClass);

      const existingSet = new Set((existingRecs || []).map(r => `${r.adm_no}_${r.month_paid}`));
      const newReceipts = updates
        .filter(u => u.last_paid_month && u.monthly_donation > 0 && !existingSet.has(`${u.adm_no}_${u.last_paid_month}`))
        .map(u => ({
          adm_no: u.adm_no,
          class_name: selectedClass,
          month_paid: u.last_paid_month,
          amount: u.monthly_donation,
          recorded_by: user?.name || 'Admin'
        }));

      if (newReceipts.length > 0) {
        await supabase.from('donation_receipts').insert(newReceipts);
      }
    }
    setLoading(false);
    if (error) setMsg('Error: ' + error.message);
    else setMsg(`Saved & synced monthly amounts and payment history for ${selectedClass}.`);
  }

  async function generateCampusSummary() {
    setLoading(true);
    const [{ data: stData }, { data: recData }] = await Promise.all([
      supabase.from('students').select('adm_no, class_name, monthly_donation, last_paid_month').neq('class_name', 'ALUMNI'),
      supabase.from('donation_receipts').select('class_name, amount').gt('amount', 0)
    ]);

    const clsMap = {};
    (stData || []).forEach(s => {
      if (!s.class_name) return;
      if (!clsMap[s.class_name]) {
        clsMap[s.class_name] = { className: s.class_name, students: 0, monthlyTarget: 0, totalPending: 0, totalCollected: 0 };
      }
      const amt = Number(s.monthly_donation) || 0;
      const pendMo = getPendingMonths(s.last_paid_month, currentYM) || 0;
      clsMap[s.class_name].students += 1;
      clsMap[s.class_name].monthlyTarget += amt;
      clsMap[s.class_name].totalPending += pendMo * amt;
    });

    (recData || []).forEach(r => {
      if (clsMap[r.class_name]) {
        clsMap[r.class_name].totalCollected += Number(r.amount) || 0;
      }
    });

    const rows = Object.values(clsMap).sort((a, b) => a.className.localeCompare(b.className));
    setCampusReport({
      rows,
      grandTarget: rows.reduce((s, r) => s + r.monthlyTarget, 0),
      grandPending: rows.reduce((s, r) => s + r.totalPending, 0),
      grandCollected: rows.reduce((s, r) => s + r.totalCollected, 0)
    });
    setLoading(false);
  }

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

 function downloadPDF(elId, filename, landscape = null) {
    exportReportPDF(elId, filename, landscape);
  }

  function downloadJPEG(elId, filename, landscape = null) {
    exportReportJPEG(elId, filename, landscape);
  }

  function copyParentWhatsApp() {
    let text = `NOORUL HIDAYA ISLAMIC ACADEMY\n`;
    text += `Monthly Donation Status — Class ${selectedClass}\n`;
    text += `As of ${formatYM(currentYM)}\n\n`;
    students.forEach((s, i) => {
      const lp = formatYM(lastPaidMap[s.adm_no]);
      const pm = getPendingMonths(lastPaidMap[s.adm_no], currentYM);
      const pText = pm === null ? '' : pm === 0 ? ' (Up to date)' : ` (${pm} mo pending)`;
      text += `${i + 1}. ${s.name} (${s.adm_no}) — Last Paid: ${lp}${pText}\n`;
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

  // STUDENT SELF-VIEW
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
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{myData.student?.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                Adm No: {myData.student?.adm_no} • Class: {myData.student?.class_name}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Monthly Donation</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>₹{myData.student?.monthly_donation || 0}</div>
                </div>
                <div style={{ background: '#eff6ff', padding: 12, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#1d4ed8' }}>Last Paid Month</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8', marginTop: 2 }}>{formatYM(myData.student?.last_paid_month)}</div>
                </div>
                <div style={{ background: myData.pendingMo > 0 ? '#fef2f2' : '#ecfdf5', padding: 12, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: myData.pendingMo > 0 ? '#dc2626' : '#047857' }}>Pending Months</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: myData.pendingMo > 0 ? '#dc2626' : '#047857', marginTop: 2 }}>
                    {myData.pendingMo === null ? 'Not Set' : myData.pendingMo === 0 ? 'Up to date' : `${myData.pendingMo} Months`}
                  </div>
                </div>
                <div style={{ background: myData.pendingAmt > 0 ? '#fef2f2' : '#ecfdf5', padding: 12, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: myData.pendingAmt > 0 ? '#dc2626' : '#047857' }}>Pending Balance</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: myData.pendingAmt > 0 ? '#dc2626' : '#047857', marginTop: 2 }}>₹{myData.pendingAmt}</div>
                </div>
              </div>
            </div>

            {myData.receipts.length > 0 && (
              <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#334155', marginBottom: 10 }}>Recent Payments</div>
                {myData.receipts.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{formatYM(r.month_paid)}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Date: {r.paid_date}</div>
                    </div>
                    <div style={{ fontWeight: 800, color: '#16a34a' }}>₹{r.amount}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // LOCK FOR NON-CLASS TEACHERS
  if (!accessLoading && !isClassTeacher) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Finance & Donations</h2>
        </div>
        <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b', fontSize: 13, fontWeight: 600 }}>
          Finance ledger access is restricted to assigned Class Teachers. Contact admin.
        </div>
      </div>
    );
  }

  // ADMIN / CLASS TEACHER VIEW
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Finance & Donations</h2>
      </div>

      {/* TOP TABS (Financial Report only for Admin) */}
      <div style={{ display: 'flex', background: '#e2e8f0', padding: 4, borderRadius: 14, marginBottom: 14, gap: 4 }}>
        {[
          { id: 'ledger', label: 'Donation Ledger' },
          { id: 'parent_report', label: 'Parent Report' },
          ...(isAdmin ? [{ id: 'admin_report', label: 'Financial Report' }] : [])
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

      {/* TAB 1: DONATION LEDGER */}
      {tab === 'ledger' && students.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {students.map((s, idx) => {
            const lp = lastPaidMap[s.adm_no] || '';
            const pm = getPendingMonths(lp, currentYM);
            const amt = amountMap[s.adm_no] ?? 0;

            return (
              <div key={s.adm_no} style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{idx + 1}. {s.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Adm: {s.adm_no}</div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: '4px 8px', borderRadius: 8,
                    background: pm === null ? '#f1f5f9' : pm === 0 ? '#dcfce7' : '#fee2e2',
                    color: pm === null ? '#64748b' : pm === 0 ? '#15803d' : '#dc2626'
                  }}>
                    {pm === null ? 'Not Set' : pm === 0 ? 'Up to date' : `${pm} Mo Pending`}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.4fr 0.8fr', gap: 6, alignItems: 'center' }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Monthly (₹)</label>
                    <input
                      type="number"
                      value={amt}
                      onChange={e => setAmountMap(prev => ({ ...prev, [s.adm_no]: e.target.value }))}
                      style={{ width: '100%', padding: 7, borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700, fontSize: 12, marginTop: 2 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Last Paid Month</label>
                    <input
                      type="month"
                      value={lp}
                      onChange={e => setLastPaidMap(prev => ({ ...prev, [s.adm_no]: e.target.value }))}
                      style={{ width: '100%', padding: 6, borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 600, fontSize: 12, marginTop: 2 }}
                    />
                  </div>
                  <div style={{ paddingTop: 14 }}>
                    <button
                      type="button"
                      onClick={() => handleQuickPayOneMonth(s)}
                      style={{ width: '100%', padding: '8px 4px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}
                    >
                      <Plus size={13} /> 1 Mo
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={saveClassSetup}
            disabled={loading}
            style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Save size={16} /> {loading ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      )}

      {/* TAB 2: PARENT REPORT */}
      {tab === 'parent_report' && students.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div id="nhia-parent-donation-report" style={{ background: '#fff', borderRadius: 14, border: '1px solid #cbd5e1', padding: 14 }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #1e293b', paddingBottom: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>NOORUL HIDAYA ISLAMIC ACADEMY</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#2e44d2', marginTop: 2 }}>
                Monthly Donation Status — Class {selectedClass} (As of {formatYM(currentYM)})
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: '#1e293b', color: '#fff' }}>
                <tr>
                  <th style={{ padding: 7, textAlign: 'center', border: '1px solid #334155' }}>Sl</th>
                  <th style={{ padding: 7, textAlign: 'center', border: '1px solid #334155' }}>Adm</th>
                  <th style={{ padding: 7, textAlign: 'left', border: '1px solid #334155' }}>Student Name</th>
                  <th style={{ padding: 7, textAlign: 'center', border: '1px solid #334155' }}>Last Paid</th>
                  <th style={{ padding: 7, textAlign: 'center', border: '1px solid #334155' }}>Pending</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const lp = lastPaidMap[s.adm_no];
                  const pm = getPendingMonths(lp, currentYM);
                  return (
                    <tr key={s.adm_no}>
                      <td style={{ padding: 7, textAlign: 'center', border: '1px solid #e2e8f0', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: 7, textAlign: 'center', border: '1px solid #e2e8f0', color: '#475569' }}>{s.adm_no}</td>
                      <td style={{ padding: 7, fontWeight: 700, border: '1px solid #e2e8f0' }}>{s.name}</td>
                      <td style={{ padding: 7, textAlign: 'center', fontWeight: 700, border: '1px solid #e2e8f0', color: '#0f172a' }}>{formatYM(lp)}</td>
                      <td style={{ padding: 7, textAlign: 'center', fontWeight: 800, border: '1px solid #e2e8f0', color: pm > 0 ? '#dc2626' : '#16a34a' }}>
                        {pm === null ? '-' : pm === 0 ? 'Clear' : `${pm} Mo`}
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
              ['Sl No', 'Adm No', 'Student Name', 'Last Paid Month', 'Pending Months'],
              students.map((s, i) => {
                const pm = getPendingMonths(lastPaidMap[s.adm_no], currentYM);
                return [i + 1, s.adm_no, s.name, formatYM(lastPaidMap[s.adm_no]), pm === null ? 'Not Set' : pm];
              })
            )}
          />
        </div>
      )}

      {/* TAB 3: ADMIN FINANCIAL REPORT */}
      {tab === 'admin_report' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Class Arrears & Financial Report</div>
            <select value={selectedClass} onChange={e => loadClassLedger(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}>
              <option value="">Select Class</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {selectedClass && students.length > 0 && (
            <>
              <div id="nhia-admin-class-finance" style={{ background: '#fff', borderRadius: 14, border: '1px solid #cbd5e1', padding: 14, overflowX: 'auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 10, borderBottom: '2px solid #1e293b', paddingBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>FINANCIAL ARREARS REPORT — {selectedClass}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>As of {formatYM(currentYM)}</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                  <thead style={{ background: '#1e293b', color: '#fff' }}>
                    <tr>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Adm</th>
                      <th style={{ padding: 7, border: '1px solid #334155', textAlign: 'left' }}>Name</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Monthly (₹)</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Last Paid</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Pending Mo</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Pending (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => {
                      const amt = Number(amountMap[s.adm_no]) || 0;
                      const lp = lastPaidMap[s.adm_no];
                      const pm = getPendingMonths(lp, currentYM);
                      const pendRs = pm !== null ? pm * amt : 0;
                      return (
                        <tr key={s.adm_no}>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center' }}>{s.adm_no}</td>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', fontWeight: 700 }}>{s.name}</td>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'right' }}>₹{amt}</td>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center' }}>{formatYM(lp)}</td>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700 }}>{pm === null ? '-' : pm}</td>
                          <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 800, color: pendRs > 0 ? '#dc2626' : '#16a34a' }}>₹{pendRs}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ExportBar
                onPDF={() => downloadPDF('nhia-admin-class-finance', `Finance_Arrears_${selectedClass}.pdf`, true)}
                onJPEG={() => downloadJPEG('nhia-admin-class-finance', `Finance_Arrears_${selectedClass}.jpg`)}
                onExcel={() => downloadCSV(
                  `Finance_Arrears_${selectedClass}.csv`,
                  ['Adm No', 'Name', 'Monthly Amount', 'Last Paid Month', 'Pending Months', 'Pending Amount (INR)'],
                  students.map(s => {
                    const amt = Number(amountMap[s.adm_no]) || 0;
                    const pm = getPendingMonths(lastPaidMap[s.adm_no], currentYM);
                    return [s.adm_no, s.name, amt, formatYM(lastPaidMap[s.adm_no]), pm ?? 'Not Set', pm !== null ? pm * amt : 0];
                  })
                )}
              />
            </>
          )}

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
                  <div style={{ fontSize: 14, fontWeight: 900 }}>CAMPUS FINANCIAL SUMMARY ({formatYM(currentYM)})</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'left' }}>Class</th>
                      <th style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'right' }}>Monthly Target</th>
                      <th style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'right' }}>Total Pending</th>
                      <th style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'right' }}>Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campusReport.rows.map(r => (
                      <tr key={r.className}>
                        <td style={{ padding: 7, border: '1px solid #cbd5e1', fontWeight: 700 }}>{r.className} ({r.students})</td>
                        <td style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'right' }}>₹{r.monthlyTarget}</td>
                        <td style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>₹{r.totalPending}</td>
                        <td style={{ padding: 7, border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>₹{r.totalCollected}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#eef2ff', fontWeight: 800 }}>
                      <td style={{ padding: 8, border: '1px solid #cbd5e1' }}>GRAND TOTAL</td>
                      <td style={{ padding: 8, border: '1px solid #cbd5e1', textAlign: 'right' }}>₹{campusReport.grandTarget}</td>
                      <td style={{ padding: 8, border: '1px solid #cbd5e1', textAlign: 'right', color: '#dc2626' }}>₹{campusReport.grandPending}</td>
                      <td style={{ padding: 8, border: '1px solid #cbd5e1', textAlign: 'right', color: '#16a34a' }}>₹{campusReport.grandCollected}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <ExportBar
                onPDF={() => downloadPDF('nhia-campus-finance', `Campus_Finance_Summary.pdf`)}
                onJPEG={() => downloadJPEG('nhia-campus-finance', `Campus_Finance_Summary.jpg`)}
                onExcel={() => downloadCSV(
                  `Campus_Finance_Summary.csv`,
                  ['Class', 'Students', 'Monthly Target', 'Total Pending Arrears', 'Total Collected'],
                  campusReport.rows.map(r => [r.className, r.students, r.monthlyTarget, r.totalPending, r.totalCollected])
                )}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}