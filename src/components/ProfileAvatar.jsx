import React, { useState, useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ProfileAvatar({ user, size = 48 }) {
  const [avatar, setAvatar] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const userKey = `${user?.role || 'user'}_${user?.id || user?.staff_id || user?.name || 'default'}`.toLowerCase();

  useEffect(() => {
    loadAvatar();
  }, [userKey]);

  async function loadAvatar() {
    const { data } = await supabase
      .from('user_avatars')
      .select('avatar_data')
      .eq('user_key', userKey)
      .maybeSingle();
    if (data?.avatar_data) setAvatar(data.avatar_data);
    else setAvatar(null);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        // Compress & square-crop to 160x160px (zero lag)
        const canvas = document.createElement('canvas');
        const dim = 160;
        canvas.width = dim;
        canvas.height = dim;
        const ctx = canvas.getContext('2d');
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, dim, dim);

        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        setAvatar(compressed);

        await supabase
          .from('user_avatars')
          .upsert({ user_key: userKey, avatar_data: compressed }, { onConflict: 'user_key' });

        setUploading(false);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  const initials = (user?.name || 'NH').slice(0, 2).toUpperCase();

  return (
    <div
      onClick={() => fileRef.current?.click()}
      title="Change Profile Photo"
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#e0e7ff',
        color: '#2e44d2',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: size * 0.36,
        cursor: 'pointer',
        overflow: 'hidden',
        border: '2px solid rgba(255,255,255,0.6)',
        flexShrink: 0
      }}
    >
      {avatar ? (
        <img src={avatar} alt="DP" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span>{initials}</span>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#1e293b',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          opacity: uploading ? 0.5 : 0.9
        }}
      >
        <Camera size={10} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}