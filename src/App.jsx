import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  FileText, Calendar, Users, Wallet, Star, BookOpen, Award,
  Briefcase, Bell, BarChart3, Sliders, Home, User, ChevronLeft,
  LogOut, Building, Library, Plus, X
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { flushOfflineQueue, getOfflineQueue } from './lib/offlineCache';
const StudentsModule = lazy(() => import('./modules/StudentsModule'));
const ExamsModule = lazy(() => import('./modules/ExamsModule'));
const ExamClearanceModule = lazy(() => import('./modules/ExamClearanceModule'));
const AttendanceModule = lazy(() => import('./modules/AttendanceModule'));
const FinanceModule = lazy(() => import('./modules/FinanceModule'));
const ActivityModule = lazy(() => import('./modules/ActivityModule'));
const SyllabusModule = lazy(() => import('./modules/SyllabusModule'));
const StaffAppraisalModule = lazy(() => import('./modules/StaffAppraisalModule'));
const AnnouncementsModule = lazy(() => import('./modules/AnnouncementsModule'));
const StaffModule = lazy(() => import('./modules/StaffModule'));
const UserPasswordsPanel = lazy(() => import('./components/UserPasswordsPanel'));
const ReportsModule = lazy(() => import('./modules/ReportsModule'));
const LeaveModule = lazy(() => import('./modules/LeaveModule'));
const FeedbackModule = lazy(() => import('./modules/FeedbackModule'));
const GadgetRegistryModule = lazy(() => import('./modules/GadgetRegistryModule'));
const ChangePasswordBox = lazy(() => import('./components/ChangePasswordBox'));
const TeacherCurrentWeekCard = lazy(() => import('./components/TeacherCurrentWeekCard'));
const YearResetPanel = lazy(() => import('./components/YearResetPanel'));
const ICON_MAP = {
  FileText, Calendar, Users, Wallet, Star, BookOpen, Award,
  Briefcase, Bell, BarChart3, Sliders, Library, Building
};

const DEFAULT_ROLES = ['admin', 'coordinator', 'teacher', 'student'];

const DEFAULT_MODULES = [
  { id: 'feedback', name: 'Feedback', icon: 'Star', visible_roles: ['admin', 'coordinator', 'teacher', 'student'], is_active: true },
  { id: 'examinations', name: 'Examinations', icon: 'FileText', visible_roles: ['admin', 'coordinator', 'teacher', 'student'], is_active: true },
  { id: 'exam_clearance', name: 'Exam Clearance', icon: 'FileText', visible_roles: ['admin', 'coordinator', 'teacher', 'student'], is_active: true },
  { id: 'attendance', name: 'Attendance', icon: 'Calendar', visible_roles: ['admin', 'coordinator', 'teacher', 'student'], is_active: true },
  { id: 'leave', name: 'Leave Portal', icon: 'Calendar', visible_roles: ['admin', 'coordinator', 'teacher', 'student'], is_active: true },
    { id: 'gadgets', name: 'Gadget Registry', icon: 'Calendar', visible_roles: ['admin', 'coordinator', 'teacher', 'student'], is_active: true },
  { id: 'students', name: 'Students', icon: 'Users', visible_roles: ['admin', 'coordinator', 'teacher'], is_active: true },
  { id: 'finance', name: 'Finance', icon: 'Wallet', visible_roles: ['admin', 'coordinator', 'teacher', 'student'], is_active: true },
  { id: 'activity', name: 'Activity Points', icon: 'Star', visible_roles: ['admin', 'coordinator', 'teacher', 'student'], is_active: true },
  { id: 'syllabus', name: 'Syllabus', icon: 'BookOpen', visible_roles: ['admin', 'coordinator', 'teacher', 'student'], is_active: true },
  { id: 'appraisal', name: 'Staff Appraisal', icon: 'Award', visible_roles: ['admin', 'coordinator', 'teacher'], is_active: true },
  { id: 'staff', name: 'Staff', icon: 'Briefcase', visible_roles: ['admin', 'coordinator'], is_active: true },
  { id: 'announcements', name: 'Announcements', icon: 'Bell', visible_roles: ['admin', 'coordinator', 'teacher', 'student'], is_active: true },
  { id: 'reports', name: 'Reports', icon: 'BarChart3', visible_roles: ['admin', 'coordinator'], is_active: true },
  { id: 'settings', name: 'Settings', icon: 'Sliders', visible_roles: ['admin'], is_active: true },
  { id: 'library', name: 'Library', icon: 'Library', visible_roles: ['admin', 'teacher', 'student'], is_active: false },
  { id: 'hostel', name: 'Hostel', icon: 'Building', visible_roles: ['admin', 'teacher', 'student'], is_active: false },
];

const SUB_MENUS = {
  exam_clearance: ['14-item clearance', 'Bulk clear', 'Dues & remarks', 'Hall ticket ready', 'A4 print form'],
  examinations: ['Mark entry (W1–W4)', 'Hifz / Midterm entry', 'Class reports', 'Campus performance', 'Pending mark entry', 'Grade cards (PDF)'],
  attendance: ['Monthly register', 'Class-wise attendance', 'Attendance percentage', 'Pending alerts', 'Campus analysis'],
  students: ['Student directory', 'Add student', 'Admission numbers', 'Student profile', 'Bulk import'],
  finance: ['Student ledger', 'Class ledger', 'Donation entry', 'Monthly collection (Apr–Mar)', 'Financial reports'],
  activity: ['Single entry', 'Class-wise bulk entry', 'Reasons and categories', 'Class ranking', 'Discipline report']
};

function LazyFallback() {
  return (
    <div style={{ padding: 16, maxWidth: 740, margin: '0 auto' }}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ height: 14, width: '42%', borderRadius: 6, background: '#e2e8f0' }} />
        <div style={{ height: 38, width: '100%', borderRadius: 10, background: '#f1f5f9' }} />
        <div style={{ height: 38, width: '100%', borderRadius: 10, background: '#f1f5f9' }} />
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nhia_logged_user') || 'null'); } catch { return null; }
  });
  const [rolePreview, setRolePreview] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nhia_logged_user') || 'null')?.role || 'admin'; } catch { return 'admin'; }
  });
  const [activeTab, setActiveTab] = useState('home');
  const [activeModule, setActiveModule] = useState(null);
  // Mobile & Computer Back button support (Zero-Lag)
  const isPoppingRef = useRef(false);

  useEffect(() => {
    const handlePopState = (event) => {
      isPoppingRef.current = true;
      setActiveModule(event.state?.module || null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (isPoppingRef.current) {
      isPoppingRef.current = false;
      return;
    }
    if (activeModule) {
      if (window.history.state?.module !== activeModule) {
        window.history.pushState({ module: activeModule }, '', `#${activeModule}`);
      }
    } else if (window.history.state?.module) {
      window.history.back();
    }
  }, [activeModule]);
  const [modules, setModules] = useState(DEFAULT_MODULES);
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [newRoleName, setNewRoleName] = useState('');
  const [stats, setStats] = useState(() => {
    try {
      const cached = localStorage.getItem('nhia_dashboard_stats');
      if (cached) return JSON.parse(cached);
    } catch {}
    return { students: 0, staff: 0, attendance: '—' };
  });
  const [newModName, setNewModName] = useState('');
  const [academicYear, setAcademicYear] = useState('2026–27');
  const [resetting, setResetting] = useState(false);

  // Academy Logo State
  const [academyLogo, setAcademyLogo] = useState(null);
  const logoInputRef = useRef(null);

  // Login State
  const [loginMode, setLoginMode] = useState('staff');
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loading, setLoading] = useState(false);

  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => getOfflineQueue().length);

  useEffect(() => {
    const syncNow = async () => {
      setIsOnline(navigator.onLine);
      setPendingSyncCount(getOfflineQueue().length);
      if (navigator.onLine && isSupabaseConfigured && supabase) {
        const res = await flushOfflineQueue(supabase);
        setPendingSyncCount(res.remaining);
      }
    };
    const onOnline = () => { syncNow(); };
    const onOffline = () => { setIsOnline(false); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (navigator.onLine) syncNow();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);



  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      const todayStr = new Date().toLocaleDateString('en-CA');
      const [
        { data: modData },
        { count: stCount },
        { count: sfCount },
        { data: settingsData },
        { data: logoData },
        { data: todayAtt },
        { count: activeOutCount }
      ] = await Promise.all([
        supabase.from('portal_modules').select('*').order('sort_order'),
        supabase.from('students').select('*', { count: 'exact', head: true }),
        supabase.from('staff').select('*', { count: 'exact', head: true }),
        supabase.from('app_settings').select('key, value').in('key', ['academic_year', 'portal_roles']),
        supabase.from('user_avatars').select('avatar_data').eq('user_key', 'academy_logo').maybeSingle(),
        supabase.from('spot_attendance').select('status').eq('session_date', todayStr),
        supabase.from('student_leaves').select('*', { count: 'exact', head: true }).neq('status', 'Returned').lte('start_date', todayStr)
      ]);

      if (modData && modData.length > 0) {
        const existingIds = new Set(modData.map(m => m.id));
        const missingDefaults = DEFAULT_MODULES.filter(m => !existingIds.has(m.id));
        const merged = [...modData, ...missingDefaults];
        merged.sort((a, b) => (a.id === 'settings' ? 1 : b.id === 'settings' ? -1 : 0));
        setModules(merged);
      }
      let livePct = '100%';
      if (stCount > 0) {
        const presentEst = Math.max(0, stCount - (activeOutCount || 0));
        livePct = Math.round((presentEst / stCount) * 100) + '%';
      }
      setStats(prev => {
        const next = {
          ...prev,
          students: stCount ?? prev.students,
          staff: sfCount ?? prev.staff,
          attendance: livePct
        };
        try { localStorage.setItem('nhia_dashboard_stats', JSON.stringify(next)); } catch {}
        return next;
      });

      (settingsData || []).forEach(s => {
        if (s.key === 'academic_year' && s.value) setAcademicYear(s.value);
        if (s.key === 'portal_roles' && s.value) {
          try {
            const parsed = JSON.parse(s.value);
            if (Array.isArray(parsed) && parsed.length > 0) setRoles(parsed);
          } catch {}
        }
      });

      if (logoData?.avatar_data) setAcademyLogo(logoData.avatar_data);
    })();
  }, []);

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const dim = 160;
        canvas.width = dim;
        canvas.height = dim;
        const ctx = canvas.getContext('2d');
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, dim, dim);

        const compressed = canvas.toDataURL('image/png');
        setAcademyLogo(compressed);

        await supabase
          .from('user_avatars')
          .upsert({ user_key: 'academy_logo', avatar_data: compressed }, { onConflict: 'user_key' });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginErr('');
    setLoading(true);

    try {
      if (loginMode === 'staff') {
        const { data: staff, error } = await supabase
          .from('staff')
          .select('*')
          .eq('staff_id', loginId.trim())
          .eq('pin', loginPass.trim())
          .maybeSingle();
       if (error || !staff) throw new Error('Staff ID-യോ PIN-ഓ തെറ്റാണ്!');
        const role = (staff.role || 'teacher').toLowerCase();
        const u = { id: staff.staff_id, name: staff.name, role, type: 'staff' };
        localStorage.setItem('nhia_logged_user', JSON.stringify(u));
        const creds = JSON.parse(localStorage.getItem('nhia_offline_creds') || '{}');
        creds[`staff_${loginId.trim()}`] = { pin: loginPass.trim(), user: u };
        localStorage.setItem('nhia_offline_creds', JSON.stringify(creds));
        setUser(u);
        setRolePreview(role);
      } else {
        const { data: st, error } = await supabase
          .from('students')
          .select('*')
          .eq('adm_no', loginId.trim())
          .eq('pin', loginPass.trim())
          .maybeSingle();
        if (error || !st) throw new Error('അഡ്മിഷൻ നമ്പറോ PIN-ഓ തെറ്റാണ്!');
        const u = { id: st.adm_no, name: st.name, role: 'student', class_name: st.class_name, type: 'student' };
        localStorage.setItem('nhia_logged_user', JSON.stringify(u));
        const creds = JSON.parse(localStorage.getItem('nhia_offline_creds') || '{}');
        creds[`student_${loginId.trim()}`] = { pin: loginPass.trim(), user: u };
        localStorage.setItem('nhia_offline_creds', JSON.stringify(creds));
        setUser(u);
        setRolePreview('student');
      }
    } catch (err) {
      // Offline fallback login using previously saved credentials
      const creds = JSON.parse(localStorage.getItem('nhia_offline_creds') || '{}');
      const saved = creds[`${loginMode}_${loginId.trim()}`];
      if (!navigator.onLine && saved && saved.pin === loginPass.trim()) {
        localStorage.setItem('nhia_logged_user', JSON.stringify(saved.user));
        setUser(saved.user);
        setRolePreview(saved.user.role);
      } else {
        setLoginErr(!navigator.onLine ? 'ഓഫ്‌ലൈനിൽ കയറാൻ ആദ്യം ഒരിക്കൽ ഓൺലൈനിൽ ലോഗിൻ ചെയ്യണം!' : err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  // Optimistic toggle for module ON/OFF
  function toggleModule(mod) {
    if (mod.id === 'settings') return alert('Settings module cannot be disabled.');
    const nextActive = !mod.is_active;
    setModules(prev => prev.map(m => m.id === mod.id ? { ...m, is_active: nextActive } : m));
    if (isSupabaseConfigured) {
      supabase.from('portal_modules').update({ is_active: nextActive }).eq('id', mod.id).then();
    }
  }

  // Optimistic toggle for Role/Category visibility per module (Zero Lag)
  function toggleModuleRole(mod, roleKey) {
    if (mod.id === 'settings' && roleKey === 'admin') return;
    const current = Array.isArray(mod.visible_roles) ? mod.visible_roles : [];
    const updatedRoles = current.includes(roleKey)
      ? current.filter(r => r !== roleKey)
      : [...current, roleKey];

    setModules(prev => prev.map(m => m.id === mod.id ? { ...m, visible_roles: updatedRoles } : m));
    if (isSupabaseConfigured) {
      supabase.from('portal_modules').update({ visible_roles: updatedRoles }).eq('id', mod.id).then();
    }
  }

  // Add new Category/Role (e.g. warden, accountant, librarian)
  function addNewRole(e) {
    e.preventDefault();
    const clean = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!clean || roles.includes(clean)) return;
    const nextRoles = [...roles, clean];
    setRoles(nextRoles);
    setNewRoleName('');
    if (isSupabaseConfigured) {
      supabase.from('app_settings').upsert({ key: 'portal_roles', value: JSON.stringify(nextRoles) }).then();
    }
  }

  function removeCustomRole(roleKey) {
    if (DEFAULT_ROLES.includes(roleKey)) return;
    const nextRoles = roles.filter(r => r !== roleKey);
    setRoles(nextRoles);
    if (rolePreview === roleKey) setRolePreview('admin');
    if (isSupabaseConfigured) {
      supabase.from('app_settings').upsert({ key: 'portal_roles', value: JSON.stringify(nextRoles) }).then();
    }
  }

  async function addNewModule(e) {
    e.preventDefault();
    if (!newModName.trim()) return;
    const id = newModName.trim().toLowerCase().replace(/\s+/g, '_');
    const newMod = {
      id,
      name: newModName.trim(),
      icon: 'Sliders',
      visible_roles: ['admin', 'teacher', 'student'],
      is_active: true,
      sort_order: modules.length + 1
    };
    setModules(prev => [...prev, newMod]);
    setNewModName('');
    if (isSupabaseConfigured) {
      await supabase.from('portal_modules').insert(newMod);
    }
  }

  async function handleYearChange(newYear) {
    setAcademicYear(newYear);
    if (isSupabaseConfigured) {
      await supabase.from('app_settings').upsert({ key: 'academic_year', value: newYear });
    }
  }

  async function handleYearReset() {
    const confirmText = window.prompt(
      `WARNING: ${academicYear}-ലെ പഴയ Attendance, Marks, Finance, Activity, Announcements ഡാറ്റയെല്ലാം ഡിലീറ്റ് ആകും!\n\nകൺഫേം ചെയ്യാൻ "RESET" എന്ന് ടൈപ്പ് ചെയ്യുക:`
    );
    if (confirmText !== 'RESET') return;

    setResetting(true);
    try {
      const tablesToReset = ['attendance', 'exams', 'marks', 'finance', 'activity_points', 'announcements'];
      for (const tbl of tablesToReset) {
        await supabase.from(tbl).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      alert('പഴയ ഡാറ്റയെല്ലാം റീസെറ്റ് ആയി! ഇനി പുതിയ Academic Year സെലക്ട് ചെയ്യാം.');
    } catch (err) {
      alert('Reset error: ' + err.message);
    } finally {
      setResetting(false);
    }
  }

  const formatRoleLabel = r => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // LOGIN SCREEN
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 10px 30px rgba(37,99,235,0.08)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2e44d2', letterSpacing: 0.3 }}>Welcome to</div>
            <div style={{ fontWeight: 800, fontSize: 21, color: '#0f172a', marginTop: 2 }}>Noorul Hidaya</div>
            <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 16 }}>Islamic Academy • Campus ERP</div>
            <div style={{ width: 96, height: 96, borderRadius: 22, background: '#2e44d2', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 28, overflow: 'hidden', boxShadow: '0 8px 20px rgba(46,68,210,0.16)', border: '2px solid #e2e8f0' }}>
              {academyLogo ? <img src={academyLogo} alt="NH" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'NH'}
            </div>
          </div>

          <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 12, marginBottom: 20 }}>
            <button type="button" onClick={() => setLoginMode('staff')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', background: loginMode === 'staff' ? '#fff' : 'transparent', color: loginMode === 'staff' ? '#2e44d2' : '#64748b', boxShadow: loginMode === 'staff' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none' }}>
              Staff / Admin
            </button>
            <button type="button" onClick={() => setLoginMode('student')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', background: loginMode === 'student' ? '#fff' : 'transparent', color: loginMode === 'student' ? '#2e44d2' : '#64748b', boxShadow: loginMode === 'student' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none' }}>
              Student / Parent
            </button>
          </div>

          <form onSubmit={handleLogin} autoComplete="on" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="nhia-username" style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                {loginMode === 'staff' ? 'Staff ID' : 'Admission Number'}
              </label>
              <input
                id="nhia-username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={loginId}
                onChange={e => setLoginId(e.target.value)}
                placeholder={loginMode === 'staff' ? 'Enter Staff ID' : 'Enter Admission No'}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 6, fontSize: 14 }}
              />
            </div>
            <div>
              <label htmlFor="nhia-password" style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                {loginMode === 'staff' ? 'Password / PIN' : 'PIN'}
              </label>
              <input
                id="nhia-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                placeholder="••••••••"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 6, fontSize: 14 }}
              />
            </div>

            {loginErr && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 10, borderRadius: 8, fontSize: 13 }}>{loginErr}</div>}

            <button type="submit" disabled={loading} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const currentRole = user.role === 'admin' ? rolePreview : user.role;
  const visibleModules = modules.filter(m => m.is_active && (m.visible_roles || []).includes(currentRole));

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 80, maxWidth: 520, margin: '0 auto', background: '#f4f6fc' }}>
      {/* TOP HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', background: '#f4f6fc', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            onClick={() => user.role === 'admin' && logoInputRef.current?.click()}
            title={user.role === 'admin' ? 'Click to change Academy Logo' : 'Noorul Hidaya'}
            style={{
              width: 38, height: 38, borderRadius: 10, background: '#2e44d2', color: '#fff',
              display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14,
              overflow: 'hidden', cursor: user.role === 'admin' ? 'pointer' : 'default', flexShrink: 0
            }}
          >
            {academyLogo ? <img src={academyLogo} alt="NH" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'NH'}
          </div>
          {user.role === 'admin' && (
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', lineHeight: 1.2 }}>Noorul Hidaya</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Islamic Academy</div>
          </div>
        </div>

        {user.role === 'admin' ? (
          <select
            value={rolePreview}
            onChange={e => { setRolePreview(e.target.value); setActiveModule(null); }}
            style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, fontWeight: 600, color: '#1e293b' }}
          >
            {roles.map(r => (
              <option key={r} value={r}>{r === 'admin' ? 'Super Admin' : formatRoleLabel(r)}</option>
            ))}
          </select>
        ) : (
          <span style={{ padding: '6px 12px', borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
            {formatRoleLabel(user.role)}
          </span>
        )}
      </header>

      <main style={{ padding: '4px 18px 20px' }}>
        <Suspense fallback={<LazyFallback />}>
          {activeModule === 'students' ? (
          <StudentsModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'examinations' ? (
          <ExamsModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'exam_clearance' ? (
          <ExamClearanceModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'attendance' ? (
          <AttendanceModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'leave' ? (
          <LeaveModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'gadgets' ? (
          <GadgetRegistryModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'feedback' ? (
          <FeedbackModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'finance' ? (
          <FinanceModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'activity' ? (
          <ActivityModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'syllabus' ? (
          <SyllabusModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'appraisal' ? (
          <StaffAppraisalModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'announcements' ? (
          <AnnouncementsModule onBack={() => setActiveModule(null)} user={user} />
        ) : activeModule === 'staff' ? (
          <StaffModule onBack={() => setActiveModule(null)} />
        ) : activeModule === 'reports' ? (
          <ReportsModule onBack={() => setActiveModule(null)} />
       ) : activeModule === 'settings' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setActiveModule(null)} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <ChevronLeft size={20} />
              </button>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Settings</h2>
            </div>

            {/* ACADEMIC YEAR SELECTOR */}
            <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 10 }}>Academic Year</div>
              <select value={academicYear} onChange={e => handleYearChange(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 600 }}>
                <option value="2025–26">2025–26</option>
                <option value="2026–27">2026–27</option>
                <option value="2027–28">2027–28</option>
                <option value="2028–29">2028–29</option>
                <option value="2029–30">2029–30</option>
          </select>
            </div>

            {/* USER PASSWORDS & RESET (ADMIN ONLY) */}
            <UserPasswordsPanel user={user} />

            {/* ADVANCED SYSTEM RESET */}
            <YearResetPanel user={user} />

            {/* USER CATEGORIES / ROLES MANAGER */}

            {/* USER CATEGORIES / ROLES MANAGER */}
            <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 10 }}>User Categories (Roles)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {roles.map(r => (
                  <span key={r} style={{ fontSize: 12, fontWeight: 600, background: '#eef2ff', color: '#2e44d2', padding: '5px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {formatRoleLabel(r)}
                    {!DEFAULT_ROLES.includes(r) && (
                      <X size={13} style={{ cursor: 'pointer', color: '#dc2626' }} onClick={() => removeCustomRole(r)} />
                    )}
                  </span>
                ))}
              </div>
              <form onSubmit={addNewRole} style={{ display: 'flex', gap: 8 }}>
                <input
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  placeholder="Add category (e.g. Warden, Accountant)"
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
                <button type="submit" style={{ padding: '0 14px', borderRadius: 10, border: 'none', background: '#1e293b', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={14} /> Add
                </button>
              </form>
            </div>

            {/* MODULE MANAGER WITH ROLE CHIPS */}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 10 }}>Module Manager & Access</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {modules.map(mod => {
                const Icon = ICON_MAP[mod.icon] || Sliders;
                const activeRoles = Array.isArray(mod.visible_roles) ? mod.visible_roles : [];
                return (
<div key={mod.id} style={{ background: '#fff', padding: '14px 16px', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef2ff', color: '#2e44d2', display: 'grid', placeItems: 'center' }}>
                          <Icon size={17} />
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{mod.name}</div>
                      </div>
                      <button
                        onClick={() => toggleModule(mod)}
                        style={{
                          width: 44, height: 24, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative',
                          background: mod.is_active ? '#2e44d2' : '#cbd5e1', transition: '0.2s',
                          opacity: mod.id === 'settings' ? 0.5 : 1
                        }
                        }
                      >
                        <span style={{
                          position: 'absolute', top: 3, left: mod.is_active ? 23 : 3,
                          width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: '0.2s'
                        }} />
                      </button>
                    </div>

                    {/* ROLE ACCESS CHIPS */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {roles.map(r => {
                        const enabled = activeRoles.includes(r);
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => toggleModuleRole(mod, r)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 8,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: enabled ? '1px solid #2e44d2' : '1px solid #e2e8f0',
                              background: enabled ? '#2e44d2' : '#f8fafc',
                              color: enabled ? '#fff' : '#64748b'
                            }}
                          >
                            {formatRoleLabel(r)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={addNewModule} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <input
                value={newModName}
                onChange={e => setNewModName(e.target.value)}
                placeholder="New module name"
                style={{ flex: 1, padding: '11px 14px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14 }}
              />
              <button type="submit" style={{ padding: '0 18px', borderRadius: 12, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Add module
              </button>
            </form>
          </div>
        ) : activeModule ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <button onClick={() => setActiveModule(null)} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <ChevronLeft size={20} />
              </button>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>
                {modules.find(m => m.id === activeModule)?.name}
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(SUB_MENUS[activeModule] || ['Overview', 'Manage Records', 'Reports']).map(item => {
                const modObj = modules.find(m => m.id === activeModule);
                const Icon = ICON_MAP[modObj?.icon] || FileText;
                return (
                  <button
                    key={item}
                    onClick={() => alert(`${item} - അടുത്ത ഘട്ടത്തിൽ ഈ പേജ് കണക്ട് ചെയ്യാം!`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', padding: '14px 16px', borderRadius: 14, border: '1px solid #e2e8f0', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eef2ff', color: '#2e44d2', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Icon size={18} />
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{item}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : activeTab === 'account' ? (
          <div style={{ background: '#fff', padding: 22, borderRadius: 18, border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginBottom: 12 }}>My Account</h3>
            <p style={{ fontSize: 14, color: '#475569', marginBottom: 6 }}><b>Name:</b> {user.name}</p>
            <p style={{ fontSize: 14, color: '#475569', marginBottom: 18 }}><b>Role:</b> {formatRoleLabel(currentRole)}</p>
            <ChangePasswordBox user={user} />
            <button
              onClick={async () => { localStorage.removeItem('nhia_logged_user'); if (isSupabaseConfigured && navigator.onLine) await supabase.auth.signOut(); setUser(null); setActiveTab('home'); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 12, borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        ) : activeTab === 'notices' ? (
          <div style={{ background: '#fff', padding: 22, borderRadius: 18, border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginBottom: 12 }}>Campus Notices</h3>
            <p style={{ fontSize: 13, color: '#64748b' }}>പ്രത്യേക അറിയിപ്പുകൾ ഇവിടെ കാണാം.</p>
          </div>
        ) : (
          /* HOME SCREEN */
          <>
            <div style={{ background: '#2e44d2', color: '#fff', borderRadius: 18, padding: '22px 20px', marginBottom: 14, boxShadow: '0 8px 20px rgba(46,68,210,0.2)' }}>
              <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 4 }}>Welcome</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{user.name}</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Academic Year {academicYear}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <div style={{ background: '#fff', padding: '14px 12px', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{stats.students}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Students</div>
              </div>
              <div style={{ background: '#fff', padding: '14px 12px', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{stats.staff}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Staff</div>
              </div>
              <div style={{ background: '#fff', padding: '14px 12px', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{stats.attendance}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Present today</div>
              </div>
            </div>
            {user?.role === 'teacher' && <TeacherCurrentWeekCard user={user} onOpenSyllabus={() => setActiveModule('syllabus')} />}



            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {visibleModules.map(mod => {
                const Icon = ICON_MAP[mod.icon] || FileText;
                return (
                  <button
                    key={mod.id}
                    onClick={() => setActiveModule(mod.id)}
                    style={{
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '18px 8px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(15,23,42,0.03)'
                    }}
                  >
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eef2ff', color: '#2e44d2', display: 'grid', placeItems: 'center' }}>
                      <Icon size={20} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', textAlign: 'center', lineHeight: 1.2 }}>
                      {mod.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        </Suspense>
      </main>

      {/* BOTTOM NAVIGATION */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 520, background: '#fff', borderTop: '1px solid #e2e8f0',
        display: 'flex', justifyContent: 'space-around', padding: '10px 0', zIndex: 30
      }}>
        {[
          { id: 'home', label: 'Home', icon: Home },
          { id: 'notices', label: 'Notices', icon: Bell },
          { id: 'account', label: 'Account', icon: User }
        ].map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id && !activeModule;
          return (
      <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setActiveModule(null); }}
              style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: active ? '#2e44d2' : '#64748b', fontWeight: active ? 700 : 500, fontSize: 11 }}
            >
              <Icon size={20} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
