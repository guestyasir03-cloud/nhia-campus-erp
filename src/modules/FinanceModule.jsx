import React, { useState, useEffect } from 'react';
import { Wallet, FileSpreadsheet, ChevronLeft, Save, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';

const AC_MONTHS = [
  'Previous Arrears', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

function getMonthsPassedSinceApril() {
  const m = new Date().getMonth(); // 0 = Jan, 3 = Apr
  return m >= 3 ? m - 3 + 1 : m + 9 + 1;
}

export default function FinanceModule({ onBack, user }) {
  const [view, setView] = useState(user?.role === 'student' ? 'student_view' : 'menu');
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [paidMap, setPaidMap] = useState({}); // key: `${adm_no}_${month}` -> paid_amount
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Report & Student View State
  const [reportData, setReportData] = useState(null);
  const [studentFee, setStudentFee] = useState(null);

  useEffect(() => {
    loadClasses();
    if (user?.role === 'student' && user.id) {
      loadStudentFee(user.id);
    }
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    if (data) {
      setClasses([...new Set(data.map(d => d.class_name).filter(Boolean))].sort());
    }
  }

  // സ്റ്റുഡന്റിന് സ്വന്തം ഫീസ്/ഡൊണേഷൻ സ്റ്റാറ്റസ് കാണാൻ
  async function loadStudentFee(admNo) {
    setLoading(true);
    const [{ data: st }, { data: don }] = await Promise.all([
      supabase.from('students').select('*').eq('adm_no', admNo).maybeSingle(),
      supabase.from('donations').select('*').eq('adm_no', admNo)
    ]);

    if (!st) { setLoading(false); return; }

    const saved = {};
    (don || []).forEach(d => { saved[d.month] = { exp: Number(d.expected_amount) || 0, paid: Number(d.paid_amount) || 0 }; });

    const monthsCount = getMonthsPassedSinceApril();
    const monthsToCount = AC_MONTHS.slice(1, 1 + monthsCount);
    const list = [];
    let totalExp = 0, totalPaid = 0;

    // Previous Arrears
    const arrExp = Number(st.prev_arrears) || 0;
    const arrPaid = saved['Previous Arrears']?.paid || 0;
    if (arrExp > 0 || arrPaid > 0) {
      list.push({ month: 'Previous Arrears (കുടിശ്ശിക)', exp: arrExp, paid: arrPaid, bal: arrExp - arrPaid });
      totalExp += arrExp; totalPaid += arrPaid;
    }

    // Monthly
    monthsToCount.forEach(m => {
      const mExp = saved[m] ? saved[m].exp : (Number(st.monthly_pledge) || 0);
      const mPaid = saved[m] ? saved[m].paid : 0;
      list.push({ month: m, exp: mExp, paid: mPaid, bal: mExp - mPaid });
      totalExp += mExp; totalPaid += mPaid;
    });

    setStudentFee({ list, totalExp, totalPaid, pending: totalExp - totalPaid });
    setLoading(false);
  }

  // 1. ക്ലാസ്സ് ലെഡ്ജർ ലോഡ് ചെയ്യുന്നു
  async function loadLedger() {
    if (!selectedClass) return alert('ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക!');
    setLoading(true); setMsg('');
    const [{ data: stData }, { data: donData }] = await Promise.all([
      supabase.from('students').select('*').eq('class_name', selectedClass).order('name'),
      supabase.from('donations').select('*').eq('class_name', selectedClass)
    ]);

    const map = {};
    (donData || []).forEach(d => {
      map[`${d.adm_no}_${d.month}`] = d.paid_amount;
    });

    setStudents(stData || []);
    setPaidMap(map);
    setLoading(false);
  }

  function updatePaid(admNo, mth, val) {
    setPaidMap(prev => ({ ...prev, [`${admNo}_${mth}`]: val }));
  }

  async function saveLedger() {
    setLoading(true); setMsg('');
    const rows = [];

    students.forEach(s => {
      AC_MONTHS.forEach(m => {
        const key = `${s.adm_no}_${m}`;
        const rawVal = paidMap[key];
        if (rawVal === undefined || rawVal === '') return;

        const paid = Number(rawVal) || 0;
        const exp = m === 'Previous Arrears' ? (Number(s.prev_arrears) || 0) : (Number(s.monthly_pledge) || 0);
        if (m === 'Previous Arrears' && exp === 0 && paid === 0) return;

        rows.push({
          adm_no: s.adm_no,
          class_name: selectedClass,
          month: m,
          expected_amount: exp,
          paid_amount: paid,
          balance: exp - paid,
          academic_year: '2026-27'
        });
      });
    });

    if (rows.length === 0) {
      setLoading(false);
      return setMsg('⚠️ സേവ് ചെയ്യാൻ തുകയൊന്നും നൽകിയിട്ടില്ല.');
    }

    const { error } = await supabase.from('donations').upsert(rows, { onConflict: 'adm_no,month,academic_year' });
    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else setMsg(`✅ ${selectedClass} ക്ലാസ്സിലെ ലെഡ്ജർ വിജയകരമായി സേവ് ചെയ്തു!`);
  }

  // 2. ഫിനാൻഷ്യൽ റിപ്പോർട്ട് (Till Date)
  async function generateReport() {
    if (!selectedClass) return alert('ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക!');
    setLoading(true);
    const [{ data: stData }, { data: donData }] = await Promise.all([
      supabase.from('students').select('*').eq('class_name', selectedClass).order('name'),
      supabase.from('donations').select('*').eq('class_name', selectedClass)
    ]);

    const monthsCount = getMonthsPassedSinceApril();
    const monthsToCount = AC_MONTHS.slice(1, 1 + monthsCount);

    const rows = (stData || []).map(s => {
      const mine = (donData || []).filter(d => d.adm_no === s.adm_no);
      const saved = {};
      mine.forEach(d => { saved[d.month] = { exp: Number(d.expected_amount) || 0, paid: Number(d.paid_amount) || 0 }; });

      let totalExp = Number(s.prev_arrears) || 0;
      let totalPaid = 0;
      const paidList = [];

      if (saved['Previous Arrears']?.paid > 0) {
        totalPaid += saved['Previous Arrears'].paid;
        paidList.push(`Arr(₹${saved['Previous Arrears'].paid})`);
      }

      monthsToCount.forEach(m => {
        if (saved[m]) {
          totalExp += saved[m].exp;
          totalPaid += saved[m].paid;
          if (saved[m].paid > 0) paidList.push(`${m.slice(0, 3)}(₹${saved[m].paid})`);
        } else {
          totalExp += Number(s.monthly_pledge) || 0;
        }
      });

      return {
        adm_no: s.adm_no,
        name: s.name,
        totalExp,
        totalPaid,
        pending: totalExp - totalPaid,
        paidMonths: paidList.length > 0 ? paidList.join(', ') : 'None'
      };
    });

    setReportData({ className: selectedClass, rows });
    setLoading(false);
  }

  function downloadCSV() {
    if (!reportData) return;
    const headers = ['Adm No', 'Name', 'Expected (Till Date)', 'Total Paid', 'Total Pending', 'Months Paid'];
    const csvRows = [headers.join(',')];
    reportData.rows.forEach(r => {
      csvRows.push([r.adm_no, `"${r.name}"`, r.totalExp, r.totalPaid, r.pending, `"${r.paidMonths}"`].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `NHIA_${reportData.className}_Finance_Report.csv`;
    a.click();
  }

  const Header = ({ title, backAction }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <button onClick={backAction} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <ChevronLeft size={20} />
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h2>
    </div>
  );

  if (view === 'student_view') {
    return (
      <div>
        <Header title="Fee / Donation Status" backAction={onBack} />
        {loading || !studentFee ? <p style={{ textAlign: 'center', color: '#64748b' }}>ലോഡ് ചെയ്യുന്നു...</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>₹{studentFee.totalExp}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Expected</div>
              </div>
              <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>₹{studentFee.totalPaid}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Paid</div>
              </div>
              <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: studentFee.pending > 0 ? '#dc2626' : '#16a34a' }}>₹{studentFee.pending}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Pending</div>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
              {studentFee.list.map(d => (
                <div key={d.month} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <b>{d.month}</b>
                  <span>Paid: <b style={{ color: '#16a34a' }}>₹{d.paid}</b> / ₹{d.exp}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'menu') {
    return (
      <div>
        <Header title="Finance" backAction={onBack} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { id: 'ledger', label: 'Class ledger & Monthly collection (Apr–Mar)', icon: Wallet },
            { id: 'report', label: 'Financial reports (CSV)', icon: FileSpreadsheet }
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => { setView(item.id); setMsg(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', padding: '14px 16px', borderRadius: 14, border: '1px solid #e2e8f0', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eef2ff', color: '#2e44d2', display: 'grid', placeItems: 'center' }}>
                  <Icon size={18} />
                </div>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={view === 'ledger' ? 'Class Ledger' : 'Financial Report'} backAction={() => setView('menu')} />
      {msg && <div style={{ background: '#eff6ff', color: '#1e40af', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{msg}</div>}

      {/* 1. CLASS LEDGER */}
      {view === 'ledger' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>
              <option value="">-- ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={loadLedger} style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Open
            </button>
          </div>

          {students.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <thead style={{ background: '#fef3c7', color: '#92400e' }}>
                    <tr>
                      <th style={{ padding: 10, textAlign: 'left' }}>Student</th>
                      {AC_MONTHS.map(m => <th key={m} style={{ padding: 8 }}>{m === 'Previous Arrears' ? 'Arr' : m.slice(0, 3)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => (
                      <tr key={s.adm_no} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 8, textAlign: 'left', fontWeight: 600 }}>
                          {s.name}<div style={{ fontSize: 10, color: '#dc2626' }}>Exp: ₹{s.monthly_pledge}</div>
                        </td>
                        {AC_MONTHS.map(m => (
                          <td key={m} style={{ padding: 4 }}>
                            <input
                              type="number"
                              value={paidMap[`${s.adm_no}_${m}`] ?? ''}
                              onChange={e => updatePaid(s.adm_no, m, e.target.value)}
                              style={{ width: 52, padding: 5, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1', background: m === 'Previous Arrears' ? '#fef2f2' : '#fff' }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={saveLedger} disabled={loading} style={{ width: '100%', padding: 14, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Save size={16} /> {loading ? 'Saving...' : 'Save Ledger'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. FINANCIAL REPORT */}
      {view === 'report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>
              <option value="">-- ക്ലാസ്സ് --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={generateReport} style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Generate
            </button>
          </div>

          {reportData && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <thead style={{ background: '#1e293b', color: '#fff' }}>
                    <tr>
                      <th style={{ padding: 8, textAlign: 'left' }}>Name</th>
                      <th style={{ padding: 8 }}>Expected</th>
                      <th style={{ padding: 8 }}>Paid</th>
                      <th style={{ padding: 8 }}>Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map(r => (
                      <tr key={r.adm_no} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: 8, textAlign: 'left', fontWeight: 600 }}>{r.name}</td>
                        <td style={{ padding: 8 }}>₹{r.totalExp}</td>
                        <td style={{ padding: 8, color: '#16a34a', fontWeight: 700 }}>₹{r.totalPaid}</td>
                        <td style={{ padding: 8, color: r.pending > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>₹{r.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={downloadCSV} style={{ width: '100%', marginTop: 12, padding: 11, borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Download size={16} /> Download Excel (CSV)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}