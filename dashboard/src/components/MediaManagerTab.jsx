import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Image, Smile, QrCode, Save, CheckCircle2, RefreshCw, 
  ToggleLeft, ToggleRight, Sparkles, AlertCircle 
} from 'lucide-react';

export default function MediaManagerTab() {
  const [mediaConfig, setMediaConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchMediaConfig = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'config', 'media'));
      if (snap.exists()) {
        setMediaConfig(snap.data());
      } else {
        // Defaults
        setMediaConfig({
          sendStickers: true,
          sendLogo: true,
          sendPaymentQR: true,
          stickerFinishedChat: './assets/chat_f.webp',
          logoImage: './assets/logo.png',
          paymentQRImage: './assets/qr_pagos.png'
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMediaConfig();
  }, []);

  const handleToggle = (field) => {
    setMediaConfig(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handlePathChange = (field, val) => {
    setMediaConfig(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'media'), mediaConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (e) {
      alert('Error guardando configuración multimedia: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <RefreshCw size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '12px' }}>Cargando gestor de recursos multimedia...</p>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px 40px 20px' }}>
      {/* Top Header */}
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
            <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>
              Multimedia & Stickers
            </span>
          </div>
          <h2 style={{ fontSize: '1.5rem', color: '#fff', marginTop: '4px' }}>Centro de Recursos Visuales</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Configura qué stickers e imágenes envía el bot de WhatsApp en cada interacción y confirma su estado.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {saveSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '0.88rem', fontWeight: 600 }}>
              <CheckCircle2 size={18} /> ¡Multimedia Sincronizada!
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-emerald"
            style={{ padding: '9px 20px' }}
          >
            <Save size={17} />
            {saving ? 'Guardando...' : 'Guardar Multimedia'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Card 1: Stickers WebP */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'rgba(236, 72, 153, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f472b6',
                flexShrink: 0
              }}>
                <Smile size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Envío de Stickers Automatizados (.webp)</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                  El bot despacha un sticker animado o estático cuando el cliente termina un pedido o cuando un asesor cierra el chat (!fin).
                </p>
              </div>
            </div>

            <button
              onClick={() => handleToggle('sendStickers')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: mediaConfig.sendStickers ? '#10b981' : 'var(--text-dim)' }}
              title={mediaConfig.sendStickers ? 'Desactivar stickers' : 'Activar stickers'}
            >
              {mediaConfig.sendStickers ? <ToggleRight size={38} /> : <ToggleLeft size={38} />}
            </button>
          </div>

          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
              Ruta del archivo de sticker en el servidor
            </label>
            <input
              type="text"
              value={mediaConfig.stickerFinishedChat || ''}
              onChange={(e) => handlePathChange('stickerFinishedChat', e.target.value)}
              placeholder="./assets/chat_f.webp"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {/* Card 2: Logotipo del Negocio */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
                flexShrink: 0
              }}>
                <Image size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Logotipo de Bienvenida</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                  Imagen institucional enviada antes del saludo inicial para reforzar la marca CAD Impresiones.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleToggle('sendLogo')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: mediaConfig.sendLogo ? '#10b981' : 'var(--text-dim)' }}
            >
              {mediaConfig.sendLogo ? <ToggleRight size={38} /> : <ToggleLeft size={38} />}
            </button>
          </div>

          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
              Ruta del archivo de logotipo
            </label>
            <input
              type="text"
              value={mediaConfig.logoImage || ''}
              onChange={(e) => handlePathChange('logoImage', e.target.value)}
              placeholder="./assets/logo.png"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {/* Card 3: Código QR de Pagos */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399',
                flexShrink: 0
              }}>
                <QrCode size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Código QR para Transferencias</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                  Imagen con el código QR de Bancolombia, Nequi y Daviplata enviada al seleccionar pago electrónico.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleToggle('sendPaymentQR')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: mediaConfig.sendPaymentQR ? '#10b981' : 'var(--text-dim)' }}
            >
              {mediaConfig.sendPaymentQR ? <ToggleRight size={38} /> : <ToggleLeft size={38} />}
            </button>
          </div>

          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
              Ruta del archivo QR
            </label>
            <input
              type="text"
              value={mediaConfig.paymentQRImage || ''}
              onChange={(e) => handlePathChange('paymentQRImage', e.target.value)}
              placeholder="./assets/qr_pagos.png"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
