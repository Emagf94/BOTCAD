import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  PhoneCall, Users, ShieldAlert, Clock, Save, 
  CheckCircle2, RefreshCw, Smartphone, Hash, Plus, Trash2 
} from 'lucide-react';

export default function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newEscapeNum, setNewEscapeNum] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'config', 'general'));
      if (snap.exists()) {
        const data = snap.data();
        setSettings({
          adminOrdersPhone: data.adminOrdersPhone || data.adminPhone || '573184849332@c.us',
          adminSupportPhone: data.adminSupportPhone || data.adminPhone || '573184849332@c.us',
          adminEscapes: data.adminEscapes || ['573184849332', '235780886794250'],
          botName: data.botName || 'Cadi',
          inactivityMinutes: data.inactivityMinutes || 10
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (field, val) => {
    setSettings(prev => ({ ...prev, [field]: val }));
  };

  const handleAddEscape = () => {
    if (!newEscapeNum.trim()) return;
    const clean = newEscapeNum.trim().replace(/[^0-9]/g, '');
    if (!settings.adminEscapes.includes(clean)) {
      setSettings(prev => ({
        ...prev,
        adminEscapes: [...prev.adminEscapes, clean]
      }));
    }
    setNewEscapeNum('');
  };

  const handleRemoveEscape = (num) => {
    setSettings(prev => ({
      ...prev,
      adminEscapes: prev.adminEscapes.filter(n => n !== num)
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'general'), settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      alert('Error guardando configuración: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <RefreshCw size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '12px' }}>Cargando enrutamiento y asesores...</p>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px 40px 20px' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
              Enrutamiento Telefónico
            </span>
          </div>
          <h2 style={{ fontSize: '1.5rem', color: '#fff', marginTop: '4px' }}>Líneas de Atención & Asesores</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Configura a qué números llegan los archivos de pedidos y quiénes reciben las alertas de soporte humano.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {saveSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '0.88rem', fontWeight: 600 }}>
              <CheckCircle2 size={18} /> ¡Líneas actualizadas en vivo!
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-emerald"
            style={{ padding: '9px 20px' }}
          >
            <Save size={17} />
            {saving ? 'Guardando...' : 'Guardar Enrutamiento'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Department 1: Orders and Design Files */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
              flexShrink: 0
            }}>
              <Smartphone size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Línea de Producción & Recepción de Archivos</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                A este número de WhatsApp se transfieren los PDFs, imágenes, archivos Corel/AI y comprobantes de pago.
              </p>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
              Número de WhatsApp Destino (con código de país y @c.us)
            </label>
            <input
              type="text"
              value={settings.adminOrdersPhone || ''}
              onChange={(e) => handleChange('adminOrdersPhone', e.target.value)}
              placeholder="573184849332@c.us"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </div>

        {/* Department 2: Human Advisors Queue */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
              flexShrink: 0
            }}>
              <Users size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Línea de Asesores & Soporte Humano</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Número que recibe las alertas de cliente en espera y responde con <strong>!atender</strong> para conectarse directamente al chat.
              </p>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
              Números de WhatsApp para Asesores (separados por coma)
            </label>
            <input
              type="text"
              value={settings.adminSupportPhone || ''}
              onChange={(e) => handleChange('adminSupportPhone', e.target.value)}
              placeholder="ej. 573184849332@c.us, 573001234567@c.us"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </div>

        {/* Department 3: Admin Supervisors (Escapes) */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#34d399',
              flexShrink: 0
            }}>
              <ShieldAlert size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Números Autorizados con Comandos de Administrador</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Teléfonos habilitados para ejecutar <strong>!atender</strong>, <strong>!chatear [número]</strong> o <strong>!fin</strong> sin ser bloqueados por los menús del bot.
              </p>
            </div>
          </div>

          {/* List of Numbers */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
            {settings.adminEscapes.map((num) => (
              <span
                key={num}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>+{num}</span>
                <button
                  onClick={() => handleRemoveEscape(num)}
                  style={{ background: 'none', border: 'none', color: '#fda4af', cursor: 'pointer', padding: 0 }}
                  title="Quitar permiso"
                >
                  <Trash2 size={13} />
                </button>
              </span>
            ))}
          </div>

          {/* Add new number */}
          <div style={{ display: 'flex', gap: '8px', maxWidth: '420px' }}>
            <input
              type="text"
              placeholder="ej. 573184849332 (sin símbolos)"
              value={newEscapeNum}
              onChange={(e) => setNewEscapeNum(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem' }}
            />
            <button onClick={handleAddEscape} className="btn btn-secondary">
              <Plus size={16} /> Añadir
            </button>
          </div>
        </div>

        {/* Department 4: Session Inactivity & Identity */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
              Nombre del Asistente Virtual
            </label>
            <input
              type="text"
              value={settings.botName || ''}
              onChange={(e) => handleChange('botName', e.target.value)}
              placeholder="Cadi"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
              Minutos de Inactividad antes de expirar chat
            </label>
            <input
              type="number"
              value={settings.inactivityMinutes || 10}
              onChange={(e) => handleChange('inactivityMinutes', parseInt(e.target.value, 10))}
              min={2}
              max={60}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
