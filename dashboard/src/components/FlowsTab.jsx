import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, CheckCircle2, MessageSquare, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';

export default function FlowsTab() {
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeMessageKey, setActiveMessageKey] = useState('bienvenidaRegistrado');

  const fetchFlows = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, 'config', 'bot_flows');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setMessages(snap.data());
      }
    } catch (err) {
      console.error('Error cargando flujos de mensajes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlows();
  }, []);

  const handleChange = (key, val) => {
    setMessages((prev) => ({
      ...prev,
      [key]: val
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const docRef = doc(db, 'config', 'bot_flows');
      await setDoc(docRef, messages);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error('Error guardando mensajes:', err);
      alert('Error guardando mensajes: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <RefreshCw size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '12px' }}>Cargando flujos de conversación...</p>
      </div>
    );
  }

  if (!messages) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#fca5a5' }}>
        <AlertCircle size={32} />
        <p>No se encontraron datos en Firestore.</p>
        <button onClick={fetchFlows} className="btn btn-secondary" style={{ marginTop: '14px' }}>Reintentar</button>
      </div>
    );
  }

  const messageDefinitions = {
    bienvenidaRegistrado: {
      title: '👋 Bienvenida Cliente Conocido',
      desc: 'Mensaje enviado a un cliente cuyo nombre ya está registrado en la base de datos.',
      variables: ['{name}']
    },
    bienvenidaNuevo: {
      title: '🤖 Bienvenida Nuevo Cliente',
      desc: 'Mensaje inicial de bienvenida antes de solicitar el nombre al cliente.',
      variables: []
    },
    ubicacion: {
      title: '📍 Ubicación del Local',
      desc: 'Respuesta automática cuando el usuario pregunta por la dirección o ubicación.',
      variables: []
    },
    horarios: {
      title: '🕒 Horarios de Atención',
      desc: 'Respuesta con los horarios de apertura y cierre del negocio.',
      variables: []
    },
    soporteAsesor: {
      title: '👨‍💻 Atención Asesor Humano',
      desc: 'Mensaje que recibe el cliente al solicitar hablar con un asesor.',
      variables: []
    },
    pagoTransferencia: {
      title: '📱 Pago por Transferencia',
      desc: 'Instrucciones para transferir a Bancolombia, Nequi o Daviplata y adjuntar soporte.',
      variables: []
    },
    pagoEfectivo: {
      title: '🏢 Pago en Efectivo',
      desc: 'Aviso indicando que debe cancelar en caja para mandar a impresión.',
      variables: []
    },
    pedidoExitoso: {
      title: '🎉 Pedido Confirmado / Éxito',
      desc: 'Mensaje final cuando se valida y recibe el pedido en el bot.',
      variables: []
    }
  };

  const currentDef = messageDefinitions[activeMessageKey] || { title: activeMessageKey, desc: '', variables: [] };
  const currentText = messages[activeMessageKey] || '';

  // Render WhatsApp preview replacing variables
  const previewText = currentText.replaceAll('{name}', 'Carlos Gómez');

  return (
    <div className="fade-in" style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 16px 40px 16px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', color: '#fff' }}>Editor de Flujos & Conversaciones</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Personaliza lo que dice el bot de WhatsApp en cada etapa del chat en vivo.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {saveSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '0.9rem', fontWeight: 600 }}>
              <CheckCircle2 size={18} /> ¡Mensajes sincronizados!
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-emerald"
            style={{ padding: '10px 22px' }}
          >
            <Save size={18} />
            {saving ? 'Guardando...' : 'Guardar Mensajes'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 320px', gap: '20px', alignItems: 'start' }}>
        {/* Flow Selector Sidebar */}
        <div className="glass-panel" style={{ padding: '14px', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '10px', padding: '0 8px' }}>
            Mensajes del Bot
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {Object.entries(messageDefinitions).map(([key, def]) => (
              <button
                key={key}
                onClick={() => setActiveMessageKey(key)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: activeMessageKey === key ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  color: activeMessageKey === key ? '#60a5fa' : 'var(--text-main)',
                  fontWeight: activeMessageKey === key ? 600 : 400,
                  border: activeMessageKey === key ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  fontSize: '0.88rem'
                }}
              >
                {def.title}
              </button>
            ))}
          </div>
        </div>

        {/* Text Area Editor */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '4px' }}>
              {currentDef.title}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {currentDef.desc}
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Insertar Variable con 1 Clic:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {[
                { label: 'Nombre Cliente', code: '{name}', color: '#60a5fa' },
                { label: 'Teléfono Cliente', code: '{phone}', color: '#34d399' },
                { label: 'Total Pagar', code: '{totalPrice}', color: '#f59e0b' },
                { label: 'Servicio', code: '{itemName}', color: '#a78bfa' },
                { label: 'Nombre Bot', code: '{botName}', color: '#38bdf8' },
                { label: 'Teléfono Soporte', code: '{adminPhone}', color: '#f472b6' }
              ].map(chip => (
                <button
                  key={chip.code}
                  type="button"
                  onClick={() => handleChange(activeMessageKey, currentText + ' ' + chip.code)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    color: chip.color,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title={`Insertar ${chip.code}`}
                >
                  <span>{chip.label}</span>
                  <code style={{ opacity: 0.6, fontSize: '0.7rem' }}>{chip.code}</code>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '8px' }}>
              Contenido del Mensaje (Soporta emojis y formato WhatsApp como *negrita* o _cursiva_)
            </label>
            <textarea
              rows={10}
              value={currentText}
              onChange={(e) => handleChange(activeMessageKey, e.target.value)}
              style={{
                lineHeight: '1.5',
                fontSize: '0.95rem',
                resize: 'vertical'
              }}
            />
          </div>
        </div>

        {/* WhatsApp Mobile Simulator Preview */}
        <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ fontSize: '0.85rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '14px', textAlign: 'center' }}>
            Vista Previa en WhatsApp
          </h4>

          <div style={{
            background: '#0b141a',
            borderRadius: '16px',
            border: '2px solid rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)'
          }}>
            {/* WhatsApp Header */}
            <div style={{
              background: '#202c33',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#00a884',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 700
              }}>
                CAD
              </div>
              <div>
                <div style={{ color: '#e9edef', fontSize: '0.85rem', fontWeight: 600 }}>Cadi Asistente</div>
                <div style={{ color: '#00a884', fontSize: '0.7rem' }}>en línea</div>
              </div>
            </div>

            {/* WhatsApp Chat Body */}
            <div style={{
              padding: '16px',
              minHeight: '260px',
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
              backgroundSize: '16px 16px'
            }}>
              <div style={{
                background: '#005c4b',
                color: '#e9edef',
                padding: '10px 12px',
                borderRadius: '8px 8px 8px 2px',
                fontSize: '0.85rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: '1.4',
                boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                maxWidth: '92%'
              }}>
                {previewText || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Escribe algo para previsualizar...</span>}
                <div style={{ textAlign: 'right', fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.6)', marginTop: '4px' }}>
                  12:00 PM ✓✓
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
