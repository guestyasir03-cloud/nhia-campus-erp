import React, { useState, useEffect } from 'react';
import { Calendar, BarChart3, AlertTriangle, CheckCircle, ChevronLeft, Save, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';

const MONTHS = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

export default function AttendanceModule({ onBack, user }) {
  const [view, setView] = useState(user?.role === 'student' ? 'student_view' : 'menu');
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [month, setMonth] = useState('November');
  const [workingDays, setWorkingDays] = useState('');
  const [students, setStudents] = useState([]);
  const [attMap, setAttMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Reports State
  const [classReport, setClassReport] = useState(null);
  const [campusStats, setCampusStats] = useState(null);
  const [pendingList, setPendingList] = useState(null);
  const [studentAtt, setStudentAtt] = useState(null);

  useEffect(() => {
    loadClasses();
    if (user?.role === 'student' && user.id) {
      loadStudentAttendance(user.id);
    }
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    if (data) {
      setClasses([...new Set(data.map(d => d.class_name).filter(Boolean))].sort());
    }
  }

  // സ്റ്റുഡന്റിന് സ്വന്തം അറ്റൻഡൻസ് കാണാൻ
  async function loadStudentAttendance(admNo) {
    setLoading(true);
    const { data } = await supabase.from('attendance').select('*').eq('adm_no', admNo);
    const list = data || [];
    const totalW = list.reduce((a, b) => a + (Number(b.working_days) || 0), 0);
    const totalP = list.reduce((a, b) => a + (Number(b.attended_days) || 0), 0);
    const perc = totalW > 0 ? ((totalP / totalW) * 100).toFixed(1) : '0.0';
    setStudentAtt({ list, totalW, totalP, leaves: totalW - totalP, perc });
    setLoading(false);
  }

  // 1. പ്രതിമാസ രജിസ്റ്റർ ലോഡ് ചെയ്യുന്നു
  async function loadRegister() {
    if (!selectedClass || !month || !workingDays) {
      return alert('ക്ലാസ്സ്, മാസം, ആകെ പ്രവൃത്തിദിനങ്ങൾ എന്നിവ നൽകുക!');
    }
    setLoading(true); setMsg('');
    const [{ data: stData }, { data: attData }] = await Promise.all([
      supabase.from('students').select('adm_no, name').eq('class_name', selectedClass).order('name'),
      supabase.from('attendance').select('*').eq('class_name', selectedClass).eq('month', month)
    ]);

    const map = {};
    (attData || []).forEach(a => { map[a.adm_no] = a.attended_days; });
    setStudents(stData || []);
    setAttMap(map);
    setLoading(false);
  }

  function updateAtt(admNo, val) {
    if (val !== '' && Number(val) > Number(workingDays)) {
      alert(`ആകെ പ്രവൃത്തിദിനങ്ങളേക്കാൾ (${workingDays}) കൂടുതൽ നൽകാൻ കഴിയില്ല!`);
      return;
    }
    setAttMap(prev => ({ ...prev, [admNo]: val }));
  }

  async function saveAttendance() {
    setLoading(true); setMsg('');
    const rows = [];
    students.forEach(s => {
      const val = attMap[s.adm_no];
      if (val !== undefined && val !== '') {
        rows.push({
          adm_no: s.adm_no,
          class_name: selectedClass,
          month,
          working_days: Number(workingDays),
          attended_days: Number(val),
          teacher_email: user?.name || 'Admin',
          academic_year: '2026-27'
        });
      }
    });

    if (rows.length === 0) {
      setLoading(false);
      return setMsg('⚠️ സേവ് ചെയ്യാൻ ഡാറ്റയൊന്നും നൽകിയിട്ടില്ല.');
    }

    const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'adm_no,month,academic_year' });
    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else setMsg(`✅ ${rows.length} കുട്ടികളുടെ ${month} മാസത്തെ അറ്റൻഡൻസ് സേവ് ചെയ്തു!`);
  }

  // 2. ക്ലാസ്സ് റിപ്പോർട്ട്
  async function generateClassReport() {
    if (!selectedClass) return alert('ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക!');
    setLoading(true);
    const [{ data: stData }, { data: attData }] = await Promise.all([
      supabase.from('students').select('adm_no, name').eq('class_name', selectedClass).order('name'),
      supabase.from('attendance').select('*').eq('class_name', selectedClass)
    ]);

    const wMap = {};
    (attData || []).forEach(a => { if (!wMap[a.month]) wMap[a.month] = Number(a.working_days) || 0; });
    const activeMonths = MONTHS.filter(m => wMap[m] > 0);

    const rows = (stData || []).map(s => {
      const mine = (attData || []).filter(a => a.adm_no === s.adm_no);
      const mData = {};
      let totalW = 0, totalP = 0;
      mine.forEach(a => {
        mData[a.month] = Number(a.attended_days) || 0;
        totalW += Number(a.working_days) || 0;
        totalP += Number(a.attended_days) || 0;
      });
      const leaves = totalW - totalP;
      const perc = totalW > 0 ? ((totalP / totalW) * 100).toFixed(1) : '0.0';
      return { adm_no: s.adm_no, name: s.name, mData, totalW, totalP, leaves, perc };
    });

    setClassReport({ className: selectedClass, activeMonths, wMap, rows });
    setLoading(false);
  }

  function downloadCSV() {
    if (!classReport) return;
    const headers = ['Adm No', 'Name', ...classReport.activeMonths, 'Total W.Days', 'Total Present', 'Leaves', 'Att %'];
    const csvRows = [headers.join(',')];
    classReport.rows.forEach(r => {
      const cols = [
        r.adm_no, `"${r.name}"`,
        ...classReport.activeMonths.map(m => r.mData[m] ?? '-'),
        r.totalW, r.totalP, r.leaves, `${r.perc}%`
      ];
      csvRows.push(cols.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `NHIA_${classReport.className}_Attendance.csv`;
    a.click();
  }

  // 3. ക്യാമ്പസ് അനാലിസിസ് (Critical Leaves > 7.5 Days)
  async function loadCampusAnalysis() {
    setLoading(true);
    const [{ data: stData }, { data: attData }] = await Promise.all([
      supabase.from('students').select('adm_no, name, class_name'),
      supabase.from('attendance').select('*')
    ]);

    const stMap = {};
    (stData || []).forEach(s => { stMap[s.adm_no] = { ...s, totalW: 0, totalP: 0 }; });
    (attData || []).forEach(a => {
      if (stMap[a.adm_no]) {
        stMap[a.adm_no].totalW += Number(a.working_days) || 0;
        stMap[a.adm_no].totalP += Number(a.attended_days) || 0;
      }
    });

    const list = Object.values(stMap).filter(s => s.totalW > 0).map(s => ({
      ...s,
      leaves: s.totalW - s.totalP,
      perc: (s.totalP / s.totalW) * 100
    }));

    const critical = list.filter(s => s.leaves > 7.5).sort((a, b) => b.leaves - a.leaves);
    const best = [...list].sort((a, b) => b.perc - a.perc).slice(0, 10);

    setCampusStats({ critical, best });
    setLoading(false);
  }

  // 4. പെൻഡിങ് അലർട്ട്
  async function checkPending() {
    setLoading(true);
    const { data: attData } = await supabase.from('attendance').select('class_name').eq('month', month);
    const entered = new Set((attData || []).map(a => a.class_name));
    const pending = classes.filter(c => !entered.has(c));
    setPendingList({ month, pending });
    setLoading(false);
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
        <Header title="My Attendance" backAction={onBack} />
        {loading || !studentAtt ? <p style={{ textAlign: 'center', color: '#64748b' }}>ലോഡ് ചെയ്യുന്നു...</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#2e44d2' }}>{studentAtt.perc}%</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Attendance</div>
              </div>
              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{studentAtt.totalP}/{studentAtt.totalW}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Present</div>
              </div>
              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>{studentAtt.leaves}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Leaves</div>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
              {studentAtt.list.length === 0 ? <p style={{ fontSize: 13, color: '#94a3b8' }}>അറ്റൻഡൻസ് വിവരങ്ങൾ ഇതുവരെ ചേർത്തിട്ടില്ല.</p> : studentAtt.list.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                  <b>{a.month}</b>
                  <span>{a.attended_days} / {a.working_days} Days</span>
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
        <Header title="Attendance" backAction={onBack} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { id: 'register', label: 'Monthly register', icon: Calendar },
            { id: 'report', label: 'Class-wise attendance', icon: BarChart3 },
            { id: 'analysis', label: 'Campus analysis (Critical leaves)', icon: CheckCircle },
            { id: 'pending', label: 'Pending alerts', icon: AlertTriangle }
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => { setView(item.id); setMsg(''); if (item.id === 'analysis') loadCampusAnalysis(); }}
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
      <Header
        title={view === 'register' ? 'Monthly Register' : view === 'report' ? 'Class Attendance' : view === 'analysis' ? 'Campus Analysis' : 'Pending Alerts'}
        backAction={() => setView('menu')}
      />

      {msg && <div style={{ background: '#eff6ff', color: '#1e40af', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{msg}</div>}

      {/* 1. MONTHLY REGISTER */}
      {view === 'register' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }}>
              <option value="">-- ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <select value={month} onChange={e => setMonth(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }}>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="number" placeholder="Working Days" value={workingDays} onChange={e => setWorkingDays(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            </div>
            <button onClick={loadRegister} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Open Register
            </button>
          </div>

          {students.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <tr>
                    <th style={{ padding: 10, textAlign: 'left' }}>Student</th>
                    <th style={{ padding: 10, textAlign: 'center' }}>Attended (Max {workingDays})</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.adm_no} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 10, fontWeight: 600 }}>
                        {s.name}<div style={{ fontSize: 11, color: '#64748b' }}>{s.adm_no}</div>
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <input
                          type="number"
                          step="0.5"
                          value={attMap[s.adm_no] ?? ''}
                          onChange={e => updateAtt(s.adm_no, e.target.value)}
                          placeholder="Days"
                          style={{ width: 75, padding: 7, textAlign: 'center', borderRadius: 8, border: '1px solid #cbd5e1' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={saveAttendance} disabled={loading} style={{ width: '100%', padding: 14, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Save size={16} /> {loading ? 'Saving...' : 'Submit Attendance'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. CLASS-WISE REPORT */}
      {view === 'report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>
              <option value="">-- ക്ലാസ്സ് --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={generateClassReport} style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Generate
            </button>
          </div>

          {classReport && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <thead style={{ background: '#1e293b', color: '#fff' }}>
                    <tr>
                      <th style={{ padding: 8, textAlign: 'left' }}>Name</th>
                      {classReport.activeMonths.map(m => <th key={m} style={{ padding: 8 }}>{m.slice(0, 3)} ({classReport.wMap[m]})</th>)}
                      <th style={{ padding: 8 }}>Present</th>
                      <th style={{ padding: 8 }}>Leaves</th>
                      <th style={{ padding: 8 }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classReport.rows.map(r => (
                      <tr key={r.adm_no} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: 8, textAlign: 'left', fontWeight: 600 }}>{r.name}</td>
                        {classReport.activeMonths.map(m => <td key={m} style={{ padding: 8 }}>{r.mData[m] ?? '-'}</td>)}
                        <td style={{ padding: 8, fontWeight: 700 }}>{r.totalP}/{r.totalW}</td>
                        <td style={{ padding: 8, fontWeight: 700, color: r.leaves > 7.5 ? '#dc2626' : '#0f172a' }}>{r.leaves}</td>
                        <td style={{ padding: 8, fontWeight: 700, color: '#2e44d2' }}>{r.perc}%</td>
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

      {/* 3. CAMPUS ANALYSIS */}
      {view === 'analysis' && campusStats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #fecaca' }}>
            <h4 style={{ color: '#dc2626', marginBottom: 10 }}>🚨 Critical Leaves (&gt; 7.5 Days)</h4>
            {campusStats.critical.length === 0 ? <p style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>ആരും പരിധി കടന്നിട്ടില്ല!</p> : campusStats.critical.map(s => (
              <div key={s.adm_no} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #fee2e2', fontSize: 13 }}>
                <span><b>{s.name}</b> ({s.class_name})</span>
                <b style={{ color: '#dc2626' }}>{s.leaves} Days</b>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #bbf7d0' }}>
            <h4 style={{ color: '#16a34a', marginBottom: 10 }}>🌟 Top Attendance</h4>
            {campusStats.best.map(s => (
              <div key={s.adm_no} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0fdf4', fontSize: 13 }}>
                <span><b>{s.name}</b> ({s.class_name})</span>
                <b style={{ color: '#16a34a' }}>{s.perc.toFixed(1)}%</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. PENDING ALERTS */}
      {view === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={month} onChange={e => setMonth(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button onClick={checkPending} style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Scan
            </button>
          </div>
          {pendingList && (
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <h4 style={{ marginBottom: 10 }}>Pending for {pendingList.month}</h4>
              {pendingList.pending.length === 0 ? (
                <p style={{ color: '#16a34a', fontWeight: 600, fontSize: 13 }}>✅ എല്ലാ ക്ലാസ്സുകളും അറ്റൻഡൻസ് നൽകിയിട്ടുണ്ട്!</p>
              ) : pendingList.pending.map(c => (
                <div key={c} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14, color: '#dc2626', fontWeight: 600 }}>
                  ⚠️ {c} — Not Submitted
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}