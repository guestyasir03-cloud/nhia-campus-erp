import { useState, useEffect } from 'react';
import { supabase } from './supabase';

// Memory cache for zero-lag switching between modules
let cachedData = null;

export function clearClassAccessCache() {
  cachedData = null;
}

export function useClassAccess(user) {
  const isAdmin = ['admin', 'coordinator'].includes(user?.role);
  const [allClasses, setAllClasses] = useState(cachedData?.classes || []);
  const [classTeachers, setClassTeachers] = useState(cachedData?.classTeachers || []);
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    if (cachedData) return;
    (async () => {
      const [{ data: st }, { data: ct }] = await Promise.all([
        supabase.from('students').select('class_name'),
        supabase.from('class_teachers').select('*').order('class_name')
      ]);

      const cls = [...new Set((st || []).map(d => d.class_name).filter(Boolean))]
        .filter(c => c !== 'ALUMNI')
        .sort();
      const teachers = ct || [];

      cachedData = { classes: cls, classTeachers: teachers };
      setAllClasses(cls);
      setClassTeachers(teachers);
      setLoading(false);
    })();
  }, []);

  const uId = String(user?.staff_id || user?.id || '').trim().toLowerCase();
  const uName = String(user?.name || '').trim().toLowerCase();

  const allowedClasses = isAdmin
    ? allClasses
    : classTeachers
        .filter(ct => {
          const ctId = String(ct.staff_id || '').trim().toLowerCase();
          const ctName = String(ct.staff_name || '').trim().toLowerCase();
          return (uId && ctId === uId) || (uName && ctName === uName);
        })
        .map(ct => ct.class_name);

  return {
    isAdmin,
    allClasses,
    allowedClasses,
    classTeachers,
    isClassTeacher: isAdmin || allowedClasses.length > 0,
    loading
  };
}