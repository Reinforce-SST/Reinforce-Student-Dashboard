import React, { useState, useEffect, useCallback } from 'react';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged, 
  isFirebaseConfigured 
} from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
const MAIN_SITE_URL = import.meta.env.VITE_MAIN_SITE_URL || 'https://www.reinforce-sst.com';
const legacyDiscordLink = new URLSearchParams(window.location.search).has('discord_id');
const isCollegeEmail = (email) => {
  const normalized = (email || '').toLowerCase().trim();
  return normalized.endsWith('@sst.scaler.com') || normalized.endsWith('@scaler.com');
};

export default function App() {
  // Auth state
  const [authUser, setAuthUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(Boolean(isFirebaseConfigured && auth));

  // Authentication status
  const [status, setStatus] = useState('idle'); // 'idle' | 'signing-in' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  // Active dashboard tab
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'profile'
  
  // Edit Profile Form state
  const [skillInput, setSkillInput] = useState('');
  const [profileForm, setProfileForm] = useState({
    skills: [],
    github: '',
    linkedin: '',
    kaggle: ''
  });
  const [profileSaveStatus, setProfileSaveStatus] = useState('');

  // 1. Fetch or Sync User Profile with Backend API
  const syncUserProfile = useCallback(async (token) => {
    setUserProfile(null);
    setProfileForm({ skills: [], github: '', linkedin: '', kaggle: '' });
    try {
      const response = await fetch(`${API_BASE_URL}/users/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.id) {
          setUserProfile(data);
          setProfileForm(prev => ({
            ...prev,
            skills: data.skills || [],
            github: data.social_links?.github || '',
            linkedin: data.social_links?.linkedin || '',
            kaggle: data.social_links?.kaggle || ''
          }));
          return data;
        }
      }
    } catch (err) {
      console.warn('Backend sync failed:', err);
    }
    return null;
  }, []);

  // 3. Persistent Firebase Auth Listener & Redirect Result Handler
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return;
    }

    // Check for incoming redirect sign-in (for Zen/Opera/Firefox/Safari)
    getRedirectResult(auth).then(async (result) => {
      if (result?.user) {
        const user = result.user;
        const email = (user.email || '').toLowerCase().trim();
        if (!isCollegeEmail(email)) {
          await signOut(auth);
          setStatus('error');
          setErrorMessage(`Access Restricted: (${email}) is not an SST college email.`);
          return;
        }

        const token = await user.getIdToken();
        setAuthToken(token);
        setAuthUser(user);

        await syncUserProfile(token);
      }
    }).catch((err) => {
      console.warn('Redirect auth check notice:', err.message);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!isCollegeEmail(user.email)) {
          await signOut(auth);
          setStatus('error');
          setErrorMessage('Please use your SST college Google account.');
          setIsAuthLoading(false);
          return;
        }
        setAuthUser(user);
        try {
          const token = await user.getIdToken();
          setAuthToken(token);
          await syncUserProfile(token);
        } catch (err) {
          console.error('Error fetching token:', err);
        }
      } else {
        setAuthUser(null);
        setAuthToken(null);
        setUserProfile(null);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, [syncUserProfile]);

  // 4. Handle Direct Google Sign In (with Popup + Automatic Redirect Fallback for Zen/Opera)
  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    
    if (!isFirebaseConfigured || !auth) {
      setStatus('error');
      setErrorMessage('Sign-in is unavailable. Please use the main Reinforce website or contact a club admin.');
      return;
    }

    setStatus('signing-in');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const email = (user.email || '').toLowerCase().trim();

      if (!isCollegeEmail(email)) {
        await signOut(auth);
        setStatus('error');
        setErrorMessage(
          `Access Restricted: (${email}) is not an SST college email. Please use your @sst.scaler.com account.`
        );
        return;
      }

      const token = await user.getIdToken();
      setAuthToken(token);
      setAuthUser(user);

      await syncUserProfile(token);
      setStatus('idle');
    } catch (err) {
      console.warn('Google Popup failed, attempting Redirect mode:', err.code, err.message);
      
      // If popup is blocked by browser (Zen/Opera/Firefox) or cross-origin iframe storage partitioned
      const shouldFallbackToRedirect = 
        err.code === 'auth/popup-blocked' ||
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request' ||
        err.code === 'auth/internal-error' ||
        err.message?.includes('popup') ||
        err.message?.includes('Cross-Origin');

      if (shouldFallbackToRedirect) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          console.error('Redirect sign-in error:', redirectErr);
          setStatus('error');
          setErrorMessage(redirectErr.message || 'Failed to initiate Google Sign-In redirect.');
          return;
        }
      }

      setStatus('error');
      setErrorMessage(err.message || 'Google sign-in was cancelled or encountered an error.');
    }
  };

  // 5. Unlink Discord Account
  const handleUnlinkDiscord = async () => {
    if (!authToken) {
      setErrorMessage('Sign in again before unlinking Discord.');
      return;
    }

    try {
      setErrorMessage('');
      const res = await fetch(`${API_BASE_URL}/users/unlink-discord`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`Could not unlink Discord (${res.status}).`);
      const data = await res.json();
      setUserProfile(data.user);
    } catch (err) {
      console.error('Error unlinking:', err);
      setErrorMessage('Could not unlink Discord. Please retry.');
    }
  };

  // 6. Save Profile Settings
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSaveStatus('saving');

    try {
      if (!authToken) throw new Error('Sign in again to save your profile.');
      const res = await fetch(`${API_BASE_URL}/users/me`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          skills: profileForm.skills,
          social_links: {
            github: profileForm.github,
            linkedin: profileForm.linkedin,
            kaggle: profileForm.kaggle
          }
        })
      });
      if (!res.ok) throw new Error(`Profile update failed (${res.status}). Please retry.`);
      const data = await res.json();
      setUserProfile(data);
      setProfileSaveStatus('saved');
      setTimeout(() => setProfileSaveStatus(''), 3000);
    } catch (err) {
      console.error('Profile save error:', err);
      setProfileSaveStatus('error');
    }
  };

  const handleAddSkill = (e) => {
    e.preventDefault();
    if (skillInput.trim() && !profileForm.skills.includes(skillInput.trim())) {
      setProfileForm(prev => ({
        ...prev,
        skills: [...prev.skills, skillInput.trim()]
      }));
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setProfileForm(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skillToRemove)
    }));
  };

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
    }
    setAuthUser(null);
    setAuthToken(null);
    setUserProfile(null);
    setProfileForm({ skills: [], github: '', linkedin: '', kaggle: '' });
    setStatus('idle');
    setErrorMessage('');
  };

  // ----------------------------------------------------
  // RENDER: Loading Screen
  // ----------------------------------------------------
  if (isAuthLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(88, 101, 242, 0.2)',
            borderTopColor: 'var(--accent-blurple)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px auto'
          }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Loading Reinforce Student Dashboard...
          </p>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Logged-out sign-in card
  // ----------------------------------------------------
  if (!authUser) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        position: 'relative'
      }}>
        {/* Brand Header */}
        <header style={{
          position: 'absolute',
          top: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #5865f2, #00d4ff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '18px'
          }}>
            ⚡
          </div>
          <span style={{ 
            fontFamily: 'var(--font-display)', 
            fontWeight: 700, 
            fontSize: '16px',
            letterSpacing: '0.05em',
            color: '#e2e8f0'
          }}>
            REINFORCE SST
          </span>
        </header>

        {/* Login card */}
        <main className="glass-panel" style={{
          width: '100%',
          maxWidth: '460px',
          padding: '36px 32px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Top glow accent */}
          <div style={{
            position: 'absolute',
            top: '-40px',
            right: '-40px',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(88, 101, 242, 0.4) 0%, transparent 70%)',
            pointerEvents: 'none'
          }} />

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '26px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px'
            }}>
              <span className="pulse-badge active">
                <span className="pulse-dot" />
                SST Student Portal
              </span>
            </div>

            <h1 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '8px' }}>
              Student <span className="gradient-text">Dashboard</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
              Sign in with your official <strong style={{ color: '#e2e8f0' }}>@sst.scaler.com</strong> account to access your profile.
            </p>
          </div>

          {legacyDiscordLink && <p role="alert" style={{ color: '#f0c95b', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
            This Discord link is outdated. Run /auth in the club server and open YUVI&apos;s new private link. <a href={MAIN_SITE_URL}>Open the main site</a>.
          </p>}

          {/* Error Message */}
          {status === 'error' && errorMessage && (
            <div className="animate-fade-in" style={{
              background: 'rgba(242, 63, 67, 0.12)',
              border: '1px solid rgba(242, 63, 67, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff7b72" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div style={{ fontSize: '13px', color: '#ff7b72', lineHeight: 1.4 }}>
                {errorMessage}
              </div>
            </div>
          )}

          {/* Sign In Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={handleGoogleSignIn}
              disabled={status === 'signing-in'}
              className="btn-google"
              id="google-signin-btn"
              type="button"
            >
              {status === 'signing-in' ? (
                <>
                  <div style={{
                    width: '18px',
                    height: '18px',
                    border: '2px solid rgba(0,0,0,0.2)',
                    borderTopColor: '#1e293b',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  <span>Connecting to Google...</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </button>

          </div>

          {/* Footer */}
          <div style={{
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--text-muted)'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#57f287" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Official Reinforce Club SST Authentication</span>
          </div>
        </main>

      </div>
    );
  }

  // ----------------------------------------------------
  // FULL STUDENT DASHBOARD (Logged In View)
  // ----------------------------------------------------
  const student = userProfile || {
    email: authUser.email,
    full_name: authUser.displayName || 'SST Student',
    avatar_url: authUser.photoURL,
    discord_id: null,
    is_verified: false,
    skills: profileForm.skills,
    social_links: {}
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation Bar */}
      <header className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #5865f2, #00d4ff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '18px'
          }}>
            ⚡
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', letterSpacing: '0.04em' }}>
              REINFORCE <span className="gradient-text">CLUB</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Scaler School of Technology
            </div>
          </div>
        </div>

        {/* User Badge & Actions */}
        <div className="dashboard-account" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="dashboard-identity" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {student.avatar_url ? (
              <img 
                src={student.avatar_url} 
                alt="Avatar" 
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid rgba(88, 101, 242, 0.5)' }} 
              />
            ) : (
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(88, 101, 242, 0.2)',
                border: '1px solid rgba(88, 101, 242, 0.4)',
                color: '#8fa3ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '14px'
              }}>
                {student.full_name?.charAt(0) || 'S'}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {student.full_name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {student.email}
              </span>
            </div>
          </div>

          <button onClick={handleSignOut} className="btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Dashboard Body */}
      <div className="dashboard-container">
        {/* Navigation Tabs */}
        <div className="dashboard-tabs">
          <button 
            onClick={() => setActiveTab('overview')} 
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          >
            📊 Overview
          </button>
          <button 
            onClick={() => setActiveTab('profile')} 
            className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          >
            ⚙️ Profile & Skills
          </button>
        </div>

        {!userProfile && <p role="alert" style={{ color: '#f0c95b', fontSize: '13px' }}>
          Your profile could not be loaded. Refresh the page or use the <a href={MAIN_SITE_URL}>main club site</a>.
        </p>}
        {errorMessage && <p role="alert" style={{ color: '#ff7b72', fontSize: '13px' }}>{errorMessage}</p>}

        {/* ----------------- TAB: OVERVIEW ----------------- */}
        {activeTab === 'overview' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Discord Connection Status Banner */}
            <div className="glass-panel" style={{
              padding: '24px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              borderLeft: student.discord_id ? '4px solid #57f287' : '4px solid #5865f2'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  background: student.discord_id ? 'rgba(35, 165, 90, 0.15)' : 'rgba(88, 101, 242, 0.15)',
                  border: student.discord_id ? '1px solid rgba(35, 165, 90, 0.3)' : '1px solid rgba(88, 101, 242, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px'
                }}>
                  {student.discord_id ? '🛡️' : '💬'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: 700 }}>
                      Discord Integration
                    </h3>
                    <span className={`pulse-badge ${student.discord_id ? 'active' : 'warning'}`}>
                      <span className="pulse-dot" />
                      {student.discord_id ? 'Linked' : 'Not linked'}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {student.discord_id ? (
                      <>Discord account linked: <span style={{ color: '#8fa3ff', fontFamily: 'monospace' }}>{student.discord_id}</span>.</>
                    ) : (
                      <>Run /auth in the club Discord to link your account through YUVI.</>
                    )}
                  </p>
                </div>
              </div>

              <div>
                {student.discord_id ? (
                  <button onClick={handleUnlinkDiscord} className="btn-ghost" style={{ color: '#ff7b72', borderColor: 'rgba(242, 63, 67, 0.3)' }}>
                    Unlink Discord
                  </button>
                ) : (
                  <a href={MAIN_SITE_URL} className="btn-primary">
                    Open main site
                  </a>
                )}
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(88, 101, 242, 0.15)', color: '#5865f2' }}>
                  🎓
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Affiliation</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>SST Scaler</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(35, 165, 90, 0.15)', color: '#57f287' }}>
                  ✨
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Club Status</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#57f287' }}>{student.is_member ? 'Member' : 'Student'}</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(0, 212, 255, 0.15)', color: '#00d4ff' }}>
                  🚀
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Registered Skills</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {student.skills?.length || 0} Skills
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '14px' }}>
                Continue on the main club website
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <a href={`${MAIN_SITE_URL}/dashboard/events`} className="btn-ghost">
                  View club events
                </a>
                <a href={`${MAIN_SITE_URL}/dashboard/spg`} className="btn-ghost">
                  Explore project groups
                </a>
                <button onClick={() => setActiveTab('profile')} className="btn-ghost">
                  Update profile
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- TAB: PROFILE & SKILLS ----------------- */}
        {activeTab === 'profile' && (
          <div className="glass-panel animate-fade-in" style={{ padding: '28px', maxWidth: '640px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              ⚙️ Student Profile & Skills
            </h3>

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  College Email
                </label>
                <input
                  type="text"
                  readOnly
                  value={student.email}
                  className="input-custom"
                  style={{ opacity: 0.7, cursor: 'not-allowed' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  readOnly
                  value={student.full_name}
                  className="input-custom"
                  style={{ opacity: 0.7, cursor: 'not-allowed' }}
                />
              </div>

              {/* Skills Editor */}
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Tech Stack & Skills
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  {profileForm.skills.map((skill, idx) => (
                    <span key={idx} className="tag-chip" style={{ background: 'rgba(88, 101, 242, 0.2)', borderColor: 'rgba(88, 101, 242, 0.4)', color: '#ffffff' }}>
                      {skill}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveSkill(skill)}
                        style={{ background: 'transparent', border: 'none', color: '#ff7b72', cursor: 'pointer', marginLeft: '4px', fontSize: '12px' }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Add a skill (e.g. PyTorch, Docker, Next.js)"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    className="input-custom"
                  />
                  <button type="button" onClick={handleAddSkill} className="btn-ghost" style={{ flexShrink: 0 }}>
                    + Add
                  </button>
                </div>
              </div>

              {/* Social Links */}
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  GitHub Profile URL
                </label>
                <input
                  type="text"
                  placeholder="https://github.com/username"
                  value={profileForm.github}
                  onChange={(e) => setProfileForm({ ...profileForm, github: e.target.value })}
                  className="input-custom"
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  LinkedIn Profile URL
                </label>
                <input
                  type="text"
                  placeholder="https://linkedin.com/in/username"
                  value={profileForm.linkedin}
                  onChange={(e) => setProfileForm({ ...profileForm, linkedin: e.target.value })}
                  className="input-custom"
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Kaggle Profile URL
                </label>
                <input
                  type="text"
                  placeholder="https://kaggle.com/username"
                  value={profileForm.kaggle}
                  onChange={(e) => setProfileForm({ ...profileForm, kaggle: e.target.value })}
                  className="input-custom"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                <button type="submit" disabled={profileSaveStatus === 'saving'} className="btn-primary">
                  {profileSaveStatus === 'saving' ? 'Saving...' : '💾 Save Profile Settings'}
                </button>
                {profileSaveStatus === 'saved' && (
                  <span style={{ color: '#57f287', fontSize: '13px' }}>✓ Saved successfully!</span>
                )}
                {profileSaveStatus === 'error' && (
                  <span role="alert" style={{ color: '#ff7b72', fontSize: '13px' }}>Could not save your profile. Please retry.</span>
                )}
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Inline Keyframe Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
