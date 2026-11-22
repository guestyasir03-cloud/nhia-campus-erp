import React, { useState, useEffect } from 'react';
import { FileText, Award, Download, ChevronLeft, Save, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { exportReportPDF, exportReportJPEG } from '../lib/exportReport';

export default function ExamsModule({ onBack, user }) {
  const isAdmin = ['admin', 'coordinator'].includes(user?.role);
  const [view, setView] = useState(user?.role === 'student' ? 'gradecard' : 'menu');
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState('');
  const [activeConfig, setActiveConfig] = useState(null); // { has_w1_w4, has_midterm, has_hifz }
  const [examMode, setExamMode] = useState('w1_w4'); // 'w1_w4' | 'midterm' | 'hifz'
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
    if (user?.role !== 'student') {
      loadAssignments();
    }
    if (user?.role === 'student' && user.id) {
      fetchGradeCard(user.id);
    }
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    if (data) {
      setClasses([...new Set(data.map(d => d.class_name).filter(Boolean))].filter(c => c !== 'ALUMNI').sort());
    }
  }

  async function loadAssignments() {
    const { data, error } = await supabase
      .from('subject_assignments')
      .select('*')
      .order('class_name')
      .order('subject_name');

    if (error || !data) {
      setAssignments([]);
      return;
    }

    if (isAdmin) {
      setAssignments(data);
      return;
    }

    const uId = String(user?.staff_id || user?.id || '').trim().toLowerCase();
    const uName = String(user?.name || '').trim().toLowerCase();

    const filtered = data.filter(a => {
      const aId = String(a.staff_id || '').trim().toLowerCase();
      const aName = String(a.staff_name || '').trim().toLowerCase();
      return (uId && aId === uId) || (uName && aName === uName);
    });

    setAssignments(filtered);
  }

  // Helper: Get DB subject key based on mode so W1-W4 & Midterm never overwrite each other
  function getDbSubjectKey(baseSub, mode) {
    const clean = baseSub.trim();
    if (mode === 'midterm') {
      return clean.toUpperCase().includes('MIDTERM') ? clean : `${clean} (Midterm)`;
    }
    if (mode === 'hifz') {
      return clean.toUpperCase().includes('HIFZ') ? clean : `${clean} (Hifz)`;
    }
    return clean;
  }

  function handleAssignmentSelect(val) {
    setSelectedAssignment(val);
    if (!val) {
      setSelectedClass('');
      setSubject('');
      setActiveConfig(null);
      setStudents([]);
      return;
    }
    const found = assignments.find(a => String(a.id) === val);
    if (found) {
      setSelectedClass(found.class_name);
      setSubject(found.subject_name);
      setActiveConfig(found);

      // Pick first enabled mode automatically
      const defaultMode = found.has_w1_w4 !== false
  ? 'w1_w4'
  : found.has_midterm
  ? 'midterm'
  : found.has_hifz
  ? 'hifz'
  : 'w1_w4';

      setExamMode(defaultMode);
      loadForEntry(found.class_name, found.subject_name, defaultMode);
    }
  }

  function handleModeSwitch(mode) {
    setExamMode(mode);
    if (selectedClass && subject) {
      loadForEntry(selectedClass, subject, mode);
    }
  }

  async function loadForEntry(clsParam, subParam, modeParam) {
    const targetClass = typeof clsParam === 'string' ? clsParam : selectedClass;
    const targetSub = typeof subParam === 'string' ? subParam : subject;
    const targetMode = modeParam || examMode;

    if (!targetClass || !targetSub.trim()) return alert('ക്ലാസ്സും വിഷയവും നൽകുക!');
    setLoading(true);
    setMsg('');

    const dbSubject = getDbSubjectKey(targetSub, targetMode);

    const [{ data: stData }, { data: mkData }] = await Promise.all([
      supabase.from('students').select('adm_no, name').eq('class_name', targetClass).order('name'),
      supabase.from('marks').select('*').eq('class_name', targetClass).eq('subject', dbSubject)
    ]);

    const map = {};
    (mkData || []).forEach(m => {
      map[m.adm_no] = {
        w1: m.w1 ?? '',
        w2: m.w2 ?? '',
        w3: m.w3 ?? '',
        w4: m.w4 ?? '',
        total: m.total ?? ''
      };
    });

    setStudents(stData || []);
    setMarksMap(map);
    setLoading(false);
  }

  const isSingleMarkMode = examMode === 'midterm' || examMode === 'hifz'; 

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
    setLoading(true);
    setMsg('');
    const dbSubject = getDbSubjectKey(subject, examMode);
    const rows = [];

    students.forEach(s => {
      const m = marksMap[s.adm_no];
      if (!m) return;
      if (isSingleMarkMode) {
        if (m.total === '') return;
        const tot = Number(m.total) || 0;
        rows.push({
          adm_no: s.adm_no,
          class_name: selectedClass,
          subject: dbSubject,
          teacher_email: user?.name || 'Admin',
          w1: tot,
          w2: null,
          w3: null,
          w4: null,
          total: tot,
          final_mark: tot,
          academic_year: '2026-27'
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
          adm_no: s.adm_no,
          class_name: selectedClass,
          subject: dbSubject,
          teacher_email: user?.name || 'Admin',
          w1,
          w2,
          w3,
          w4,
          total: tot,
          final_mark: finalMark,
          academic_year: '2026-27'
        });
      }
    });

    if (rows.length === 0) {
      setLoading(false);
      return setMsg('⚠️ സേവ് ചെയ്യാൻ മാർക്കുകളൊന്നും നൽകിയിട്ടില്ല.');
    }

    const { error } = await supabase.from('marks').upsert(rows, { onConflict: 'adm_no,subject,academic_year' });
    setLoading(false);
    if (error) setMsg('âŒ Error: ' + error.message);
    else setMsg(`✅ ${rows.length} കുട്ടികളുടെ ${dbSubject} മാർക്കുകൾ സേവ് ചെയ്തു!`);
  }

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
      const isSingle = sub.toUpperCase().includes('HIFZ') || sub.toUpperCase().includes('MIDTERM');
      maxFinal += isSingle ? 100 : 30;
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

    const sorted = [...rows].sort((a, b) => b.finalTotal - a.finalTotal);
    const rankMap = {};
    sorted.forEach((r, idx) => { rankMap[r.adm_no] = idx + 1; });
    rows.forEach(r => { r.rank = rankMap[r.adm_no]; });

    setReportData({ className: selectedClass, subjects, maxFinal, rows });
    setLoading(false);
  }

    async function fetchGradeCard(admNoParam) {
    const targetAdm = (admNoParam || admInput).trim();
    if (!targetAdm) return alert('അഡ്മിഷൻ നമ്പർ നൽകുക!');
    setLoading(true);
    setMsg('');

    const [
      { data: st },
      { data: mk },
      { data: allStudents },
      { data: allMarks },
      { data: attData }
    ] = await Promise.all([
      supabase.from('students').select('*').eq('adm_no', targetAdm).maybeSingle(),
      supabase.from('marks').select('*').eq('adm_no', targetAdm),
      supabase.from('students').select('adm_no, class_name'),
      supabase.from('marks').select('adm_no, final_mark'),
      supabase.from('attendance').select('status').eq('adm_no', targetAdm)
    ]);

    if (!st) {
      setLoading(false);
      return setMsg('❌ ഈ അഡ്മിഷൻ നമ്പറുള്ള കുട്ടിയെ കണ്ടെത്താനായില്ല!');
    }

    const { data: assignedSubs } = await supabase
      .from('subject_assignments')
      .select('subject')
      .eq('class_name', st.class_name);

    setLoading(false);

    // Build complete subject list for this class (assigned + any existing marks)
    const subSet = new Set();
    (assignedSubs || []).forEach(a => { if (a.subject) subSet.add(a.subject.trim()); });
    (mk || []).forEach(m => { if (m.subject) subSet.add(m.subject.trim()); });
    const allSubjects = Array.from(subSet);

    const markBySub = {};
    (mk || []).forEach(m => {
      if (m.subject) markBySub[m.subject.trim().toUpperCase()] = m;
    });

    const hasVal = (v) => v !== null && v !== undefined && v !== '';

    let grandTotal = 0;
    let totalMax = 0;
    let failedCount = 0;

    const marksList = allSubjects.map((subName, idx) => {
      const m = markBySub[subName.toUpperCase()] || null;
      const isHifz = subName.toUpperCase().includes('HIFZ');
      const isMid = subName.toUpperCase().includes('MIDTERM');
      const isSingle = isHifz || isMid;
      const maxM = isSingle ? 100 : 30;
      const passM = isSingle ? 40 : 12;
      totalMax += maxM;

      if (!m) {
        return {
          sl: idx + 1,
          subject: subName,
          w1: '-', w2: '-', w3: '-', w4: '-',
          scored: '-', maxM, perc: '-', status: 'Pending'
        };
      }

      const w1 = !isSingle && hasVal(m.w1) ? m.w1 : '-';
      const w2 = !isSingle && hasVal(m.w2) ? m.w2 : '-';
      const w3 = !isSingle && hasVal(m.w3) ? m.w3 : '-';
      const w4 = !isSingle && hasVal(m.w4) ? m.w4 : '-';

      const hasAnyMark = isSingle
        ? hasVal(m.final_mark) || hasVal(m.total)
        : (w1 !== '-' || w2 !== '-' || w3 !== '-' || w4 !== '-');

      const allFourEntered = isSingle
        ? hasAnyMark
        : (w1 !== '-' && w2 !== '-' && w3 !== '-' && w4 !== '-');

      const scoredNum = hasAnyMark ? Number(m.final_mark || 0) : null;
      if (scoredNum !== null) grandTotal += scoredNum;

      let status = 'Pending';
      if (allFourEntered && scoredNum !== null) {
        status = scoredNum >= passM ? 'Passed' : 'Failed';
        if (status === 'Failed') failedCount++;
      }

      const scoredDisplay = scoredNum === null
        ? '-'
        : (Number.isInteger(scoredNum) ? String(scoredNum) : scoredNum.toFixed(1));

      return {
        sl: idx + 1,
        subject: subName,
        w1, w2, w3, w4,
        scored: scoredDisplay,
        maxM,
        perc: scoredNum === null ? '-' : ((scoredNum / maxM) * 100).toFixed(1) + '%',
        status
      };
    });

    // Class Rank & Campus Rank
    const totalsByAdm = {};
    (allMarks || []).forEach(r => {
      totalsByAdm[r.adm_no] = (totalsByAdm[r.adm_no] || 0) + (Number(r.final_mark) || 0);
    });

    const campusList = (allStudents || []).map(s => ({
      adm_no: s.adm_no,
      class_name: s.class_name,
      total: totalsByAdm[s.adm_no] || 0
    })).sort((a, b) => b.total - a.total);

    const classList = campusList.filter(s => s.class_name === st.class_name);
    const campusRank = campusList.findIndex(s => String(s.adm_no) === String(st.adm_no)) + 1;
    const classRank = classList.findIndex(s => String(s.adm_no) === String(st.adm_no)) + 1;

    // Attendance summary
    const attTotal = (attData || []).length;
    const attPresent = (attData || []).filter(a => ['present', 'p'].includes(String(a.status || '').toLowerCase())).length;
    const attPerc = attTotal > 0 ? ((attPresent / attTotal) * 100).toFixed(1) : null;

    setGradeCard({
      student: st,
      marks: marksList,
      grandTotal: grandTotal.toFixed(2),
      totalMax,
      perc: totalMax > 0 ? ((grandTotal / totalMax) * 100).toFixed(2) : '0.00',
      failedCount,
      classRank: classRank > 0 ? `${classRank} / ${classList.length}` : '-',
      campusRank: campusRank > 0 ? `${campusRank} / ${campusList.length}` : '-',
      attendance: attTotal > 0 ? `${attPresent} / ${attTotal} Days (${attPerc}%)` : '-',
      dateStr: new Date().toLocaleDateString('en-US')
    });
  }

  function downloadPDF() {
    exportReportPDF('nhia-grade-card', `${gradeCard.student.name}_GradeCard.pdf`, false);
  }
const handleEnterDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const td = e.target.closest('td');
      const nextRow = e.target.closest('tr')?.nextElementSibling;
      if (td && nextRow) {
        const nextInput = nextRow.children[td.cellIndex]?.querySelector('input');
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    }
  };
  const Header = ({ title, backAction }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <button onClick={backAction} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <ChevronLeft size={20} />
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h2>
    </div>
  );

  // Enabled modes for currently selected subject
  const enabledModes = activeConfig
    ? [
        ...(activeConfig.has_w1_w4 ? [{ id: 'w1_w4', label: 'W1–W4 (CCE)' }] : []),
        ...(activeConfig.has_midterm ? [{ id: 'midterm', label: 'Midterm (100)' }] : []),
        ...(activeConfig.has_hifz ? [{ id: 'hifz', label: 'Hifz / Viva (100)' }] : [])
      ]
    : [];

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
            <label style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Select Assigned Module:</label>
            {assignments.length > 0 ? (
              <select
                value={selectedAssignment}
                onChange={e => handleAssignmentSelect(e.target.value)}
                style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 600, background: '#fff' }}
              >
                <option value="">-- Select Assignment --</option>
                {assignments.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.class_name} - {a.subject_name}{isAdmin && a.staff_name ? ` (${a.staff_name})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '6px 0' }}>
                {isAdmin
                  ? 'അസൈൻമെന്റുകളൊന്നും ചേർത്തിട്ടില്ല. താഴെ നിന്ന് നേരിട്ട് ക്ലാസ്സും വിഷയവും തിരഞ്ഞെടുക്കാം.'
                  : 'നിങ്ങൾക്ക് ഇതുവരെ വിഷയങ്ങളൊന്നും അസൈൻ ചെയ്തിട്ടില്ല. അഡ്മിനുമായി ബന്ധപ്പെടുക.'}
              </div>
            )}

            {/* DYNAMIC EXAM MODE SWITCHER (W1-W4 / MIDTERM / HIFZ) */}
            {enabledModes.length > 1 && (
              <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 10, gap: 4, marginTop: 4 }}>
                {enabledModes.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModeSwitch(m.id)}
                    style={{
                      flex: 1, padding: '8px 6px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      background: examMode === m.id ? '#2e44d2' : 'transparent',
                      color: examMode === m.id ? '#fff' : '#475569'
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {isAdmin && (
              <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 12, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>OR MANUAL ENTRY (ADMIN)</div>
                <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedAssignment(''); setActiveConfig(null); }} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}>
                  <option value="">-- ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക --</option>
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  value={subject}
                  onChange={e => { setSubject(e.target.value); setSelectedAssignment(''); setActiveConfig(null); }}
                  placeholder="വിഷയം (ഉദാ: Fiqh, English, Hifz)"
                  style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}
                />
                <button onClick={() => loadForEntry(selectedClass, subject, 'w1_w4')} style={{ padding: 11, borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Load Students
                </button>
              </div>
            )}
          </div>

          {loading && <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>ലോഡ് ചെയ്യുന്നു...</p>}

          {students.length > 0 && !loading && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: '#eef2ff', fontSize: 13, fontWeight: 700, color: '#2e44d2' }}>
                {selectedClass} — {getDbSubjectKey(subject, examMode)} ({students.length} Students)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: 10, textAlign: 'left' }}>Student</th>
                      {isSingleMarkMode ? (
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
                          {isSingleMarkMode ? (
                            <td style={{ padding: 6 }}>
                              <input type="number" enterKeyHint="next" onKeyDown={handleEnterDown} tabIndex={1000 + students.indexOf(s)} value={m.total} onChange={e => updateMark(s.adm_no, 'total', e.target.value, 100)} style={{ width: 65, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                            </td>
                          ) : (
                            <>
                              <td><input type="number" enterKeyHint="next" onKeyDown={handleEnterDown} tabIndex={1000 + students.indexOf(s)} value={m.w1} onChange={e => updateMark(s.adm_no, 'w1', e.target.value, 15)} style={{ width: 46, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }} /></td>
                              <td><input type="number" enterKeyHint="next" onKeyDown={handleEnterDown} tabIndex={2000 + students.indexOf(s)} value={m.w2} onChange={e => updateMark(s.adm_no, 'w2', e.target.value, 20)} style={{ width: 46, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }} /></td>
                              <td><input type="number" enterKeyHint="next" onKeyDown={handleEnterDown} tabIndex={3000 + students.indexOf(s)} value={m.w3} onChange={e => updateMark(s.adm_no, 'w3', e.target.value, 25)} style={{ width: 46, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }} /></td>
                              <td><input type="number" enterKeyHint="next" onKeyDown={handleEnterDown} tabIndex={4000 + students.indexOf(s)} value={m.w4} onChange={e => updateMark(s.adm_no, 'w4', e.target.value, 40)} style={{ width: 46, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }} /></td>
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
              <div id="nhia-grade-card" style={{ background: '#fff', padding: '18px 20px', fontFamily: 'Times New Roman, serif', color: '#000', border: '1px solid #cbd5e1' }}>
                <div style={{ textAlign: 'center', borderBottom: '1.5px solid #000', paddingBottom: 10, marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>Noorul Hidaya Islamic Academy, Pattambi</h3>
                  <div style={{ fontSize: 12, marginTop: 3 }}>(Affiliated to: Darul Huda Islamic University)</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>Kondoorkkara, Aman nagar, 679313</div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '6px 8px', width: '32%' }}><b>Academic Year:</b> 2026-27</td>
                      <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 14 }}>CCE Grade Card</td>
                      <td style={{ border: '1px solid #000', padding: '6px 8px', width: '30%' }}><b>Term:</b> Half Year</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '6px 8px' }}><b>Date:</b> {gradeCard.dateStr}</td>
                      <td style={{ border: '1px solid #000', padding: '6px 8px' }}><b>Ad No:</b> {gradeCard.student.adm_no}</td>
                      <td style={{ border: '1px solid #000', padding: '6px 8px' }}><b>Std:</b> {gradeCard.student.class_name}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ border: '1px solid #000', padding: '6px 8px' }}><b>Name:</b> {gradeCard.student.name}</td>
                      <td style={{ border: '1px solid #000', padding: '6px 8px', color: '#1d4ed8', fontWeight: 600 }}><b>Attendance:</b> {gradeCard.attendance}</td>
                    </tr>
                  </tbody>
                </table>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, textAlign: 'center', marginBottom: 14 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ border: '1px solid #000', padding: '6px 4px', width: 38 }}>Sl No</th>
                      <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'left' }}>Subjects</th>
                      <th style={{ border: '1px solid #000', padding: '6px 4px', width: 38 }}>W1</th>
                      <th style={{ border: '1px solid #000', padding: '6px 4px', width: 38 }}>W2</th>
                      <th style={{ border: '1px solid #000', padding: '6px 4px', width: 38 }}>W3</th>
                      <th style={{ border: '1px solid #000', padding: '6px 4px', width: 38 }}>W4</th>
                      <th style={{ border: '1px solid #000', padding: '6px 5px', width: 52 }}>Scored</th>
                      <th style={{ border: '1px solid #000', padding: '6px 4px', width: 42 }}>Max</th>
                      <th style={{ border: '1px solid #000', padding: '6px 5px', width: 52 }}>%</th>
                      <th style={{ border: '1px solid #000', padding: '6px 5px', width: 64 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeCard.marks.map(m => (
                      <tr key={m.subject}>
                        <td style={{ border: '1px solid #000', padding: '5px 4px' }}>{m.sl}</td>
                        <td style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'left', fontWeight: 700 }}>{m.subject}</td>
                        <td style={{ border: '1px solid #000', padding: '5px 4px' }}>{m.w1}</td>
                        <td style={{ border: '1px solid #000', padding: '5px 4px' }}>{m.w2}</td>
                        <td style={{ border: '1px solid #000', padding: '5px 4px' }}>{m.w3}</td>
                        <td style={{ border: '1px solid #000', padding: '5px 4px' }}>{m.w4}</td>
                        <td style={{ border: '1px solid #000', padding: '5px 4px', fontWeight: 700 }}>{m.scored}</td>
                        <td style={{ border: '1px solid #000', padding: '5px 4px' }}>{m.maxM}</td>
                        <td style={{ border: '1px solid #000', padding: '5px 4px' }}>{m.perc}</td>
                        <td style={{
                          border: '1px solid #000', padding: '5px 4px', fontWeight: 600,
                          fontStyle: m.status === 'Pending' ? 'italic' : 'normal',
                          color: m.status === 'Passed' ? '#15803d' : m.status === 'Failed' ? '#dc2626' : '#ea580c'
                        }}>
                          {m.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
                  <table style={{ width: '56%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <tbody>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '6px 8px', width: '52%' }}>Grand Total</td>
                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}>{gradeCard.grandTotal} / {gradeCard.totalMax}</td>
                      </tr>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}>Percentage</td>
                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}>{gradeCard.perc} %</td>
                      </tr>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}>Class Rank</td>
                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}>{gradeCard.classRank}</td>
                      </tr>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}>Campus Rank</td>
                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}>{gradeCard.campusRank}</td>
                      </tr>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}>Failed Subjects</td>
                        <td style={{ border: '1px solid #000', padding: '6px 8px', color: '#dc2626', fontWeight: 700 }}>{gradeCard.failedCount}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div style={{ textAlign: 'center', minWidth: 150, paddingBottom: 4 }}>
                    <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontWeight: 700, fontSize: 13 }}>Principal</div>
                  </div>
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
