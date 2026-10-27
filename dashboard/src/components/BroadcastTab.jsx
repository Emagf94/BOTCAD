import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, query, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Megaphone, Users, Smartphone, Send, AlertTriangle, CheckCircle2,
  Clock, Sparkles, RefreshCw, Square, Image, FileText,
  ShieldCheck, Search, Trash2
} from 'lucide-react';

const PRESET_TEMPLATES = [
  {
    id: 'promo_semanal',
    title: '🔥 Promoción de la Semana',
    description: 'Descuento especial en planos y gigantografías',
    text: '¡Hola {name}! 👋 En *CAD Impresiones* 🖨️ te deseamos una excelente semana.\n\nTe recordamos que esta semana contamos con un *20% de descuento* en impresión de planos en papel bond y fotográfico 📐✨.\n\nEscribe *hola* para enviarnos tus archivos o consultar cualquier cotización. ¡Estamos listos para atenderte!'
  },
  {
    id: 'horario_festivo',
    title: '⏰ Horario Especial / Festivo',
    description: 'Aviso sobre atención en días festivos',
    text: 'Estimado/a {name}, te saludamos de *CAD Impresiones* 🖨️.\n\nTe informamos que este fin de semana festivo atenderemos en horario especial de *8:00 AM a 2:00 PM* ⏱️.\n\nPuedes radicar tus pedidos con anticipación respondiendo a este chat. ¡Con gusto te ayudaremos!'
  },
  {
    id: 'recordatorio_archivos',
    title: '📄 Impresión Directa y Envíos',
    description: 'Recordatorio de recepción 24/7 vía WhatsApp',
    text: '¡Hola {name}! 👋 ¿Tienes proyectos o planos pendientes por imprimir?\n\nRecuerda que con nuestro asistente virtual *Cadi* puedes enviar tus archivos en *PDF, DWG o imágenes* directamente por este chat en cualquier momento 📁.\n\n¡Quedamos atentos a tus proyectos!'
  },
  {
    id: 'fidelizacion',
    title: '✨ Agradecimiento y Fidelización',
    description: 'Mensaje de agradecimiento por su preferencia',
    text: 'Hola {name}, muchas gracias por confiar en *CAD Impresiones* para tus proyectos 🖨️✨.\n\nQueremos asegurarnos de que tu experiencia haya sido excelente. Si necesitas una reimpresión o un nuevo trabajo, estamos a un mensaje de distancia.'
  }
];

export default function BroadcastTab() {
  const [contacts, setContacts] = useState([]);
  const [broadcastState, setBroadcastState] = useState(null);

  // Form State
  const [messageTemplate, setMessageTemplate] = useState(
    '¡Hola {name}! 👋 Te saludamos de *CAD Impresiones* 🖨️.\n\nTenemos nuevas promociones en impresión de planos y encuadernados para tus proyectos 📐✨.\n\nEscribe *hola* para ver nuestro catálogo completo o enviar tus archivos.'
  );
  const [mediaUrl, setMediaUrl] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(7);
  const [filterAudience, setFilterAudience] = useState('all'); // all | withName | recent | manual
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // Modal confirmación
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  const textareaRef = useRef(null);

  // 1. Escuchar contactos desde Firestore 'users'
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() });
      });
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setContacts(data);
    }, (err) => {
      console.warn('Error cargando contactos para difusión:', err);
    });
    return () => unsubscribe();
  }, []);

  // 2. Escuchar estado del bot de difusión en tiempo real desde Firestore 'config/bot_broadcast'
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'bot_broadcast'), (snap) => {
      if (snap.exists()) {
        setBroadcastState(snap.data());
      }
    }, (err) => {
      console.warn('Error escuchando bot_broadcast:', err);
    });
    return () => unsub();
  }, []);

  // Filtrado de audiencia según opción seleccionada
  const filteredRecipients = useMemo(() => {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    let list = contacts.filter(c => c.phone || c.id);

    if (filterAudience === 'withName') {
      list = list.filter(c => c.name && c.name.trim() !== '' && c.name.trim().toLowerCase() !== 'cliente');
    } else if (filterAudience === 'recent') {
      list = list.filter(c => {
        const t = c.updatedAt?.seconds ? c.updatedAt.seconds * 1000 : (c.updatedAt ? new Date(c.updatedAt).getTime() : 0);
        return t > 0 && (now - t) < thirtyDaysMs;
      });
    } else if (filterAudience === 'manual') {
      if (selectedPhones.size > 0) {
        list = list.filter(c => selectedPhones.has(c.phone || c.id));
      }
    }

    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(term) ||
        (c.phone || c.id || '').includes(term) ||
        (c.contactUser || '').toLowerCase().includes(term)
      );
    }

    return list;
  }, [contacts, filterAudience, selectedPhones, searchTerm]);

  // Cliente de ejemplo para vista previa en vivo
  const sampleClient = useMemo(() => {
    if (filteredRecipients.length > 0) return filteredRecipients[0];
    return { name: 'Carlos Mendoza', phone: '573184849332', contactUser: 'cmendoza_cad' };
  }, [filteredRecipients]);

  // Mensaje interpolado en vivo para el simulador de smartphone
  const livePreviewMessage = useMemo(() => {
    if (!messageTemplate) return '';
    const name = sampleClient.name || 'Carlos Mendoza';
    const phone = sampleClient.phone || '573184849332';
    const contactUser = sampleClient.contactUser || name;
    return messageTemplate
      .replace(/\{name\}/gi, name)
      .replace(/\{nombre\}/gi, name)
      .replace(/\{phone\}/gi, phone)
      .replace(/\{telefono\}/gi, phone)
      .replace(/\{contacto\}/gi, contactUser)
      .replace(/\{empresa\}/gi, 'CAD Impresiones')
      .replace(/\{botName\}/gi, 'Cadi');
  }, [messageTemplate, sampleClient]);

  // Insertar variable en la posición del cursor
  const handleInsertVariable = (varTag) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessageTemplate(prev => prev + varTag);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = messageTemplate;
    const updated = text.substring(0, start) + varTag + text.substring(end);
    setMessageTemplate(updated);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + varTag.length, start + varTag.length);
    }, 50);
  };

  // Cargar plantilla predefinida
  const handleSelectTemplate = (template) => {
    setMessageTemplate(template.text);
  };

  // Toggle selección manual de cliente
  const toggleSelectPhone = (phone) => {
    const next = new Set(selectedPhones);
    if (next.has(phone)) {
      next.delete(phone);
    } else {
      next.add(phone);
    }
    setSelectedPhones(next);
  };

  const isSending = broadcastState?.status === 'SENDING';
  const progressPercent = broadcastState?.progress || 0;
  const sentCount = broadcastState?.sent || 0;
  const failedCount = broadcastState?.failed || 0;
  const totalCount = broadcastState?.total || 0;
  const durationStr = broadcastState?.duration || '';
  const recentLogs = broadcastState?.logs || [];

  // Iniciar campaña masiva
  const handleStartBroadcast = async () => {
    if (filteredRecipients.length === 0) {
      setActionError('No hay destinatarios en la selección actual para enviar.');
      return;
    }
    if (!messageTemplate.trim()) {
      setActionError('El mensaje de la difusión no puede estar vacío.');
      return;
    }

    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const recipientPayload = filteredRecipients.map(c => ({
        id: c.id,
        phone: c.phone || c.id,
        name: c.name || 'Cliente',
        contactUser: c.contactUser || ''
      }));

      await setDoc(doc(db, 'config', 'bot_broadcast'), {
        action: 'START',
        actionTimestamp: Date.now(),
        campaignId: Date.now().toString(),
        template: messageTemplate.trim(),
        mediaUrl: mediaUrl.trim() || null,
        delaySeconds: Number(delaySeconds) || 7,
        selectedRecipients: recipientPayload,
        status: 'STARTING',
        total: recipientPayload.length,
        sent: 0,
        failed: 0,
        progress: 0,
        initiator: 'DASHBOARD',
        createdAt: new Date().toISOString(),
        logs: []
      }, { merge: true });

      setConfirmModalOpen(false);
      setActionSuccess(`🚀 Difusión enviada al Bot con éxito. Iniciando envíos a ${recipientPayload.length} contactos...`);
      setTimeout(() => setActionSuccess(''), 6000);
    } catch (e) {
      console.error('Error al iniciar difusión:', e);
      setActionError(`Error al despachar la campaña: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Cancelar campaña masiva activa
  const handleCancelBroadcast = async () => {
    if (!window.confirm('¿Estás seguro de que deseas detener la difusión masiva en curso?')) return;
    try {
      await setDoc(doc(db, 'config', 'bot_broadcast'), {
        action: 'CANCEL',
        actionTimestamp: Date.now(),
        status: 'CANCELLED',
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setActionSuccess('🛑 Solicitud de cancelación enviada al Bot.');
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (e) {
      console.error('Error al cancelar difusión:', e);
      alert(`Error al cancelar: ${e.message}`);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ═══ TOP HEADER & STATUS BAR ═══ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(236, 72, 153, 0.35)'
            }}>
              <Megaphone size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', margin: 0, letterSpacing: '-0.02em' }}>
                Estudio de Difusión Masiva
              </h1>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Envía mensajes personalizados y flyers a tus clientes con protección Anti-Ban y previsualización en vivo.
              </p>
            </div>
          </div>
        </div>

        {/* Live Status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isSending ? (
            <div className="badge badge-warning" style={{ padding: '7px 14px', fontSize: '0.85rem' }}>
              <span className="pulse-dot-amber"></span>
              Enviando Campaña ({sentCount}/{totalCount})
            </div>
          ) : (
            <div className="badge badge-live" style={{ padding: '7px 14px', fontSize: '0.85rem' }}>
              <span className="pulse-dot"></span>
              Motor de Difusión Listo
            </div>
          )}
        </div>
      </div>

      {/* Feedback Alerts */}
      {actionSuccess && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          color: '#34d399',
          padding: '12px 18px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.9rem'
        }}>
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.35)',
          color: '#fda4af',
          padding: '12px 18px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.9rem'
        }}>
          <AlertTriangle size={18} />
          <span>{actionError}</span>
        </div>
      )}

      {/* ═══ KPI METRIC CARDS ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px'
      }}>
        {/* Card 1: Total Audiencia */}
        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#60a5fa'
          }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Destinatarios Seleccionados
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f8fafc', marginTop: '2px' }}>
              {filteredRecipients.length} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-dim)' }}>de {contacts.length}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Intervalo Anti-Ban */}
        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#34d399'
          }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Seguridad Anti-Ban
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
              {delaySeconds}s <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-dim)' }}>aleatorizado</span>
            </div>
          </div>
        </div>

        {/* Card 3: Tiempo Estimado */}
        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fbbf24'
          }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Tiempo Estimado
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f8fafc', marginTop: '2px' }}>
              ~{Math.ceil((filteredRecipients.length * delaySeconds) / 60)} min
            </div>
          </div>
        </div>

        {/* Card 4: Estado de Envío */}
        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: isSending ? 'rgba(245, 158, 11, 0.15)' : 'rgba(139, 92, 246, 0.15)',
            border: isSending ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(139, 92, 246, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isSending ? '#fbbf24' : '#a78bfa'
          }}>
            {isSending ? <RefreshCw size={22} className="spin" style={{ animation: 'spin 1.5s linear infinite' }} /> : <Sparkles size={22} />}
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Estado del Sistema
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: isSending ? '#fbbf24' : '#f8fafc', marginTop: '2px' }}>
              {isSending ? `En Progreso (${progressPercent}%)` : (broadcastState?.status === 'COMPLETED' ? 'Completado' : 'Listo')}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MONITOR EN VIVO DE CAMPAÑA ACTIVA O RECIENTE ═══ */}
      {(isSending || (broadcastState && broadcastState.total > 0)) && (
        <div className="glass-panel" style={{
          padding: '20px 24px',
          background: isSending
            ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)'
            : 'var(--bg-card)',
          border: isSending ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isSending ? (
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 10px #fbbf24' }}></div>
              ) : (
                <CheckCircle2 size={18} color="#34d399" />
              )}
              <span style={{ fontWeight: 700, fontSize: '0.98rem', color: '#f8fafc' }}>
                {isSending ? 'Transmisión Masiva en Progreso...' : `Última Difusión Masiva: ${broadcastState?.status || 'Finalizada'}`}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                {durationStr ? `(Duración: ${durationStr})` : ''}
              </span>
            </div>

            {isSending && (
              <button
                onClick={handleCancelBroadcast}
                className="btn btn-danger"
                style={{ padding: '6px 14px', fontSize: '0.82rem', gap: '6px' }}
              >
                <Square size={14} />
                Detener Envío
              </button>
            )}
          </div>

          {/* Animated Progress Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              <span>Progreso: {progressPercent}%</span>
              <span>
                <strong style={{ color: '#34d399' }}>{sentCount} enviados</strong> &bull;{' '}
                <strong style={{ color: '#f43f5e' }}>{failedCount} fallidos</strong> de {totalCount} total
              </span>
            </div>
            <div style={{
              width: '100%',
              height: '10px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '999px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                height: '100%',
                background: isSending
                  ? 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 50%, #10b981 100%)'
                  : '#10b981',
                borderRadius: '999px',
                transition: 'width 0.4s ease',
                boxShadow: '0 0 12px rgba(6, 182, 212, 0.5)'
              }}></div>
            </div>
          </div>

          {/* Terminal / Execution Logs snippet */}
          {recentLogs.length > 0 && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.45)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              maxHeight: '110px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              {recentLogs.slice(0, 15).map((log, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: log.status === 'SUCCESS' ? '#a7f3d0' : '#fca5a5' }}>
                  <span style={{ color: 'var(--text-dim)' }}>[{log.time}]</span>
                  <span>{log.status === 'SUCCESS' ? '✅' : '❌'}</span>
                  <span style={{ fontWeight: 600 }}>{log.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>({log.phone})</span>
                  {log.error && <span style={{ color: '#fda4af' }}>- {log.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TWO-COLUMN STUDIO WORKSPACE ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(360px, 1.25fr) minmax(320px, 0.95fr)',
        gap: '24px',
        alignItems: 'start'
      }}>
        
        {/* ═══ LEFT COLUMN: COMPOSER & CAMPAIGN BUILDER ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Section 1: Selector de Audiencia */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} color="#60a5fa" />
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  1. Selección de Audiencia
                </h2>
              </div>
              <span className="badge badge-info" style={{ fontSize: '0.78rem' }}>
                {filteredRecipients.length} seleccionados
              </span>
            </div>

            {/* Filter buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              <button
                type="button"
                onClick={() => setFilterAudience('all')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  border: filterAudience === 'all' ? '1px solid #3b82f6' : '1px solid var(--border-subtle)',
                  background: filterAudience === 'all' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  color: filterAudience === 'all' ? '#60a5fa' : 'var(--text-muted)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Todos ({contacts.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterAudience('withName')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  border: filterAudience === 'withName' ? '1px solid #3b82f6' : '1px solid var(--border-subtle)',
                  background: filterAudience === 'withName' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  color: filterAudience === 'withName' ? '#60a5fa' : 'var(--text-muted)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Con Nombre Registrado
              </button>
              <button
                type="button"
                onClick={() => setFilterAudience('recent')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  border: filterAudience === 'recent' ? '1px solid #3b82f6' : '1px solid var(--border-subtle)',
                  background: filterAudience === 'recent' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  color: filterAudience === 'recent' ? '#60a5fa' : 'var(--text-muted)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Activos Últimos 30 Días
              </button>
              <button
                type="button"
                onClick={() => setFilterAudience('manual')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  border: filterAudience === 'manual' ? '1px solid #3b82f6' : '1px solid var(--border-subtle)',
                  background: filterAudience === 'manual' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  color: filterAudience === 'manual' ? '#60a5fa' : 'var(--text-muted)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Selección Manual {selectedPhones.size > 0 ? `(${selectedPhones.size})` : ''}
              </button>
            </div>

            {/* Manual contact picker modal list if manual */}
            {filterAudience === 'manual' && (
              <div style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                    <input
                      type="text"
                      placeholder="Buscar por nombre o teléfono..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{ paddingLeft: '32px', fontSize: '0.82rem', height: '34px', width: '100%' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedPhones.size === contacts.length) setSelectedPhones(new Set());
                      else setSelectedPhones(new Set(contacts.map(c => c.phone || c.id)));
                    }}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '0 10px', height: '34px' }}
                  >
                    {selectedPhones.size === contacts.length ? 'Deseleccionar' : 'Todos'}
                  </button>
                </div>

                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {contacts.map((c) => {
                    const phone = c.phone || c.id;
                    const isChecked = selectedPhones.has(phone);
                    return (
                      <label
                        key={phone}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: isChecked ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                          cursor: 'pointer',
                          fontSize: '0.82rem'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectPhone(phone)}
                        />
                        <span style={{ fontWeight: 600, color: '#f8fafc' }}>{c.name || 'Sin nombre'}</span>
                        <span style={{ color: 'var(--text-muted)' }}>({phone})</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Redactor del Mensaje */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="#a78bfa" />
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  2. Redacción del Mensaje
                </h2>
              </div>

              {/* Plantillas Dropdown / Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} color="#f59e0b" />
                <select
                  onChange={(e) => {
                    const found = PRESET_TEMPLATES.find(p => p.id === e.target.value);
                    if (found) handleSelectTemplate(found);
                  }}
                  defaultValue=""
                  style={{
                    fontSize: '0.8rem',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    maxWidth: '180px'
                  }}
                >
                  <option value="" disabled>Cargar Plantilla...</option>
                  {PRESET_TEMPLATES.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Variable Insertion Chips */}
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase' }}>
                Variables Dinámicas (Haz clic para insertar en el texto):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => handleInsertVariable('{name}')}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '999px', gap: '4px' }}
                >
                  <strong style={{ color: '#60a5fa' }}>+ {'{name}'}</strong> Nombre
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertVariable('{phone}')}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '999px', gap: '4px' }}
                >
                  <strong style={{ color: '#34d399' }}>+ {'{phone}'}</strong> Teléfono
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertVariable('{empresa}')}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '999px', gap: '4px' }}
                >
                  <strong style={{ color: '#f59e0b' }}>+ {'{empresa}'}</strong> CAD Impresiones
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertVariable('{contacto}')}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '999px', gap: '4px' }}
                >
                  <strong style={{ color: '#ec4899' }}>+ {'{contacto}'}</strong> Contacto
                </button>
              </div>
            </div>

            {/* Message Textarea */}
            <div style={{ position: 'relative' }}>
              <textarea
                ref={textareaRef}
                rows={7}
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                placeholder="Escribe el mensaje de la campaña aquí... Recuerda que puedes usar *negrita*, _cursiva_ y variables como {name}."
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '0.88rem',
                  lineHeight: '1.5',
                  borderRadius: 'var(--radius-sm)',
                  resize: 'vertical'
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.72rem',
                color: 'var(--text-dim)',
                marginTop: '4px'
              }}>
                <span>Formato WhatsApp: *negrita*, _cursiva_, ~tachado~</span>
                <span>{messageTemplate.length} caracteres</span>
              </div>
            </div>

            {/* Section 3: Imagen / Flyer Adjunto (Opcional) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Image size={15} color="#ec4899" />
                URL de Imagen / Flyer Promocional (Opcional):
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="url"
                  placeholder="https://ejemplo.com/flyer-promocion.jpg"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  style={{ flex: 1, fontSize: '0.84rem' }}
                />
                {mediaUrl && (
                  <button
                    type="button"
                    onClick={() => setMediaUrl('')}
                    className="btn btn-secondary"
                    title="Quitar imagen"
                    style={{ padding: '0 12px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Section 4: Configuración de Seguridad Anti-Ban */}
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700, fontSize: '0.88rem' }}>
                  <ShieldCheck size={18} />
                  Cadencia Segura Anti-Bloqueo (Anti-Ban)
                </div>
                <span className="badge badge-live" style={{ fontSize: '0.78rem' }}>
                  {delaySeconds} seg por cliente
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <input
                  type="range"
                  min="5"
                  max="15"
                  step="1"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#10b981', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.82rem', color: '#f8fafc', fontWeight: 700, minWidth: '45px' }}>
                  {delaySeconds}s
                </span>
              </div>

              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                💡 <strong>¿Por qué es importante?</strong> WhatsApp penaliza envíos instantáneos simultáneos. Al añadir un retraso aleatorizado entre <strong>{delaySeconds - 1}s y {delaySeconds + 2}s</strong>, el bot simula un comportamiento natural y protege tu número de bloqueos.
              </p>
            </div>

            {/* Main Action Button */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
              <button
                type="button"
                disabled={isSending || filteredRecipients.length === 0 || !messageTemplate.trim()}
                onClick={() => setConfirmModalOpen(true)}
                className="btn btn-primary"
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  fontSize: '0.96rem',
                  fontWeight: 700,
                  gap: '10px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                  boxShadow: '0 0 20px rgba(37, 99, 235, 0.4)'
                }}
              >
                <Send size={18} />
                Lanzar Difusión a {filteredRecipients.length} Clientes
              </button>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN: LIVE WHATSAPP PHONE SIMULATOR ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '24px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Smartphone size={18} color="#06b6d4" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Simulador de Vista Previa en Vivo
              </h3>
            </div>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
              Muestra para: <strong>{sampleClient.name || 'Cliente'}</strong>
            </span>
          </div>

          {/* Smartphone Frame Mockup */}
          <div style={{
            background: '#0b141a',
            borderRadius: '28px',
            border: '8px solid #1f2937',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.65), 0 0 25px rgba(6, 182, 212, 0.15)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '520px'
          }}>
            
            {/* WhatsApp Top Header Bar */}
            <div style={{
              background: '#202c33',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #2563eb 0%, #10b981 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.9rem',
                flexShrink: 0
              }}>
                C
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e9edef', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  CAD Impresiones &bull; Cadi
                </div>
                <div style={{ fontSize: '0.72rem', color: '#8696a0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#25d366', display: 'inline-block' }}></span>
                  en línea
                </div>
              </div>
            </div>

            {/* Chat Body Wallpaper with subtle grid */}
            <div style={{
              flex: 1,
              padding: '16px 12px',
              background: '#0b141a',
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px)',
              backgroundSize: '16px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: '10px'
            }}>
              
              {/* Date Bubble */}
              <div style={{ alignSelf: 'center', background: '#182229', color: '#8696a0', fontSize: '0.68rem', padding: '4px 10px', borderRadius: '6px', fontWeight: 600 }}>
                HOY
              </div>

              {/* Bot Message Bubble (Green WhatsApp bubble) */}
              <div style={{
                alignSelf: 'flex-start',
                maxWidth: '92%',
                background: '#005c4b',
                color: '#e9edef',
                borderRadius: '8px 8px 8px 0',
                padding: '8px 10px 6px 10px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                position: 'relative'
              }}>
                
                {/* Optional Media Flyer in preview */}
                {mediaUrl && (
                  <div style={{
                    borderRadius: '6px',
                    overflow: 'hidden',
                    maxHeight: '180px',
                    background: '#111b21',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <img
                      src={mediaUrl}
                      alt="Flyer promocional"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                      style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
                    />
                  </div>
                )}

                {/* Message Text formatted */}
                <div style={{
                  fontSize: '0.84rem',
                  lineHeight: '1.45',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {livePreviewMessage || <span style={{ color: '#8696a0', fontStyle: 'italic' }}>Escribe tu mensaje en el editor...</span>}
                </div>

                {/* Bubble Timestamp & Double Blue Checkmark */}
                <div style={{
                  alignSelf: 'flex-end',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'rgba(233, 237, 239, 0.65)',
                  fontSize: '0.66rem',
                  marginTop: '2px'
                }}>
                  <span>{new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ color: '#53bdeb', fontWeight: 'bold' }}>✓✓</span>
                </div>
              </div>

            </div>

            {/* Bottom Fake Input Bar */}
            <div style={{
              background: '#202c33',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{
                flex: 1,
                background: '#2a3942',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.78rem',
                color: '#8696a0'
              }}>
                Mensaje...
              </div>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#00a884',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff'
              }}>
                <Send size={14} />
              </div>
            </div>

          </div>

          <div style={{
            fontSize: '0.74rem',
            color: 'var(--text-dim)',
            textAlign: 'center',
            lineHeight: 1.4
          }}>
            Vista en tiempo real de cómo el cliente <strong>{sampleClient.name}</strong> recibirá este mensaje en su WhatsApp.
          </div>
        </div>

      </div>

      {/* ═══ MODAL DE CONFIRMACIÓN DE ENVÍO MASIVO ═══ */}
      {confirmModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '520px',
            width: '100%',
            padding: '24px',
            background: 'var(--bg-sidebar)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.7)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(236, 72, 153, 0.15)',
                border: '1px solid rgba(236, 72, 153, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f472b6',
                flexShrink: 0
              }}>
                <Megaphone size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  Confirmar Difusión Masiva
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  Revisa los detalles antes de iniciar la cola de mensajes
                </p>
              </div>
            </div>

            {/* Campaign Summary Box */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '0.86rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Destinatarios:</span>
                <strong style={{ color: '#f8fafc' }}>{filteredRecipients.length} clientes</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Intervalo Anti-Ban:</span>
                <strong style={{ color: '#34d399' }}>{delaySeconds} seg (aleatorio)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Tiempo Estimado:</span>
                <strong style={{ color: '#fbbf24' }}>~{Math.ceil((filteredRecipients.length * delaySeconds) / 60)} minutos</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Imagen Flyer:</span>
                <strong style={{ color: mediaUrl ? '#34d399' : 'var(--text-dim)' }}>
                  {mediaUrl ? 'Adjuntada ✅' : 'Solo texto'}
                </strong>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#fda4af', margin: 0, lineHeight: 1.4 }}>
              ⚠️ Los mensajes serán enviados de forma secuencial y personalizada a través del bot conectado. Puedes cancelar la campaña en cualquier momento.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmModalOpen(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px' }}
              >
                Volver al Editor
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleStartBroadcast}
                className="btn btn-primary"
                style={{
                  padding: '8px 20px',
                  background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                  fontWeight: 700
                }}
              >
                {actionLoading ? 'Iniciando...' : '¡Sí, Iniciar Difusión!'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
