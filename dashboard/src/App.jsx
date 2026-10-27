import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './components/Login';
import Navbar from './components/Navbar';
import ConnectionTab from './components/ConnectionTab';
import ContactsTab from './components/ContactsTab';
import PricesTab from './components/PricesTab';
import AdvisorsTab from './components/AdvisorsTab';
import { Bot, RefreshCw, AlertTriangle, QrCode } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('contacts');
  const [sessionData, setSessionData] = useState(null);
  const [contactsCount, setContactsCount] = useState(0);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  // Escuchar estado de conexión de WhatsApp en tiempo real desde Firestore
  useEffect(() => {
    const statusRef = doc(db, 'config', 'bot_session');
    const unsubscribeStatus = onSnapshot(statusRef, (snap) => {
      if (snap.exists()) {
        setSessionData(snap.data());
      }
    }, (err) => {
      console.warn('Error escuchando estado de sesión Firestore:', err);
    });
    return () => unsubscribeStatus();
  }, []);

  const sessionStatus = sessionData?.status || 'INITIALIZING';
  const isConnected = sessionStatus === 'CONNECTED';
  const isReconnecting = sessionStatus === 'RECONNECTING' || sessionStatus === 'CONNECTING';
  const isRequiresAuth = sessionStatus === 'REQUIRES_AUTH' || sessionStatus === 'DISCONNECTED' || !!sessionData?.qrCode;

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
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} user={user} sessionData={sessionData} contactsCount={contactsCount} />

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Proyecto:</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc' }}>CAD Bot &bull; cadbot-ba2a8</span>
            
            {/* Dynamic Real-time Status Badge */}
            {isConnected && (
              <button
                onClick={() => setActiveTab('connection')}
                className="badge badge-live"
                style={{ border: 'none', cursor: 'pointer', padding: '5px 12px' }}
                title="Ver detalles de conexión y salud del bot"
              >
                <span className="pulse-dot"></span>
                En Línea {sessionData?.hostPhone ? `(+${sessionData.hostPhone})` : ''}
              </button>
            )}
            {isReconnecting && (
              <button
                onClick={() => setActiveTab('connection')}
                className="badge badge-warning"
                style={{ border: 'none', cursor: 'pointer', padding: '5px 12px' }}
                title="Reanudando conexión con WhatsApp Web..."
              >
                <span className="pulse-dot-amber"></span>
                Reconectando...
              </button>
            )}
            {isRequiresAuth && (
              <button
                onClick={() => setActiveTab('connection')}
                className="badge badge-danger"
                style={{ border: 'none', cursor: 'pointer', padding: '5px 12px' }}
                title="Haz clic para ver el QR o solicitar código de vinculación"
              >
                <span className="pulse-dot-red"></span>
                Desconectado &bull; Vincular QR
              </button>
            )}
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
            Google Dialogflow Architecture Edition &bull; WPPConnect / Baileys
          </div>
        </header>

        {/* Banner de Advertencia si está desconectado */}
        {isRequiresAuth && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(244, 63, 94, 0.22) 0%, rgba(15, 23, 42, 0.95) 100%)',
            borderBottom: '1px solid rgba(244, 63, 94, 0.35)',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            color: '#fda4af',
            fontSize: '0.88rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={18} color="#f43f5e" style={{ flexShrink: 0 }} />
              <span>
                <strong>¡Sesión Desconectada!</strong> El Bot de WhatsApp no está respondiendo mensajes. Escanea el QR o genera un código para reanudar el servicio.
              </span>
            </div>
            <button
              onClick={() => setActiveTab('connection')}
              className="btn btn-danger"
              style={{ padding: '6px 14px', fontSize: '0.8rem', gap: '6px' }}
            >
              <QrCode size={15} />
              Vincular Ahora
            </button>
          </div>
        )}

        {/* View Content */}
        <main style={{ flex: 1, overflowX: 'hidden' }}>
          {activeTab === 'connection' && <ConnectionTab sessionData={sessionData} />}
          {activeTab === 'contacts' && <ContactsTab onCountUpdate={setContactsCount} />}
          {activeTab === 'prices' && <PricesTab />}
          {activeTab === 'advisors' && <AdvisorsTab />}
        </main>
      </div>
    </div>
  );
}
