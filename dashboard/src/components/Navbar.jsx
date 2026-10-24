import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { 
  Bot, LogOut, FolderTree, Users, ShieldCheck,
  Menu, ChevronRight, QrCode
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, user, sessionData }) {
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
  };

  const status = sessionData?.status || 'INITIALIZING';
  const isConnected = status === 'CONNECTED';
  const isRequiresAuth = status === 'REQUIRES_AUTH' || status === 'DISCONNECTED' || !!sessionData?.qrCode;

  const navItems = [
    { 
      id: 'connection', 
      label: 'Conexión & QR', 
      icon: QrCode, 
      badge: isConnected ? 'En Línea' : (isRequiresAuth ? '¡Escanear!' : 'Conectando'),
      badgeColor: isConnected ? 'rgba(16, 185, 129, 0.15)' : (isRequiresAuth ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)'),
      badgeTextColor: isConnected ? '#34d399' : (isRequiresAuth ? '#fda4af' : '#fbbf24'),
      badgeBorder: isConnected ? '1px solid rgba(16, 185, 129, 0.3)' : (isRequiresAuth ? '1px solid rgba(244, 63, 94, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)'),
      showDot: true,
      dotClass: isConnected ? 'pulse-dot' : (isRequiresAuth ? 'pulse-dot-red' : 'pulse-dot-amber')
    },
    { id: 'contacts', label: 'Lista de Contactos', icon: Users, badge: 'Clientes' },
    { id: 'prices', label: 'Catálogo & Categorías', icon: FolderTree, badge: 'Precios' },
    { id: 'advisors', label: 'Asesores & Permisos', icon: ShieldCheck, badge: 'Equipo' }
  ];

  return (
    <aside style={{
      width: collapsed ? '72px' : '260px',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      zIndex: 50
    }}>
      {/* Brand & Collapse Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 0 16px rgba(37, 99, 235, 0.45)',
            flexShrink: 0
          }}>
            <Bot size={22} />
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div style={{ fontWeight: 750, fontSize: '0.95rem', color: '#fff', letterSpacing: '-0.02em' }}>
                CAD Console
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span className="pulse-dot"></span>
                v2.0 &bull; Dialogflow
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
          title={collapsed ? 'Expandir barra lateral' : 'Colapsar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {!collapsed && (
          <div style={{
            fontSize: '0.72rem',
            color: 'var(--text-dim)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '0 8px 8px 8px'
          }}>
            Agente Conversacional
          </div>
        )}

        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: active ? 'rgba(37, 99, 235, 0.18)' : 'transparent',
                border: active ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid transparent',
                color: active ? '#60a5fa' : 'var(--text-muted)',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textAlign: 'left'
              }}
              title={collapsed ? item.label : ''}
            >
              <Icon size={19} color={active ? '#60a5fa' : 'var(--text-dim)'} style={{ flexShrink: 0 }} />
              {!collapsed && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontSize: '0.88rem' }}>{item.label}</span>
                  {item.badge && (
                    <span style={{
                      fontSize: '0.68rem',
                      background: item.badgeColor || (active ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.06)'),
                      color: item.badgeTextColor || (active ? '#bfdbfe' : 'var(--text-dim)'),
                      border: item.badgeBorder || 'none',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {item.showDot && <span className={item.dotClass || 'pulse-dot'}></span>}
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Profile & Logout */}
      <div style={{
        padding: '14px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(0, 0, 0, 0.2)'
      }}>
        {!collapsed && (
          <div style={{ marginBottom: '10px', overflow: 'hidden' }}>
            <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)' }}>Conectado como:</span>
            <span style={{
              display: 'block',
              fontSize: '0.82rem',
              color: '#fff',
              fontWeight: 600,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap'
            }}>
              {user?.email}
            </span>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="btn btn-secondary"
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '0.82rem',
            justifyContent: collapsed ? 'center' : 'flex-start'
          }}
          title="Cerrar Sesión"
        >
          <LogOut size={16} />
          {!collapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </aside>
  );
}
