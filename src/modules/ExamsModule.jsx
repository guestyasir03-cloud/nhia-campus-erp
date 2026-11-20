import React, { useState, useEffect } from 'react';
import { FileText, Award, Download, ChevronLeft, Save, Search } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

export default function ExamsModule({ onBack, user }) {
  const [view, setView] = useState(user?.role === 'student' ? 'gradecard' : 'menu'); // menu | entry | report | gradecard
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [subject, setSubject] = useState('');
  const [students, setStudents] = useState([]);
  const [marksMap, setMarksMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Class Report State
  const [reportData, setReportData] = useState(null);

  // Grade Card State
  const [admInput, setAdmInput] = useState(user?.role === 'student' ? user.id : '');
  const [gradeCard, setGradeCard] = useState(null);

  useEffect(() => {
    loadClasses();
    if (user?.role === 'student' && user.id) {
      fetchGradeCard(user.id);
    }
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    if (data) {
      setClasses([...new Set(data.map(d => d.class_name).filter(Boolean))].sort());
    }
  }

  // 1. മാർക്ക് എൻട്രിക്കായി ക്ലാസ്സിലെ കുട്ടികളെയും നിലവിലെ മാർക്കുകളും ലോഡ് ചെയ്യുന്നു
  async function loadForEntry() {
    if (!selectedClass || !subject.trim()) return alert('ക്ലാസ്സും വിഷയവും നൽകുക!');
    setLoading(true); setMsg('');
    const cleanSub = subject.trim();

    const [{ data: stData }, { data: mkData }] = await Promise.all([
      supabase.from('students').select('adm_no, name').eq('class_name', selectedClass).order('name'),
      supabase.from('marks').select('*').eq('class_name', selectedClass).eq('subject', cleanSub)
    ]);

    const map = {};
    (mkData || []).forEach(m => {
      map[m.adm_no] = {
        w1: m.w1 ?? '', w2: m.w2 ?? '', w3: m.w3 ?? '', w4: m.w4 ?? '', total: m.total ?? ''
      };
    });

    setStudents(stData || []);
    setMarksMap(map);
    setLoading(false);
  }

  const isHifzOrMidterm = subject.toUpperCase().includes('HIFZ') || subject.toUpperCase().includes('MIDTERM');

  function updateMark(admNo, field, value, max) {
    if (value !== '' && Number(value) > max) {
      alert(`പരമാവധി ${max} മാർക്ക് മാത്രമേ നൽകാൻ കഴിയൂ!`);
      return;
    }
    setMarksMap(prev => ({
      ...prev,
      [admNo]: { ...(prev[admNo] || { w1: '', w2: '', w3: '', w4: '', total: '' }), [field]: value }
    }));
  }

  async function saveMarks() {
    setLoading(true); setMsg('');
    const cleanSub = subject.trim();
    const rows = [];

    students.forEach(s => {
      const m = marksMap[s.adm_no];
      if (!m) return;
      if (isHifzOrMidterm) {
        if (m.total === '') return;
        const tot = Number(m.total) || 0;
        rows.push({
          adm_no: s.adm_no, class_name: selectedClass, subject: cleanSub,
          teacher_email: user?.name || 'Admin',
          w1: tot, w2: null, w3: null, w4: null, total: tot, final_mark: tot, academic_year: '2026-27'
        });
      } else {
        if (m.w1 === '' && m.w2 === '' && m.w3 === '' && m.w4 === '') return;
        const w1 = m.w1 === '' ? null : Number(m.w1);
        const w2 = m.w2 === '' ? null : Number(m.w2);
        const w3 = m.w3 === '' ? null : Number(m.w3);
        const w4 = m.w4 === '' ? null : Number(m.w4);
        const tot = (w1 || 0) + (w2 || 0) + (w3 || 0) + (w4 || 0);
        const finalMark = Number(((tot / 100) * 30).toFixed(2));
        rows.push({
          adm_no: s.adm_no, class_name: selectedClass, subject: cleanSub,
          teacher_email: user?.name || 'Admin',
          w1, w2, w3, w4, total: tot, final_mark: finalMark, academic_year: '2026-27'
        });
      }
    });

    if (rows.length === 0) {
      setLoading(false);
      return setMsg('⚠️ സേവ് ചെയ്യാൻ മാർക്കുകളൊന്നും നൽകിയിട്ടില്ല.');
    }

    const { error } = await supabase.from('marks').upsert(rows, { onConflict: 'adm_no,subject,academic_year' });
    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else setMsg(`✅ ${rows.length} കുട്ടികളുടെ മാർക്കുകൾ വിജയകരമായി സേവ് ചെയ്തു!`);
  }

  // 2. ക്ലാസ്സ് റിപ്പോർട്ട് ജനറേറ്റ് ചെയ്യുന്നു
  async function generateClassReport() {
    if (!selectedClass) return alert('ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക!');
    setLoading(true);
    const [{ data: stData }, { data: mkData }] = await Promise.all([
      supabase.from('students').select('adm_no, name').eq('class_name', selectedClass).order('name'),
      supabase.from('marks').select('*').eq('class_name', selectedClass)
    ]);

    const subjects = [...new Set((mkData || []).map(m => m.subject))].sort();
    let maxFinal = 0;
    subjects.forEach(sub => {
      const isHifz = sub.toUpperCase().includes('HIFZ') || sub.toUpperCase().includes('MIDTERM');
      maxFinal += isHifz ? 100 : 30;
    });

    const rows = (stData || []).map(s => {
      const myMarks = (mkData || []).filter(m => m.adm_no === s.adm_no);
      const subMap = {};
      let finalTotal = 0;
      myMarks.forEach(m => {
        subMap[m.subject] = m.total;
        finalTotal += Number(m.final_mark) || 0;
      });
      const perc = maxFinal > 0 ? ((finalTotal / maxFinal) * 100).toFixed(1) : '0.0';
      return { adm_no: s.adm_no, name: s.name, subMap, finalTotal: Number(finalTotal.toFixed(2)), perc };
    });

    // Rank Calculation
    const sorted = [...rows].sort((a, b) => b.finalTotal - a.finalTotal);
    const rankMap = {};
    sorted.forEach((r, idx) => { rankMap[r.adm_no] = idx + 1; });
    rows.forEach(r => { r.rank = rankMap[r.adm_no]; });

    setReportData({ className: selectedClass, subjects, maxFinal, rows });
    setLoading(false);
  }

  // 3. സ്റ്റുഡന്റ് ഗ്രേഡ് കാർഡ് (PDF)
  async function fetchGradeCard(admNoParam) {
    const targetAdm = (admNoParam || admInput).trim();
    if (!targetAdm) return alert('അഡ്മിഷൻ നമ്പർ നൽകുക!');
    setLoading(true); setMsg('');

    const [{ data: st }, { data: mk }] = await Promise.all([
      supabase.from('students').select('*').eq('adm_no', targetAdm).maybeSingle(),
      supabase.from('marks').select('*').eq('adm_no', targetAdm)
    ]);

    setLoading(false);
    if (!st) return setMsg('❌ ഈ അഡ്മിഷൻ നമ്പറുള്ള കുട്ടിയെ കണ്ടെത്താനായില്ല!');

    let grandTotal = 0, totalMax = 0, failedCount = 0;
    const marksList = (mk || []).map(m => {
      const isHifz = m.subject.toUpperCase().includes('HIFZ');
      const isMid = m.subject.toUpperCase().includes('MIDTERM');
      const maxM = isHifz ? 100 : 30;
      const passM = isHifz ? 45 : 12;
      const scored = Number(m.final_mark) || 0;
      grandTotal += scored;
      totalMax += maxM;
      const status = scored >= passM ? 'Passed' : 'Failed';
      if (status === 'Failed') failedCount++;
      return { ...m, maxM, scored, status, showW: !isHifz && !isMid };
    });

    setGradeCard({
      student: st,
      marks: marksList,
      grandTotal: grandTotal.toFixed(2),
      totalMax,
      perc: totalMax > 0 ? ((grandTotal / totalMax) * 100).toFixed(2) : '0.00',
      failedCount
    });
  }

  function downloadPDF() {
    const el = document.getElementById('nhia-grade-card');
    if (!el) return;
    html2pdf().set({
      margin: 10,
      filename: `${gradeCard.student.name}_GradeCard.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
  }

  const Header = ({ title, backAction }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <button onClick={backAction} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <ChevronLeft size={20} />
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h2>
    </div>
  );

  if (view === 'menu') {
    return (
      <div>
        <Header title="Examinations" backAction={onBack} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { id: 'entry', label: 'Mark entry (W1–W4 / Hifz / Midterm)', icon: FileText },
            { id: 'report', label: 'Class mark report & Ranking', icon: Award },
            { id: 'gradecard', label: 'Student Grade Card (PDF)', icon: Download }
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
      <Header
        title={view === 'entry' ? 'Mark Entry' : view === 'report' ? 'Class Report' : 'Grade Card (PDF)'}
        backAction={() => user?.role === 'student' ? onBack() : setView('menu')}
      />

      {msg && <div style={{ background: '#eff6ff', color: '#1e40af', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{msg}</div>}

      {/* 1. MARK ENTRY */}
      {view === 'entry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}>
              <option value="">-- ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="വിഷയം (ഉദാ: Fiqh, English, Hifz)"
              style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}
            />
            <button onClick={loadForEntry} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Load Students
            </button>
          </div>

          {students.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: 10, textAlign: 'left' }}>Student</th>
                      {isHifzOrMidterm ? (
                        <th style={{ padding: 10 }}>Mark (100)</th>
                      ) : (
                        <>
                          <th style={{ padding: 8 }}>W1(15)</th>
                          <th style={{ padding: 8 }}>W2(20)</th>
                          <th style={{ padding: 8 }}>W3(25)</th>
                          <th style={{ padding: 8 }}>W4(40)</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => {
                      const m = marksMap[s.adm_no] || { w1: '', w2: '', w3: '', w4: '', total: '' };
                      return (
                        <tr key={s.adm_no} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: 10, textAlign: 'left', fontWeight: 600 }}>
                            {s.name}<div style={{ fontSize: 10, color: '#64748b' }}>{s.adm_no}</div>
                          </td>
                          {isHifzOrMidterm ? (
                            <td style={{ padding: 6 }}>
                              <input type="number" value={m.total} onChange={e => updateMark(s.adm_no, 'total', e.target.value, 100)} style={{ width: 65, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                            </td>
                          ) : (
                            <>
                              <td><input type="number" value={m.w1} onChange={e => updateMark(s.adm_no, 'w1', e.target.value, 15)} style={{ width: 46, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }} /></td>
                              <td><input type="number" value={m.w2} onChange={e => updateMark(s.adm_no, 'w2', e.target.value, 20)} style={{ width: 46, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }} /></td>
                              <td><input type="number" value={m.w3} onChange={e => updateMark(s.adm_no, 'w3', e.target.value, 25)} style={{ width: 46, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }} /></td>
                              <td><input type="number" value={m.w4} onChange={e => updateMark(s.adm_no, 'w4', e.target.value, 40)} style={{ width: 46, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }} /></td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button onClick={saveMarks} disabled={loading} style={{ width: '100%', padding: 14, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Save size={16} /> {loading ? 'Saving...' : 'Save Marks'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. CLASS REPORT */}
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

          {reportData && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflowX: 'auto', padding: 12 }}>
              <h4 style={{ marginBottom: 10 }}>Class Report: {reportData.className}</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap' }}>
                <thead style={{ background: '#1e293b', color: '#fff' }}>
                  <tr>
                    <th style={{ padding: 8 }}>Rank</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Name</th>
                    {reportData.subjects.map(sub => <th key={sub} style={{ padding: 8 }}>{sub}</th>)}
                    <th style={{ padding: 8 }}>Final ({reportData.maxFinal})</th>
                    <th style={{ padding: 8 }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows.map(r => (
                    <tr key={r.adm_no} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: 8, fontWeight: 700 }}>#{r.rank}</td>
                      <td style={{ padding: 8, textAlign: 'left', fontWeight: 600 }}>{r.name}</td>
                      {reportData.subjects.map(sub => <td key={sub} style={{ padding: 8 }}>{r.subMap[sub] ?? '-'}</td>)}
                      <td style={{ padding: 8, fontWeight: 700, color: '#2e44d2' }}>{r.finalTotal}</td>
                      <td style={{ padding: 8, fontWeight: 700 }}>{r.perc}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. GRADE CARD (PDF) */}
      {view === 'gradecard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {user?.role !== 'student' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={admInput}
                onChange={e => setAdmInput(e.target.value)}
                placeholder="Admission No നൽകുക..."
                style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
              />
              <button onClick={() => fetchGradeCard()} style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Search size={16} /> Search
              </button>
            </div>
          )}

          {gradeCard && (
            <>
              <div id="nhia-grade-card" style={{ background: '#fff', padding: 20, border: '2px solid #000', fontFamily: 'Times New Roman, serif', color: '#000' }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Noorul Hidaya Islamic Academy, Pattambi</h3>
                  <div style={{ fontSize: 12 }}>(Affiliated to: Darul Huda Islamic University) • Academic Year 2026-27</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 12 }}>
                  <div><b>Name:</b> {gradeCard.student.name}</div>
                  <div><b>Adm No:</b> {gradeCard.student.adm_no}</div>
                  <div><b>Class:</b> {gradeCard.student.class_name}</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
                  <thead>
                    <tr style={{ background: '#f2f2f2' }}>
                      <th style={{ border: '1px solid #000', padding: 6 }}>Subject</th>
                      <th style={{ border: '1px solid #000', padding: 6 }}>W1</th>
                      <th style={{ border: '1px solid #000', padding: 6 }}>W2</th>
                      <th style={{ border: '1px solid #000', padding: 6 }}>W3</th>
                      <th style={{ border: '1px solid #000', padding: 6 }}>W4</th>
                      <th style={{ border: '1px solid #000', padding: 6 }}>Scored</th>
                      <th style={{ border: '1px solid #000', padding: 6 }}>Max</th>
                      <th style={{ border: '1px solid #000', padding: 6 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeCard.marks.map(m => (
                      <tr key={m.id}>
                        <td style={{ border: '1px solid #000', padding: 6, textAlign: 'left', fontWeight: 'bold' }}>{m.subject}</td>
                        <td style={{ border: '1px solid #000', padding: 6 }}>{m.showW ? (m.w1 ?? '-') : '-'}</td>
                        <td style={{ border: '1px solid #000', padding: 6 }}>{m.showW ? (m.w2 ?? '-') : '-'}</td>
                        <td style={{ border: '1px solid #000', padding: 6 }}>{m.showW ? (m.w3 ?? '-') : '-'}</td>
                        <td style={{ border: '1px solid #000', padding: 6 }}>{m.showW ? (m.w4 ?? '-') : '-'}</td>
                        <td style={{ border: '1px solid #000', padding: 6, fontWeight: 'bold' }}>{m.scored}</td>
                        <td style={{ border: '1px solid #000', padding: 6 }}>{m.maxM}</td>
                        <td style={{ border: '1px solid #000', padding: 6, color: m.status === 'Failed' ? 'red' : 'green', fontWeight: 'bold' }}>{m.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 'bold' }}>
                  <span>Grand Total: {gradeCard.grandTotal} / {gradeCard.totalMax} ({gradeCard.perc}%)</span>
                  <span>Failed: {gradeCard.failedCount}</span>
                </div>
              </div>

              <button onClick={downloadPDF} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Download size={16} /> Download Grade Card (PDF)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}