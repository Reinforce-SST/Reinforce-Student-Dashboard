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

const getInitialDiscordId = () => (
  new URLSearchParams(window.location.search).get('discord_id')?.trim() || ''
);

export default function App() {
  // Auth state
  const [authUser, setAuthUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(Boolean(isFirebaseConfigured && auth));

  // Verification & Linking state
  const [discordId] = useState(getInitialDiscordId);
  const [status, setStatus] = useState('idle'); // 'idle' | 'signing-in' | 'verifying' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState(null);

  // Active dashboard tab
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'events' | 'projects' | 'profile'
  
  // Link Discord modal / input inside dashboard
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [manualDiscordInput, setManualDiscordInput] = useState(getInitialDiscordId);

  // Edit Profile Form state
  const [skillInput, setSkillInput] = useState('');
  const [profileForm, setProfileForm] = useState({
    skills: ['Python', 'FastAPI', 'React'],
    github: '',
    linkedin: '',
    kaggle: ''
  });
  const [profileSaveStatus, setProfileSaveStatus] = useState('');

  // Fallback Dev test modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [testEmail, setTestEmail] = useState('student@sst.scaler.com');
  const [testName, setTestName] = useState('Arya Sharma');

  // 1. Fetch or Sync User Profile with Backend API
  const syncUserProfile = useCallback(async (token, fallbackUser = null) => {
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
          if (data.skills) {
            setProfileForm(prev => ({
              ...prev,
              skills: data.skills || [],
              github: data.social_links?.github || '',
              linkedin: data.social_links?.linkedin || '',
              kaggle: data.social_links?.kaggle || ''
            }));
          }
          return data;
        }
      }
    } catch (err) {
      console.warn('Backend sync failed, using client session:', err);
    }

    // Fallback if backend is offline
    if (fallbackUser) {
      const localProfile = {
        email: fallbackUser.email,
        full_name: fallbackUser.displayName || 'SST Student',
        avatar_url: fallbackUser.photoURL,
        discord_id: null,
        is_verified: false,
        skills: ['Python', 'FastAPI', 'React'],
        social_links: {}
      };
      setUserProfile(localProfile);
      return localProfile;
    }
    return null;
  }, []);

  // 2. Link Discord Account through the authenticated dashboard backend.
  const linkDiscordAccount = useCallback(async (targetId, token, user, fallbackEmail = '') => {
    const idToLink = targetId.trim();
    if (!idToLink || !/^\d+$/.test(idToLink)) {
      setStatus('error');
      setErrorMessage('Please enter a valid numeric Discord User ID (snowflake).');
      return;
    }

    setStatus('verifying');
    setErrorMessage('');

    const email = user?.email || fallbackEmail;

    if (!token) {
      setStatus('error');
      setErrorMessage('Sign in before linking your Discord account.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/users/verify-discord`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ discord_id: idToLink })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || `Backend server returned status ${response.status}`);
      }

      setSuccessData({
        ...data,
        email,
        discord_id: idToLink,
        role_granted: data.role_granted || 'Verified Member'
      });

      if (data.user) {
        setUserProfile(data.user);
      } else {
        setUserProfile(prev => ({
          ...prev,
          discord_id: idToLink,
          is_verified: true
        }));
      }

      setStatus('success');
      setShowLinkModal(false);
    } catch (backendErr) {
      console.warn(`[Verification] Backend (${API_BASE_URL}) attempt:`, backendErr.message);
      setStatus('error');
      setErrorMessage(backendErr.message);
    }
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
        const isSstDomain = email.endsWith('@sst.scaler.com') || email.endsWith('@scaler.com');
        if (!isSstDomain) {
          await signOut(auth);
          setStatus('error');
          setErrorMessage(`Access Restricted: (${email}) is not an SST college email.`);
          return;
        }

        const token = await user.getIdToken();
        setAuthToken(token);
        setAuthUser(user);

        const savedDiscordId = sessionStorage.getItem('pending_discord_id') || discordId;
        if (savedDiscordId) {
          sessionStorage.removeItem('pending_discord_id');
          await linkDiscordAccount(savedDiscordId, token, user);
        } else {
          await syncUserProfile(token, user);
        }
      }
    }).catch((err) => {
      console.warn('Redirect auth check notice:', err.message);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthUser(user);
        try {
          const token = await user.getIdToken();
          setAuthToken(token);
          await syncUserProfile(token, user);
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
  }, [syncUserProfile, discordId, linkDiscordAccount]);

  // 4. Handle Direct Google Sign In (with Popup + Automatic Redirect Fallback for Zen/Opera)
  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    
    if (!isFirebaseConfigured || !auth) {
      setShowConfigModal(true);
      return;
    }

    if (discordId) {
      sessionStorage.setItem('pending_discord_id', discordId);
    }

    setStatus('signing-in');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const email = (user.email || '').toLowerCase().trim();

      const isSstDomain = email.endsWith('@sst.scaler.com') || email.endsWith('@scaler.com');
      if (!isSstDomain) {
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

      // If a discord_id is present in URL/state, link it immediately!
      if (discordId) {
        await linkDiscordAccount(discordId, token, user);
      } else {
        await syncUserProfile(token, user);
        setStatus('idle');
      }
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
      setUserProfile(prev => ({ ...prev, discord_id: null, is_verified: false }));
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/users/unlink-discord`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.user);
      }
    } catch (err) {
      console.error('Error unlinking:', err);
    }
  };

  // 6. Save Profile Settings
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSaveStatus('saving');

    try {
      if (authToken) {
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
        if (res.ok) {
          const data = await res.json();
          setUserProfile(data);
          setProfileSaveStatus('saved');
          setTimeout(() => setProfileSaveStatus(''), 3000);
          return;
        }
      }

      // Local state fallback
      setUserProfile(prev => ({
        ...prev,
        skills: profileForm.skills,
        social_links: {
          github: profileForm.github,
          linkedin: profileForm.linkedin,
          kaggle: profileForm.kaggle
        }
      }));
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
    setStatus('idle');
    setErrorMessage('');
    setSuccessData(null);
  };

  // Simulated login for offline / dev mode
  const handleSimulatedDevLogin = async (e) => {
    e.preventDefault();
    const email = testEmail.trim().toLowerCase();
    if (!email.endsWith('@sst.scaler.com') && !email.endsWith('@scaler.com')) {
      setErrorMessage('Test email must end with @sst.scaler.com or @scaler.com');
      return;
    }

    const simUser = {
      email: email,
      displayName: testName.trim() || 'SST Student',
      photoURL: null,
      getIdToken: async () => 'simulated_dev_token'
    };

    setAuthUser(simUser);
    setAuthToken('simulated_dev_token');
    
    if (discordId) {
      await linkDiscordAccount(discordId, 'simulated_dev_token', simUser);
    } else {
      setUserProfile({
        email: email,
        full_name: simUser.displayName,
        avatar_url: null,
        discord_id: null,
        is_verified: false,
        skills: ['Python', 'FastAPI', 'Machine Learning'],
        social_links: {}
      });
      setShowConfigModal(false);
      setStatus('idle');
    }
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
  // FLOW 2: Discord Bot Verification Success Screen
  // ----------------------------------------------------
  if (status === 'success' && successData) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px'
      }}>
        <div className="glass-panel animate-fade-in" style={{
          width: '100%',
          maxWidth: '480px',
          padding: '36px 32px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(35, 165, 90, 0.15)',
            border: '1px solid rgba(35, 165, 90, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto',
            color: '#57f287'
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>
            Verification Complete!
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>
            Your SST Google account has been linked. YUVI Bot has granted your member role on Discord.
          </p>

          <div style={{
            background: 'rgba(13, 17, 28, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            textAlign: 'left',
            marginBottom: '24px',
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>SST Account:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{successData.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Discord ID:</span>
              <span style={{ color: '#8fa3ff', fontFamily: 'monospace', fontWeight: 600 }}>{successData.discord_id}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Role Granted:</span>
              <span style={{ color: '#57f287', fontWeight: 700 }}>{successData.role_granted || 'Verified Member'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button 
              onClick={() => {
                setStatus('idle');
                setSuccessData(null);
                // Clear url query param to cleanly enter dashboard
                window.history.replaceState({}, document.title, window.location.pathname);
                setDiscordId('');
              }}
              className="btn-primary"
              style={{ width: '100%', padding: '12px' }}
            >
              🚀 Continue to Student Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // FLOW 2A: Logged In User with Discord ID in URL -> Prompt Link Confirmation
  // ----------------------------------------------------
  if (authUser && discordId && (!userProfile?.discord_id || userProfile.discord_id !== discordId)) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px'
      }}>
        <div className="glass-panel animate-fade-in" style={{
          width: '100%',
          maxWidth: '460px',
          padding: '36px 32px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'rgba(88, 101, 242, 0.15)',
            border: '1px solid rgba(88, 101, 242, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            color: '#5865f2',
            fontSize: '24px'
          }}>
            🔗
          </div>

          <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>
            Connect Discord Account
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginBottom: '20px' }}>
            You are signed in as <strong style={{ color: '#ffffff' }}>{authUser.email}</strong>. Would you like to link your Discord account?
          </p>

          <div style={{
            background: 'rgba(13, 17, 28, 0.8)',
            border: '1px solid rgba(88, 101, 242, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            marginBottom: '24px',
            textAlign: 'left',
            fontSize: '13px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Target Discord ID:</span>
              <span style={{ color: '#8fa3ff', fontFamily: 'monospace', fontWeight: 600 }}>{discordId}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Logged-in Student:</span>
              <span style={{ color: '#57f287', fontWeight: 600 }}>{authUser.displayName || 'SST Student'}</span>
            </div>
          </div>

          {status === 'error' && errorMessage && (
            <div style={{
              background: 'rgba(242, 63, 67, 0.12)',
              border: '1px solid rgba(242, 63, 67, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#ff7b72'
            }}>
              {errorMessage}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => linkDiscordAccount(discordId, authToken, authUser, testEmail)}
              disabled={status === 'verifying'}
              className="btn-primary"
              style={{ width: '100%', padding: '12px' }}
            >
              {status === 'verifying' ? 'Linking with Discord Bot...' : 'Confirm & Link Discord'}
            </button>

            <button
              onClick={() => {
                setDiscordId('');
                window.history.replaceState({}, document.title, window.location.pathname);
              }}
              className="btn-ghost"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // FLOW 1 & 2B: Logged Out View (Landing / Sign-in Card)
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

        {/* Login / Verification Card */}
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
              <span className={`pulse-badge ${discordId ? 'active' : 'active'}`}>
                <span className="pulse-dot" />
                {discordId ? 'Discord Verification Request' : 'SST Student Portal'}
              </span>
            </div>

            <h1 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '8px' }}>
              {discordId ? (
                <>Member <span className="gradient-text">Verification</span></>
              ) : (
                <>Student <span className="gradient-text">Dashboard</span></>
              )}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
              {discordId ? (
                <>Sign in with your official <strong style={{ color: '#e2e8f0' }}>@sst.scaler.com</strong> account to verify your Discord membership.</>
              ) : (
                <>Sign in with your official college Google account (<strong style={{ color: '#e2e8f0' }}>@sst.scaler.com</strong>) to access club activities, projects, and events.</>
              )}
            </p>
          </div>

          {/* If Discord ID is detected */}
          {discordId && (
            <div style={{
              background: 'rgba(13, 17, 28, 0.7)',
              border: '1px solid rgba(88, 101, 242, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginBottom: '20px'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                fontSize: '12px',
                color: 'var(--text-muted)',
                marginBottom: '4px'
              }}>
                <span>Target Discord ID</span>
                <span style={{ color: '#57f287', fontWeight: 600 }}>Detected</span>
              </div>
              <div style={{ 
                fontFamily: 'monospace', 
                fontSize: '14px', 
                color: '#8fa3ff', 
                fontWeight: 600 
              }}>
                {discordId}
              </div>
            </div>
          )}

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
              disabled={status === 'signing-in' || status === 'verifying'}
              className="btn-google"
              id="google-signin-btn"
              type="button"
            >
              {status === 'signing-in' || status === 'verifying' ? (
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
                  <span>{discordId ? 'Sign in with Google to Verify' : 'Sign in with Google'}</span>
                </>
              )}
            </button>

            {/* Offline / Developer Mode Toggle */}
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="btn-ghost"
              style={{ fontSize: '12px', marginTop: '6px' }}
            >
              🧪 Developer Test Mode / Simulate Sign-In
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

        {/* Developer Modal */}
        {showConfigModal && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 100
          }}>
            <div className="glass-panel animate-fade-in" style={{
              width: '100%',
              maxWidth: '440px',
              padding: '28px 24px'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px' }}>
                🧪 Dev Mode: Simulate Student Login
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Test the frontend dashboard and Discord verification without needing live OAuth tokens.
              </p>

              <form onSubmit={handleSimulatedDevLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Student College Email:
                  </label>
                  <input
                    type="email"
                    required
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="input-custom"
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Student Full Name:
                  </label>
                  <input
                    type="text"
                    required
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    className="input-custom"
                  />
                </div>

                {discordId && (
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Target Discord ID:
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={discordId}
                      className="input-custom"
                      style={{ color: '#8fa3ff', fontFamily: 'monospace' }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                    {discordId ? 'Simulate Link & Verify' : 'Enter Dashboard'}
                  </button>
                  <button type="button" onClick={() => setShowConfigModal(false)} className="btn-ghost">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            onClick={() => setActiveTab('events')} 
            className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          >
            🎟️ Workshops & Events
          </button>
          <button 
            onClick={() => setActiveTab('projects')} 
            className={`tab-btn ${activeTab === 'projects' ? 'active' : ''}`}
          >
            💡 Projects & Radar
          </button>
          <button 
            onClick={() => setActiveTab('profile')} 
            className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          >
            ⚙️ Profile & Skills
          </button>
        </div>

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
                      {student.discord_id ? 'Verified Member' : 'Not Connected'}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {student.discord_id ? (
                      <>Linked Snowflake ID: <span style={{ color: '#8fa3ff', fontFamily: 'monospace' }}>{student.discord_id}</span> • Server roles assigned.</>
                    ) : (
                      <>Connect your Discord account to unlock club channels, discussions, and role privileges on YUVI.</>
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
                  <button onClick={() => setShowLinkModal(true)} className="btn-primary">
                    ⚡ Connect Discord Account
                  </button>
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
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#57f287' }}>Active Member</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(0, 212, 255, 0.15)', color: '#00d4ff' }}>
                  🚀
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Registered Skills</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {profileForm.skills.length} Skills
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Club Highlights */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '14px' }}>
                  📌 Next Club Milestone
                </h3>
                <div style={{
                  background: 'rgba(13, 17, 28, 0.6)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#00d4ff', marginBottom: '6px' }}>
                    Reinforce AI Hackathon 2026
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Build multimodal AI agents with the Reinforce Club dev team. Top submissions get showcased on SST tech review!
                  </p>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '14px' }}>
                  🛠️ Developer Quick Links
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <a 
                    href="https://discord.com" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="btn-ghost" 
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    💬 Open Reinforce SST Discord Server
                  </a>
                  <button 
                    onClick={() => setActiveTab('profile')} 
                    className="btn-ghost" 
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    📝 Update Skills & Social Links
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- TAB: EVENTS & WORKSHOPS ----------------- */}
        {activeTab === 'events' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span className="tag-chip" style={{ color: '#00d4ff', borderColor: 'rgba(0, 212, 255, 0.3)' }}>Hands-on Workshop</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>This Friday, 6 PM</span>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
                Mastering LangChain & Autonomous Agents
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
                Learn how to build multi-tool agentic workflows with memory, structured outputs, and real-time execution.
              </p>
              <button className="btn-primary" style={{ width: '100%' }}>
                Register for Workshop
              </button>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span className="tag-chip" style={{ color: '#57f287', borderColor: 'rgba(35, 165, 90, 0.3)' }}>Tech Talk</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Next Week</span>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
                Scalable Backend Architecture with FastAPI
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
                Deep-dive into async event loops, connection pooling, and Firestore real-time security models.
              </p>
              <button className="btn-ghost" style={{ width: '100%' }}>
                Add to Calendar
              </button>
            </div>
          </div>
        )}

        {/* ----------------- TAB: PROJECTS & RADAR ----------------- */}
        {activeTab === 'projects' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>
                🚀 Active Club Initiatives
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  padding: '16px',
                  background: 'rgba(13, 17, 28, 0.6)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: '#ffffff' }}>YUVI Discord Bot 2.0</span>
                    <span className="tag-chip" style={{ color: '#5865f2' }}>Python • Discord.py</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Automated SST member verification, ticket resolution, and community role dispatching.
                  </p>
                </div>

                <div style={{
                  padding: '16px',
                  background: 'rgba(13, 17, 28, 0.6)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: '#ffffff' }}>Reinforce Student Portal</span>
                    <span className="tag-chip" style={{ color: '#00d4ff' }}>React • Vite • FastAPI</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Unified student identity, portfolio showcasing, and workshop access platform.
                  </p>
                </div>
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
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Manual Connect Discord Modal */}
      {showLinkModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 100
        }}>
          <div className="glass-panel animate-fade-in" style={{
            width: '100%',
            maxWidth: '440px',
            padding: '28px 24px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px' }}>
              💬 Connect Discord Account
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Enter your Discord Snowflake User ID. You can find this by enabling Developer Mode on Discord and right-clicking your profile.
            </p>

            {status === 'error' && errorMessage && (
              <div style={{
                background: 'rgba(242, 63, 67, 0.12)',
                border: '1px solid rgba(242, 63, 67, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '10px',
                marginBottom: '12px',
                fontSize: '13px',
                color: '#ff7b72'
              }}>
                {errorMessage}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Discord User ID:
              </label>
              <input
                type="text"
                placeholder="e.g. 1549547403819090011"
                value={manualDiscordInput}
                onChange={(e) => setManualDiscordInput(e.target.value.trim())}
                className="input-custom"
                style={{ fontFamily: 'monospace' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                disabled={status === 'verifying'}
                onClick={() => linkDiscordAccount(manualDiscordInput, authToken, authUser, testEmail)}
                className="btn-primary"
                style={{ flex: 1 }}
              >
                {status === 'verifying' ? 'Linking...' : 'Verify & Grant Role'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLinkModal(false);
                  setErrorMessage('');
                  setStatus('idle');
                }}
                className="btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
