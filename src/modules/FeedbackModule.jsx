import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, MessageSquare, Star, ShieldCheck, Settings,
  BarChart3, Trash2, Plus, Copy, Download, Lock, CheckCircle2
} from 'lucide-react';
import { supabase } from '../lib/supabase';

async function hashToken(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getBrowserToken() {
  try {
    let t = localStorage.getItem('nhia_fb_token');
    if (!t) {
      t = Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
      localStorage.setItem('nhia_fb_token', t);
    }
    return t;
  } catch {
    return 'fb_' + Date.now();
  }
}

export default function FeedbackModule({ onBack, user }) {
  const isAdmin = ['admin', 'coordinator'].includes(user?.role);
  const isTeacher = user?.role === 'teacher';
  const [tab, setTab] = useState(isAdmin ? 'reports' : isTeacher ? 'teacher' : 'submit');

  const [config, setConfig] = useState([]);
  const [responses, setResponses] = useState([]);
  const [settings, setSettings] = useState({ accessCode: '', cycle: 'Term 1', isOpen: true });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Submit form state
  const [selClass, setSelClass] = useState(user?.role === 'student' ? (user?.class_name || '') : '');
  const [allClasses, setAllClasses] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [enteredCode, setEnteredCode] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [revealName, setRevealName] = useState(false);
  const [studentName, setStudentName] = useState(user?.role === 'student' ? (user?.name || '') : '');
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Admin config form state
  const [cfgClass, setCfgClass] = useState('');
  const [cfgSubject, setCfgSubject] = useState('');
  const [cfgTeacher, setCfgTeacher] = useState('');

  // Report filters
  const [filterTeacher, setFilterTeacher] = useState('ALL');
  const [filterClass, setFilterClass] = useState('ALL');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [
      { data: cfgData },
      { data: setData },
      { data: stClsData },
      { data: staffData },
      { data: respData }
    ] = await Promise.all([
      supabase.from('feedback_config').select('*').order('class_name').order('subject'),
      supabase.from('app_settings').select('key, value').in('key', ['fb_access_code', 'fb_cycle', 'fb_open']),
      isAdmin ? supabase.from('students').select('class_name') : Promise.resolve({ data: [] }),
      isAdmin ? supabase.from('staff').select('name').order('name') : Promise.resolve({ data: [] }),
      isAdmin || isTeacher
        ? supabase.from('feedback_responses').select('*').order('created_at', { ascending: false })
        : Promise.resolve({ data: [] })
    ]);

    setConfig(cfgData || []);
    if (stClsData) setAllClasses([...new Set(stClsData.map(s => s.class_name).filter(Boolean))].sort());
    if (staffData) setAllStaff(staffData.map(s => s.name).filter(Boolean));
    setResponses(respData || []);
    const sObj = { accessCode: '', cycle: 'Term 1', isOpen: true };
    (setData || []).forEach(r => {
      if (r.key === 'fb_access_code') sObj.accessCode = r.value || '';
      if (r.key === 'fb_cycle' && r.value) sObj.cycle = r.value;
      if (r.key === 'fb_open') sObj.isOpen = r.value !== 'false';
    });
    setSettings(sObj);
    if (!sObj.accessCode) setCodeVerified(true);
    setLoading(false);
  }

  const classes = useMemo(() => [...new Set(config.map(c => c.class_name))].sort(), [config]);
  const classSubjects = useMemo(() => config.filter(c => c.class_name === selClass), [config, selClass]);

  function updateAnswer(key, field, val) {
    setAnswers(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val } }));
  }

  async function handleSubmitFeedback(e) {
    e.preventDefault();
    setMsg('');
    if (!settings.isOpen) return setMsg('Feedback submission is currently closed.');
    if (settings.accessCode && enteredCode.trim() !== settings.accessCode) {
      return setMsg('Access code is incorrect.');
    }
    if (!selClass) return setMsg('Please select a class.');
    if (revealName && !studentName.trim()) return setMsg('Enter your name or choose Anonymous.');

    setSubmitting(true);
    const tokHash = await hashToken(getBrowserToken() + '|' + selClass + '|' + settings.cycle);

    const { data: existing } = await supabase
      .from('feedback_responses')
      .select('subject')
      .eq('cycle_name', settings.cycle)
      .eq('class_name', selClass)
      .eq('token_hash', tokHash);

    const doneSubjects = new Set((existing || []).map(x => x.subject));
    const idText = revealName && studentName.trim() ? studentName.trim().slice(0, 60) : 'Anonymous';

    const rows = [];
    let skipped = 0;
    classSubjects.forEach(item => {
      const k = `${item.subject}|${item.teacher_name}`;
      const a = answers[k] || {};
      const rating = a.rating ? Number(a.rating) : null;
      const liked = (a.liked || '').trim().slice(0, 1000);
      const improve = (a.improve || '').trim().slice(0, 1000);
      const other = (a.other || '').trim().slice(0, 1000);
      if (!rating && !liked && !improve && !other) return;
      if (doneSubjects.has(item.subject)) { skipped++; return; }
      rows.push({
        cycle_name: settings.cycle,
        class_name: selClass,
        subject: item.subject,
        teacher_name: item.teacher_name,
        rating,
        liked,
        improve,
        other,
        identity: idText,
        token_hash: tokHash
      });
    });

    if (rows.length === 0) {
      setSubmitting(false);
      return setMsg(skipped > 0
        ? 'You already submitted feedback for these subjects in this cycle.'
        : 'Please provide at least one rating or comment.');
    }

    const { error } = await supabase.from('feedback_responses').insert(rows);
    setSubmitting(false);
    if (error) return setMsg('Error: ' + error.message);

    setAnswers({});
    setMsg(`Saved feedback for ${rows.length} subject(s). Thank you!` + (skipped ? ` (${skipped} already submitted)` : ''));
    if (isAdmin || isTeacher) loadAll();
  }

  async function handleAddConfig(e) {
    e.preventDefault();
    if (!cfgClass.trim() || !cfgSubject.trim() || !cfgTeacher.trim()) return;
    const { data, error } = await supabase
      .from('feedback_config')
      .insert([{ class_name: cfgClass.trim(), subject: cfgSubject.trim(), teacher_name: cfgTeacher.trim() }])
      .select()
      .single();
    if (error) return setMsg('Error: ' + error.message);
    setConfig(prev => [...prev, data]);
    setCfgSubject('');
    setCfgTeacher('');
    setMsg('Subject mapping added!');
  }

  async function handleDeleteConfig(id) {
    setConfig(prev => prev.filter(c => c.id !== id));
    await supabase.from('feedback_config').delete().eq('id', id);
  }

  async function saveSettings() {
    const upserts = [
      { key: 'fb_access_code', value: settings.accessCode.trim() },
      { key: 'fb_cycle', value: settings.cycle.trim() || 'Term 1' },
      { key: 'fb_open', value: String(settings.isOpen) }
    ];
    const { error } = await supabase.from('app_settings').upsert(upserts, { onConflict: 'key' });
    setMsg(error ? 'Error: ' + error.message : 'Feedback settings updated!');
  }

  async function handleDeleteResponse(id) {
    if (!window.confirm('Delete this feedback entry?')) return;
    setResponses(prev => prev.filter(r => r.id !== id));
    await supabase.from('feedback_responses').delete().eq('id', id);
  }

  // Filtered responses for Reports / Teacher View
  const visibleResponses = useMemo(() => {
    let list = responses.filter(r => r.cycle_name === settings.cycle);
    if (isTeacher && !isAdmin) {
      const myName = (user?.name || '').toLowerCase();
      list = list.filter(r => (r.teacher_name || '').toLowerCase().includes(myName));
    } else {
      if (filterTeacher !== 'ALL') list = list.filter(r => r.teacher_name === filterTeacher);
      if (filterClass !== 'ALL') list = list.filter(r => r.class_name === filterClass);
    }
    return list;
  }, [responses, settings.cycle, isTeacher, isAdmin, user, filterTeacher, filterClass]);

  const summaryByTeacher = useMemo(() => {
    const map = {};
    visibleResponses.forEach(r => {
      const k = `${r.teacher_name}|${r.class_name}|${r.subject}`;
      if (!map[k]) map[k] = { teacher: r.teacher_name, cls: r.class_name, subject: r.subject, sum: 0, rated: 0, total: 0 };
      map[k].total++;
      if (r.rating) { map[k].sum += r.rating; map[k].rated++; }
    });
    return Object.values(map).sort((a, b) => a.teacher.localeCompare(b.teacher));
  }, [visibleResponses]);

  const teachersList = useMemo(() => [...new Set(responses.map(r => r.teacher_name))].sort(), [responses]);

  function exportCSV() {
    const headers = ['Date', 'Cycle', 'Class', 'Subject', 'Teacher', 'Rating', 'Liked', 'Improve', 'Other', 'Identity'];
    const rows = visibleResponses.map(r => [
      new Date(r.created_at).toLocaleDateString('en-IN'), r.cycle_name, r.class_name, r.subject,
      r.teacher_name, r.rating || '', r.liked || '', r.improve || '', r.other || '', r.identity || 'Anonymous'
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Feedback_Report_${settings.cycle}.csv`;
    a.click();
  }

  function copyWhatsAppSummary() {
    const lines = summaryByTeacher.map((s, i) =>
      `${i + 1}. *${s.teacher}* (${s.cls} - ${s.subject}): ⭐ ${s.rated ? (s.sum / s.rated).toFixed(1) : '—'}/5 (${s.total} responses)`
    );
    const text = `📊 *FEEDBACK SUMMARY (${settings.cycle})*\n\n${lines.join('\n') || 'No feedback yet.'}`;
    navigator.clipboard.writeText(text);
    setMsg('WhatsApp summary copied!');
  }

  return (
    <div style={{ padding: 14, maxWidth: 680, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={onBack} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, cursor: 'pointer', display: 'flex' }}>
          <ChevronLeft size={18} />
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Student Feedback</h2>
          <div style={{ fontSize: 11, color: '#64748b' }}>Active Cycle: <b>{settings.cycle}</b> • {settings.isOpen ? 'Open' : 'Closed'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: '#f1f5f9', padding: 4, borderRadius: 12 }}>
        <button onClick={() => setTab('submit')} style={{ flex: 1, padding: 9, borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: tab === 'submit' ? '#2e44d2' : 'transparent', color: tab === 'submit' ? '#fff' : '#475569' }}>
          Submit
        </button>
        {(isAdmin || isTeacher) && (
          <button onClick={() => setTab('reports')} style={{ flex: 1, padding: 9, borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: tab === 'reports' ? '#2e44d2' : 'transparent', color: tab === 'reports' ? '#fff' : '#475569' }}>
            {isAdmin ? 'Reports' : 'My Feedback'}
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setTab('setup')} style={{ flex: 1, padding: 9, borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: tab === 'setup' ? '#2e44d2' : 'transparent', color: tab === 'setup' ? '#fff' : '#475569' }}>
            Setup
          </button>
        )}
      </div>

      {msg && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#eef2ff', color: '#1e3a8a', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* TAB 1: SUBMIT FEEDBACK */}
      {tab === 'submit' && (
        <form onSubmit={handleSubmitFeedback} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={15} color="#16a34a" />
              Anonymous selected cheythaal teachers-inu ningale thirichariyaan kazhiyilla.
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Class</label>
              <select value={selClass} onChange={e => { setSelClass(e.target.value); setAnswers({}); }} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: '#fff' }}>
                <option value="">-- Select Class --</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {settings.accessCode && !codeVerified && (
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="password" value={enteredCode} onChange={e => setEnteredCode(e.target.value)} placeholder="Enter Access Code" style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }} />
                <button type="button" onClick={() => enteredCode.trim() === settings.accessCode ? setCodeVerified(true) : setMsg('Wrong access code')} style={{ padding: '0 14px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Verify</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, fontSize: 13, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={!revealName} onChange={() => setRevealName(false)} /> Anonymous
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={revealName} onChange={() => setRevealName(true)} /> Show my name
              </label>
            </div>

            {revealName && (
              <input type="text" value={studentName} onChange={e => setStudentName(e.target.value)} maxLength={60} placeholder="Enter your name" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }} />
            )}
          </div>

          {selClass && codeVerified && classSubjects.map(item => {
            const k = `${item.subject}|${item.teacher_name}`;
            const a = answers[k] || {};
            return (
              <div key={item.id} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{item.subject}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#2e44d2' }}>{item.teacher_name}</div>
                </div>

                {/* 5-Star Rating */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginRight: 4 }}>Rating:</span>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => updateAnswer(k, 'rating', n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <Star size={22} fill={(a.rating || 0) >= n ? '#f59e0b' : 'none'} color={(a.rating || 0) >= n ? '#f59e0b' : '#cbd5e1'} />
                    </button>
                  ))}
                  {a.rating && <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706' }}>{a.rating}/5</span>}
                </div>

                <textarea rows={2} value={a.liked || ''} onChange={e => updateAnswer(k, 'liked', e.target.value)} placeholder="What did you like? (Ishtappettath)" style={{ padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5, fontFamily: 'inherit' }} />
                <textarea rows={2} value={a.improve || ''} onChange={e => updateAnswer(k, 'improve', e.target.value)} placeholder="What needs improvement? (Mechappeduthendath)" style={{ padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5, fontFamily: 'inherit' }} />
                <textarea rows={2} value={a.other || ''} onChange={e => updateAnswer(k, 'other', e.target.value)} placeholder="Other suggestions (Optional)" style={{ padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5, fontFamily: 'inherit' }} />
              </div>
            );
          })}

          {selClass && codeVerified && classSubjects.length > 0 && (
            <button type="submit" disabled={submitting} style={{ padding: 13, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          )}
        </form>
      )}

      {/* TAB 2: REPORTS & TEACHER VIEW */}
      {tab === 'reports' && (isAdmin || isTeacher) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)} style={{ flex: 1, padding: 9, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                <option value="ALL">All Teachers</option>
                {teachersList.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ flex: 1, padding: 9, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                <option value="ALL">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={copyWhatsAppSummary} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Copy size={13} /> WA Summary
              </button>
              <button onClick={exportCSV} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Download size={13} /> CSV
              </button>
            </div>
          )}

          {/* Summary Cards */}
          <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: '#0f172a' }}>Rating Summary ({settings.cycle})</div>
            {summaryByTeacher.length === 0 ? (
              <div style={{ fontSize: 12, color: '#64748b' }}>No responses yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {summaryByTeacher.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.teacher}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{s.cls} • {s.subject} ({s.total} responses)</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#d97706', background: '#fef3c7', padding: '4px 9px', borderRadius: 8 }}>
                      ⭐ {s.rated ? (s.sum / s.rated).toFixed(1) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Individual Comments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleResponses.map(r => (
              <div key={r.id} style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#2e44d2' }}>
                    {r.teacher_name} • {r.class_name} ({r.subject})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {r.rating && <span style={{ fontSize: 11, fontWeight: 800, color: '#d97706' }}>⭐ {r.rating}/5</span>}
                    {isAdmin && (
                      <button onClick={() => handleDeleteResponse(r.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 2 }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {r.liked && <div style={{ fontSize: 12, color: '#166534', marginBottom: 3 }}><b>Liked:</b> {r.liked}</div>}
                {r.improve && <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 3 }}><b>Improve:</b> {r.improve}</div>}
                {r.other && <div style={{ fontSize: 12, color: '#334155', marginBottom: 3 }}><b>Other:</b> {r.other}</div>}
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>
                  — {r.identity || 'Anonymous'} • {new Date(r.created_at).toLocaleDateString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ADMIN SETUP */}
      {tab === 'setup' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Feedback Settings</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={settings.cycle} onChange={e => setSettings({ ...settings, cycle: e.target.value })} placeholder="Cycle (e.g. Term 1)" style={{ flex: 1, padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }} />
              <input value={settings.accessCode} onChange={e => setSettings({ ...settings, accessCode: e.target.value })} placeholder="Access Code (Optional)" style={{ flex: 1, padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }} />
            </div>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={settings.isOpen} onChange={e => setSettings({ ...settings, isOpen: e.target.checked })} /> Feedback Portal Open for Students
            </label>
            <button onClick={saveSettings} style={{ padding: 10, borderRadius: 9, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save Settings</button>
          </div>

          <form onSubmit={handleAddConfig} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Add Class – Subject – Teacher</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <input list="fb-class-list" value={cfgClass} onChange={e => setCfgClass(e.target.value)} placeholder="Select/Type Class" style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <datalist id="fb-class-list">{allClasses.map(c => <option key={c} value={c} />)}</datalist>
              <input value={cfgSubject} onChange={e => setCfgSubject(e.target.value)} placeholder="Subject" style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <input list="fb-staff-list" value={cfgTeacher} onChange={e => setCfgTeacher(e.target.value)} placeholder="Select/Type Teacher" style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <datalist id="fb-staff-list">{allStaff.map(t => <option key={t} value={t} />)}</datalist>
            </div>
            <button type="submit" style={{ padding: 9, borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+ Add Mapping</button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
              {config.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12 }}>
                  <span><b>{c.class_name}</b> — {c.subject} ({c.teacher_name})</span>
                  <button type="button" onClick={() => handleDeleteConfig(c.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
