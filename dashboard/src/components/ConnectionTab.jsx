import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  QrCode, Smartphone, RefreshCw, Wifi, WifiOff, CheckCircle2, 
  AlertTriangle, Copy, Check, Clock, ShieldCheck, Zap, KeyRound
} from 'lucide-react';

export default function ConnectionTab({ sessionData }) {
  const [phoneNumber, setPhoneNumber] = useState('573116584423');
  const [requestingCode, setRequestingCode] = useState(false);
  const [reloadingSession, setReloadingSession] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [, setTick] = useState(0);

  // Forzar actualización periódica para recalcular tiempos relativos ("hace X seg")
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const status = sessionData?.status || 'INITIALIZING';
  const isConnected = status === 'CONNECTED';
  const isReconnecting = status === 'RECONNECTING' || status === 'CONNECTING';
  const isRequiresAuth = status === 'REQUIRES_AUTH' || status === 'DISCONNECTED' || !!sessionData?.qrCode;

  // Formato relativo de tiempo
  const getRelativeTime = (isoString) => {
    if (!isoString) return 'Nunca';
    const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSec < 5) return 'Hace un momento';
    if (diffSec < 60) return `Hace ${diffSec} segundos`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    return `Hace ${diffHours} h`;
  };

  // Solicitar Código de Vinculación de 8 dígitos
  const handleRequestPairingCode = async () => {
    const clean = phoneNumber.trim().replace(/\D/g, '');
    if (clean.length < 8) {
      alert('Por favor ingresa un número de teléfono válido con código de país (ej. 573136303477).');
      return;
    }
    setRequestingCode(true);
    setActionMessage('Enviando solicitud de código al bot...');
    try {
      await setDoc(doc(db, 'config', 'bot_session_commands'), {
        action: 'REQUEST_PAIRING_CODE',
        phone: clean,
        timestamp: Date.now()
      });
      setActionMessage('Solicitud enviada. Esperando código generado por WhatsApp Web...');
      setTimeout(() => setActionMessage(null), 8000);
    } catch (err) {
      console.error(err);
      alert('Error enviando comando: ' + err.message);
    } finally {
      setTimeout(() => setRequestingCode(false), 3000);
    }
  };

  // Forzar Recarga de Sesión (page.reload() en Chromium)
  const handleForceReload = async () => {
    setReloadingSession(true);
    setActionMessage('Ordenando a Chromium recargar la página para reanudar sesión...');
    try {
      await setDoc(doc(db, 'config', 'bot_session_commands'), {
        action: 'FORCE_RELOAD',
        timestamp: Date.now()
      });
      setTimeout(() => {
        setReloadingSession(false);
        setActionMessage(null);
      }, 6000);
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
      setReloadingSession(false);
    }
  };

  // Forzar Reapertura de Chromium y Regeneración de QR
  const handleReopenBrowser = async () => {
    setReloadingSession(true);
    setActionMessage('Ordenando al servidor limpiar lockfiles, reabrir Chromium y regenerar el código QR...');
    try {
      await setDoc(doc(db, 'config', 'bot_session_commands'), {
        action: 'REOPEN_BROWSER',
        timestamp: Date.now()
      });
      setTimeout(() => {
        setReloadingSession(false);
        setActionMessage(null);
      }, 8000);
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
      setReloadingSession(false);
    }
  };

  // Copiar código de vinculación al portapapeles
  const handleCopyCode = () => {
    if (!sessionData?.pairingCode) return;
    navigator.clipboard.writeText(sessionData.pairingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  return (
    <div className="fade-in" style={{ maxWidth: '1080px', margin: '0 auto', padding: '24px 20px 48px 20px' }}>
      {/* Encabezado Principal */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
              Guardián Infalible 24/7
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Sincronización en Tiempo Real
            </span>
          </div>
          <h2 style={{ fontSize: '1.5rem', color: '#fff', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Smartphone size={24} color="#60a5fa" />
            Estado de Conexión & Vinculación WhatsApp
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Monitorea el socket en vivo, visualiza el código QR para revincular o solicita el código de 8 dígitos sin usar cámara.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleReopenBrowser}
            disabled={reloadingSession}
            className="btn btn-emerald"
            style={{ padding: '9px 16px', fontSize: '0.86rem' }}
            title="Limpia bloqueos, reabre el navegador Chromium y regenera un código QR nuevo inmediatamente"
          >
            <RefreshCw size={16} className={reloadingSession ? 'spin' : ''} style={reloadingSession ? { animation: 'spin 1s linear infinite' } : {}} />
            {reloadingSession ? 'Reabriendo...' : 'Reabrir Chromium & Regenerar QR'}
          </button>
          <button
            onClick={handleForceReload}
            disabled={reloadingSession}
            className="btn btn-secondary"
            style={{ padding: '9px 16px', fontSize: '0.86rem' }}
            title="Recarga la pestaña de WhatsApp Web sin reiniciar el servidor ni perder credenciales"
          >
            <RefreshCw size={16} className={reloadingSession ? 'spin' : ''} style={reloadingSession ? { animation: 'spin 1s linear infinite' } : {}} />
            {reloadingSession ? 'Recargando...' : 'Recargar Sesión (F5)'}
          </button>
        </div>
      </div>

      {actionMessage && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.15)',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          color: '#93c5fd',
          padding: '12px 16px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px'
        }}>
          <RefreshCw size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Tarjeta de Métricas y Estado en Vivo */}
      <div className="glass-panel" style={{
        padding: '24px',
        borderRadius: 'var(--radius-md)',
        marginBottom: '24px',
        borderLeft: isConnected ? '4px solid #10b981' : isReconnecting ? '4px solid #f59e0b' : '4px solid #f43f5e'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '20px',
          alignItems: 'center'
        }}>
          {/* Métrica 1: Estado General */}
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              Estado del Bot
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isConnected && (
                <span className="badge badge-live" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                  <span className="pulse-dot"></span>
                  Conectado y Operativo
                </span>
              )}
              {isReconnecting && (
                <span className="badge badge-warning" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                  <span className="pulse-dot-amber"></span>
                  Reconectando...
                </span>
              )}
              {isRequiresAuth && (
                <span className="badge badge-danger" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                  <span className="pulse-dot-red"></span>
                  Requiere Vinculación
                </span>
              )}
            </div>
          </div>

          {/* Métrica 2: Número Vinculado */}
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              Línea Anfitrión Conectada
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Smartphone size={18} color="#60a5fa" />
              {sessionData?.hostPhone ? `+${sessionData.hostPhone}` : '+573116584423'}
            </div>
          </div>

          {/* Métrica 3: Último Latido (Heartbeat) */}
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              Último Latido (Watchdog)
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} color="#34d399" />
              {getRelativeTime(sessionData?.lastHeartbeat)}
            </div>
          </div>

          {/* Métrica 4: Mensaje del Guardián */}
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              Diagnóstico en Vivo
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sessionData?.lastMessage}>
              {sessionData?.lastMessage || 'Monitoreo activo sin anomalías'}
            </div>
          </div>
        </div>
      </div>

      {/* Grid de 2 Opciones de Vinculación */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '24px',
        marginBottom: '24px'
      }}>
        {/* ======================================================== */}
        {/* OPCIÓN 1: Código QR en Vivo */}
        {/* ======================================================== */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6'
            }}>
              <QrCode size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Opción 1: Escaneo de Código QR</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                Recomendado si tienes el celular con la cámara en mano.
              </p>
            </div>
          </div>

          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 0',
            minHeight: '290px'
          }}>
            {sessionData?.qrCode ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  padding: '14px',
                  background: '#fff',
                  borderRadius: '16px',
                  display: 'inline-block',
                  boxShadow: '0 0 30px rgba(59, 130, 246, 0.35)',
                  border: '2px solid rgba(59, 130, 246, 0.5)'
                }}>
                  <img
                    src={sessionData.qrCode}
                    alt="Código QR WhatsApp"
                    style={{
                      width: '240px',
                      height: '240px',
                      display: 'block',
                      imageRendering: 'pixelated'
                    }}
                  />
                </div>
                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#60a5fa', fontSize: '0.82rem', fontWeight: 600 }}>
                  <RefreshCw size={14} className="spin" style={{ animation: 'spin 2s linear infinite' }} />
                  QR sincronizado en vivo desde el servidor
                </div>
              </div>
            ) : isConnected ? (
              <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                  boxShadow: '0 0 25px rgba(16, 185, 129, 0.3)'
                }}>
                  <CheckCircle2 size={36} />
                </div>
                <h4 style={{ color: '#fff', fontSize: '1.05rem', marginBottom: '6px' }}>¡Sesión 100% Vinculada y Activa!</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '320px', margin: '0 auto' }}>
                  No se requiere escanear ningún código QR. El bot está recibiendo y respondiendo mensajes en tiempo real.
                </p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)' }}>
                <RefreshCw size={32} className="spin" style={{ animation: 'spin 1.5s linear infinite', margin: '0 auto 12px auto' }} />
                <p style={{ fontSize: '0.88rem' }}>Generando código QR desde Chromium...</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px', marginBottom: '16px' }}>
                  Aparecerá aquí automáticamente en cuanto esté listo.
                </p>
                <button
                  onClick={handleReopenBrowser}
                  disabled={reloadingSession}
                  className="btn btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  title="Si Chromium tardó en abrirse, pulsa para forzar su reapertura"
                >
                  <RefreshCw size={14} className={reloadingSession ? 'spin' : ''} style={reloadingSession ? { animation: 'spin 1s linear infinite' } : {}} />
                  {reloadingSession ? 'Reabriendo...' : 'Forzar Reapertura de Chromium'}
                </button>
              </div>
            )}
          </div>

          {/* Instrucciones de Escaneo */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)'
          }}>
            <strong style={{ color: '#fff', display: 'block', marginBottom: '6px' }}>¿Cómo escanear en WhatsApp?</strong>
            <ol style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <li>Abre <strong>WhatsApp</strong> en tu celular.</li>
              <li>Toca <strong>Menú (⋮)</strong> en Android o <strong>Ajustes</strong> en iPhone.</li>
              <li>Selecciona <strong>Dispositivos vinculados</strong> &gt; <strong>Vincular un dispositivo</strong>.</li>
              <li>Apunta la cámara al código QR de arriba.</li>
            </ol>
          </div>
        </div>

        {/* ======================================================== */}
        {/* OPCIÓN 2: Vinculación con Código de 8 Dígitos (Sin Cámara) */}
        {/* ======================================================== */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981'
            }}>
              <KeyRound size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Opción 2: Código de 8 Dígitos (Sin Cámara)</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                Vincular introduciendo un código alfanumérico en el teléfono.
              </p>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {/* Input de Número de Teléfono */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                Número del Bot con código de país (sin símbolos ni espacios)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="ej. 573116584423"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}
                />
                <button
                  onClick={handleRequestPairingCode}
                  disabled={requestingCode}
                  className="btn btn-emerald"
                  style={{ padding: '9px 18px', fontSize: '0.86rem' }}
                >
                  <Zap size={16} />
                  {requestingCode ? 'Generando...' : 'Generar Código'}
                </button>
              </div>
            </div>

            {/* Visualización del Código si existe */}
            <div style={{
              minHeight: '140px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px',
              border: '1px dashed var(--border-subtle)',
              marginBottom: '16px'
            }}>
              {sessionData?.pairingCode ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                    Tu Código de Vinculación de WhatsApp:
                  </div>
                  <div className="pairing-box">
                    {sessionData.pairingCode}
                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <button
                      onClick={handleCopyCode}
                      className="btn btn-secondary"
                      style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                    >
                      {copiedCode ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                      {copiedCode ? '¡Copiado!' : 'Copiar Código'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  <KeyRound size={28} style={{ opacity: 0.4, margin: '0 auto 8px auto' }} />
                  <span>Haz clic en <strong>"Generar Código"</strong> para obtener tu clave de 8 dígitos.</span>
                </div>
              )}
            </div>
          </div>

          {/* Instrucciones de Código de Vinculación */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)'
          }}>
            <strong style={{ color: '#fff', display: 'block', marginBottom: '6px' }}>¿Cómo usar el código de 8 dígitos?</strong>
            <ol style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <li>Abre <strong>WhatsApp</strong> en el teléfono celular que tendrá el bot.</li>
              <li>Ve a <strong>Dispositivos vinculados</strong> &gt; <strong>Vincular un dispositivo</strong>.</li>
              <li>Toca en la parte inferior: <strong>"¿Vincular con el número de teléfono?"</strong></li>
              <li>Escribe el código alfanumérico generado arriba. ¡Listo!</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Tarjeta de Garantía y Resiliencia */}
      <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: 'rgba(16, 185, 129, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#34d399',
          flexShrink: 0
        }}>
          <ShieldCheck size={26} />
        </div>
        <div>
          <h4 style={{ color: '#fff', fontSize: '0.98rem', marginBottom: '2px' }}>
            Armadura Anti-Desconexión & Auto-Recuperación Activa
          </h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', lineHeight: '1.4' }}>
            El bot cuenta con protección contra borrado accidental de tokens (Anti-Wipe), latido proactivo Zero-Idle cada 35 segundos para prevenir estados de inactividad, backups espejo de credenciales cada 10 minutos y auto-recarga de página ante fluctuaciones de red.
          </p>
        </div>
      </div>
    </div>
  );
}
