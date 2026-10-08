import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Login from './components/Login';
import Navbar from './components/Navbar';
import ContactsTab from './components/ContactsTab';
import PricesTab from './components/PricesTab';
import { Bot, RefreshCw } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('contacts');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: 'var(--bg-primary)'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 25px rgba(37, 99, 235, 0.45)'
        }}>
          <Bot size={30} color="#fff" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          <RefreshCw size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
          Iniciando Consola Dialogflow...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Collapsible Sidebar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} user={user} />

      {/* Main Workspace Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        {/* Top Header Bar */}
        <header style={{
          height: '52px',
          background: 'var(--bg-topbar)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Proyecto:</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc' }}>CAD Bot &bull; cadbot-ba2a8</span>
            <span className="badge badge-live">
              <span className="pulse-dot"></span>
              En Vivo
            </span>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
            Google Dialogflow Architecture Edition &bull; WPPConnect / Baileys
          </div>
        </header>

        {/* View Content */}
        <main style={{ flex: 1, overflowX: 'hidden' }}>
          {activeTab === 'contacts' && <ContactsTab />}
          {activeTab === 'prices' && <PricesTab />}
        </main>
      </div>
    </div>
  );
}
