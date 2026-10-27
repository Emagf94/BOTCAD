import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { resolveClientPhone } from '../utils/phoneUtils';
import {
  Users, Search, RefreshCw, MessageCircle, Phone, Calendar,
  UserPlus, Edit3, Trash2, X, Check, Copy, Download,
  FileText, AlertTriangle, MessageSquare, CheckCircle2,
  Clock
} from 'lucide-react';

export default function ContactsTab({ onCountUpdate }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // all | withUser | withoutUser | recent | withNotes
  const [copiedId, setCopiedId] = useState(null);

  // Modal State (Crear / Editar)
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    contactUser: '',
    notes: ''
  });

  // Modal State (Eliminar)
  const [deleteConfirmContact, setDeleteConfirmContact] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // 1. Escucha en tiempo real de Firestore (collection 'users')
  useEffect(() => {
    setLoading(true);
    const usersRef = collection(db, 'users');
    const q = query(usersRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = [];
      snapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() });
      });

      // Ordenar por última interacción desc (más recientes primero)
      data.sort((a, b) => {
        const timeA = a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
        const timeB = b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
        return timeB - timeA;
      });

      setContacts(data);
      if (typeof onCountUpdate === 'function') {
        onCountUpdate(data.length);
      }
      setLoading(false);
    }, (err) => {
      console.error('Error escuchando usuarios en tiempo real:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [onCountUpdate]);

  // 2. Métricas y KPIs calculados en vivo
  const metrics = useMemo(() => {
    const total = contacts.length;
    const withUser = contacts.filter(c => c.contactUser && c.contactUser.trim().length > 0).length;
    const withoutUser = total - withUser;
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recent = contacts.filter(c => {
      if (!c.updatedAt) return false;
      const t = c.updatedAt?.seconds ? c.updatedAt.seconds * 1000 : new Date(c.updatedAt).getTime();
      return t >= thirtyDaysAgo;
    }).length;
    const withNotes = contacts.filter(c => c.notes && c.notes.trim().length > 0).length;

    return { total, withUser, withoutUser, recent, withNotes };
  }, [contacts]);

  // 3. Filtrado y Búsqueda combinados
  const filteredContacts = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    return contacts.filter(contact => {
      // Filtro de pestañas
      if (activeFilter === 'withUser' && (!contact.contactUser || !contact.contactUser.trim())) return false;
      if (activeFilter === 'withoutUser' && contact.contactUser && contact.contactUser.trim()) return false;
      if (activeFilter === 'recent') {
        if (!contact.updatedAt) return false;
        const t = contact.updatedAt?.seconds ? contact.updatedAt.seconds * 1000 : new Date(contact.updatedAt).getTime();
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        if (t < thirtyDaysAgo) return false;
      }
      if (activeFilter === 'withNotes' && (!contact.notes || !contact.notes.trim())) return false;

      // Filtro de búsqueda textual
      if (!search) return true;
      const name = (contact.name || '').toLowerCase();
      const resolved = resolveClientPhone(contact);
      const phone = String(resolved.formattedPhone || contact.phone || contact.id || '').toLowerCase();
      const displayPhone = String(resolved.displayPhone || '').toLowerCase();
      const contactUser = (contact.contactUser || '').toLowerCase();
      const notes = (contact.notes || '').toLowerCase();

      return name.includes(search) || phone.includes(search) || displayPhone.includes(search) || contactUser.includes(search) || notes.includes(search);
    });
  }, [contacts, searchTerm, activeFilter]);

  // Copiar teléfono al portapapeles
  const handleCopyPhone = (phone, id) => {
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Abrir Modal para Nuevo Cliente
  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      name: '',
      phone: '',
      contactUser: '',
      notes: ''
    });
    setSaveError('');
    setSaveSuccess(false);
    setModalOpen(true);
  };

  // Abrir Modal para Editar Cliente
  const handleOpenEditModal = (contact) => {
    setIsEditing(true);
    setEditingId(contact.id);
    const resolved = resolveClientPhone(contact);
    setFormData({
      name: contact.name || '',
      phone: resolved.isValid ? resolved.rawDigits : (contact.phone || contact.id || ''),
      contactUser: resolved.isOnlyHandle ? (contact.contactUser || '') : (contact.contactUser && !contact.contactUser.match(/^\d+$/) ? contact.contactUser : ''),
      notes: contact.notes || ''
    });
    setSaveError('');
    setSaveSuccess(false);
    setModalOpen(true);
  };

  // Guardar Cambios (Crear o Actualizar)
  const handleSaveContact = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setSaveError('Por favor ingresa el nombre del cliente.');
      return;
    }

    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 7) {
      setSaveError('Por favor ingresa un número de teléfono válido.');
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      const resolved = resolveClientPhone({ phone: cleanPhone, contactUser: formData.contactUser });
      const docData = {
        name: formData.name.trim(),
        phone: cleanPhone,
        realPhone: resolved.isValid ? resolved.formattedPhone : cleanPhone,
        contactUser: (formData.contactUser || '').trim(),
        notes: (formData.notes || '').trim(),
        updatedAt: new Date()
      };

      // Si se editó y el teléfono cambió, migrar documento
      if (isEditing && editingId && editingId !== cleanPhone) {
        await setDoc(doc(db, 'users', cleanPhone), docData, { merge: true });
        await deleteDoc(doc(db, 'users', editingId));
      } else {
        await setDoc(doc(db, 'users', cleanPhone), docData, { merge: true });
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setModalOpen(false);
      }, 700);
    } catch (err) {
      console.error('Error guardando cliente en Firestore:', err);
      setSaveError('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Confirmar Eliminación
  const handleDeleteContact = async () => {
    if (!deleteConfirmContact) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'users', deleteConfirmContact.id));
      setDeleteConfirmContact(null);
    } catch (err) {
      console.error('Error eliminando cliente:', err);
      alert('Error eliminando cliente: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Exportar a archivo CSV para Excel
  const handleExportCSV = () => {
    if (contacts.length === 0) return;
    const headers = ['Nombre', 'Teléfono Celular', 'LID / ID WhatsApp', 'Usuario Adicional', 'Notas / Observaciones', 'Última Interacción'];
    const rows = contacts.map(c => {
      const resolved = resolveClientPhone(c);
      return [
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${resolved.isValid ? resolved.formattedPhone : ''}"`,
        `"${c.id || c.phone || ''}"`,
        `"${(c.contactUser || '').replace(/"/g, '""')}"`,
        `"${(c.notes || '').replace(/"/g, '""')}"`,
        `"${c.updatedAt?.seconds ? new Date(c.updatedAt.seconds * 1000).toLocaleString() : ''}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `clientes_cad_impresiones_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Paleta de gradientes para avatares
  const getAvatarGradient = (name = '') => {
    const gradients = [
      'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      'linear-gradient(135deg, #10b981 0%, #047857 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
      'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)'
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return gradients[sum % gradients.length];
  };

  return (
    <div className="fade-in" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 24px 60px 24px' }}>
      
      {/* ── ENCABEZADO PRINCIPAL ── */}
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
            <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              Directorio de Clientes
            </span>
            <span className="badge badge-live">
              <span className="pulse-dot"></span> Sincronizado en Vivo
            </span>
          </div>
          <h2 style={{ fontSize: '1.65rem', fontWeight: 700, color: '#fff', marginTop: '6px', letterSpacing: '-0.02em' }}>
            Gestión de Clientes & Contactos
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Directorio centralizado con historial de interacciones, edición de datos y notas para atención.
          </p>
        </div>

        {/* Botones de Acción Global */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleExportCSV}
            className="btn btn-secondary"
            title="Descargar archivo CSV compatible con Excel"
            style={{ padding: '8px 14px', fontSize: '0.85rem' }}
          >
            <Download size={15} /> Exportar CSV
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <UserPlus size={16} /> Nuevo Cliente
          </button>
        </div>
      </div>

      {/* ── TARJETAS DE MÉTRICAS / RECUENTO (KPIS) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* KPI 1: Total Clientes */}
        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#60a5fa',
            flexShrink: 0
          }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Clientes
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>
              {loading ? '...' : metrics.total}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#34d399', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={12} /> Base de datos activa
            </div>
          </div>
        </div>

        {/* KPI 2: Con Contacto Adicional */}
        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#34d399',
            flexShrink: 0
          }}>
            <MessageSquare size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Con Usuario Adicional
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>
              {loading ? '...' : metrics.withUser}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {metrics.total > 0 ? `${Math.round((metrics.withUser / metrics.total) * 100)}% del total` : '0%'}
            </div>
          </div>
        </div>

        {/* KPI 3: Activos Recientemente */}
        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a78bfa',
            flexShrink: 0
          }}>
            <Calendar size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Activos (30 días)
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>
              {loading ? '...' : metrics.recent}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Interacciones recientes
            </div>
          </div>
        </div>

        {/* KPI 4: Con Notas / Observaciones */}
        <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fbbf24',
            flexShrink: 0
          }}>
            <FileText size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Con Notas
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>
              {loading ? '...' : metrics.withNotes}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Observaciones del taller
            </div>
          </div>
        </div>
      </div>

      {/* ── BARRA DE BÚSQUEDA Y FILTROS ── */}
      <div className="glass-panel" style={{
        padding: '16px 20px',
        borderRadius: 'var(--radius-md)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Chips de Filtros Rápidos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveFilter('all')}
            className={`btn ${activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '20px' }}
          >
            Todos ({metrics.total})
          </button>

          <button
            onClick={() => setActiveFilter('withUser')}
            className={`btn ${activeFilter === 'withUser' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '20px' }}
          >
            Con Usuario @ ({metrics.withUser})
          </button>

          <button
            onClick={() => setActiveFilter('withoutUser')}
            className={`btn ${activeFilter === 'withoutUser' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '20px' }}
          >
            Sin Usuario ({metrics.withoutUser})
          </button>

          <button
            onClick={() => setActiveFilter('recent')}
            className={`btn ${activeFilter === 'recent' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '20px' }}
          >
            Recientes ({metrics.recent})
          </button>

          <button
            onClick={() => setActiveFilter('withNotes')}
            className={`btn ${activeFilter === 'withNotes' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '20px' }}
          >
            Con Notas ({metrics.withNotes})
          </button>
        </div>

        {/* Buscador en Vivo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono, nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                paddingLeft: '36px',
                paddingRight: searchTerm ? '32px' : '12px',
                width: '280px',
                fontSize: '0.86rem',
                borderRadius: '8px'
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '2px'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
            Mostrando <strong style={{ color: '#fff' }}>{filteredContacts.length}</strong> de <strong style={{ color: '#fff' }}>{contacts.length}</strong>
          </div>
        </div>
      </div>

      {/* ── TABLA DE CONTACTOS ── */}
      <div className="glass-panel" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            <RefreshCw size={30} className="spin" style={{ animation: 'spin 1s linear infinite', margin: '0 auto', color: 'var(--primary)' }} />
            <p style={{ marginTop: '12px', fontSize: '0.92rem' }}>Cargando clientes en tiempo real...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            <Users size={36} style={{ margin: '0 auto', opacity: 0.4 }} />
            <p style={{ marginTop: '12px', fontSize: '1rem', color: '#fff', fontWeight: 600 }}>No se encontraron clientes</p>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              {searchTerm || activeFilter !== 'all'
                ? 'Prueba modificando los filtros o el término de búsqueda.'
                : 'Aún no hay clientes registrados en la base de datos.'}
            </p>
            {(searchTerm || activeFilter !== 'all') && (
              <button
                onClick={() => { setSearchTerm(''); setActiveFilter('all'); }}
                className="btn btn-secondary"
                style={{ marginTop: '16px', padding: '6px 14px', fontSize: '0.82rem' }}
              >
                Restablecer filtros
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '14px 20px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cliente / Nombre</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teléfono WhatsApp</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Usuario Adicional</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notas / Taller</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Última Interacción</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s' }}
                    className="hover-row"
                  >
                    {/* Nombre y Avatar */}
                    <td style={{ padding: '16px 20px', color: '#fff', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: getAvatarGradient(contact.name || contact.id),
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.92rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                        }}>
                          {contact.name ? contact.name.trim().charAt(0).toUpperCase() : '?'}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.94rem', fontWeight: 600, color: '#f8fafc' }}>
                              {contact.name || 'Sin nombre registrado'}
                            </span>
                            {contact.notes && (
                              <span title={`Nota: ${contact.notes}`} style={{ cursor: 'pointer' }}>
                                <FileText size={14} color="#f59e0b" />
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            ID: {contact.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Teléfono con Copiado Rápido */}
                    <td style={{ padding: '16px 20px', color: 'var(--text-main)', fontSize: '0.88rem' }}>
                      {(() => {
                        const resolved = resolveClientPhone(contact);
                        const isLidDoc = String(contact.id).replace(/\D/g, '').length >= 14;
                        if (resolved.isValid) {
                          return (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Phone size={14} color="#34d399" />
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#f8fafc' }}>
                                  {resolved.displayPhone}
                                </span>
                                <button
                                  onClick={() => handleCopyPhone(resolved.rawDigits, contact.id)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: copiedId === contact.id ? '#34d399' : 'var(--text-dim)',
                                    cursor: 'pointer',
                                    padding: '3px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    borderRadius: '4px',
                                    transition: 'color 0.2s'
                                  }}
                                  title="Copiar número"
                                >
                                  {copiedId === contact.id ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                              {isLidDoc && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                                  LID: {contact.id}
                                </div>
                              )}
                            </div>
                          );
                        } else {
                          return (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fca5a5' }}>
                                <AlertTriangle size={14} color="#f87171" />
                                <span style={{ fontSize: '0.82rem', fontStyle: 'italic' }}>
                                  Sin teléfono celular
                                </span>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                                LID: {contact.id}
                              </div>
                            </div>
                          );
                        }
                      })()}
                    </td>

                    {/* Usuario Adicional */}
                    <td style={{ padding: '16px 20px', color: 'var(--text-main)', fontSize: '0.88rem' }}>
                      {(() => {
                        const contactUser = (contact.contactUser || '').trim();
                        const isPhoneDigitsOnly = contactUser && contactUser.replace(/\D/g, '').length >= 10 && !contactUser.startsWith('@');
                        
                        if (contactUser && !isPhoneDigitsOnly) {
                          return (
                            <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                              {contactUser.startsWith('@') ? contactUser : `@${contactUser}`}
                            </span>
                          );
                        }
                        return <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>-</span>;
                      })()}
                    </td>

                    {/* Notas / Observaciones */}
                    <td style={{ padding: '16px 20px', maxWidth: '240px' }}>
                      {contact.notes ? (
                        <div style={{
                          fontSize: '0.82rem',
                          color: '#e2e8f0',
                          background: 'rgba(255, 255, 255, 0.03)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }} title={contact.notes}>
                          {contact.notes}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.82rem', fontStyle: 'italic' }}>Sin notas</span>
                      )}
                    </td>

                    {/* Fecha de Última Interacción */}
                    <td style={{ padding: '16px 20px', color: 'var(--text-dim)', fontSize: '0.84rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={13} />
                        {contact.updatedAt
                          ? (contact.updatedAt.seconds
                              ? new Date(contact.updatedAt.seconds * 1000).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                              : new Date(contact.updatedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))
                          : '-'}
                      </div>
                    </td>

                    {/* Acciones */}
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        {/* Botón Editar */}
                        <button
                          onClick={() => handleOpenEditModal(contact)}
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '0.8rem', gap: '5px' }}
                          title="Editar información del cliente"
                        >
                          <Edit3 size={14} color="#60a5fa" />
                          <span>Editar</span>
                        </button>

                        {/* Botón Chatear en WhatsApp */}
                        <a
                          href={`https://wa.me/${contact.phone || contact.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '0.8rem', gap: '5px', color: '#34d399' }}
                          title="Abrir chat en WhatsApp"
                        >
                          <MessageCircle size={14} color="#34d399" />
                          <span>Chatear</span>
                        </a>

                        {/* Botón Eliminar */}
                        <button
                          onClick={() => setDeleteConfirmContact(contact)}
                          className="btn btn-danger"
                          style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                          title="Eliminar registro de cliente"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL DE CREACIÓN / EDICIÓN ── */}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="glass-panel fade-in" style={{
            width: '100%',
            maxWidth: '520px',
            background: 'var(--bg-sidebar)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden'
          }}>
            {/* Header del Modal */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: isEditing ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  color: isEditing ? '#60a5fa' : '#34d399',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {isEditing ? <Edit3 size={18} /> : <UserPlus size={18} />}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', color: '#fff', fontWeight: 600 }}>
                    {isEditing ? 'Editar Datos del Cliente' : 'Registrar Nuevo Cliente'}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    {isEditing ? `Actualizando ID: ${editingId}` : 'Crear un nuevo contacto en Firebase Firestore'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveContact} style={{ padding: '24px' }}>
              {saveError && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(244, 63, 94, 0.15)',
                  border: '1px solid rgba(244, 63, 94, 0.35)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#fda4af',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px'
                }}>
                  <AlertTriangle size={16} />
                  <span>{saveError}</span>
                </div>
              )}

              {saveSuccess && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#34d399',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px'
                }}>
                  <CheckCircle2 size={16} />
                  <span>¡Cliente guardado exitosamente en Firebase!</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Nombre */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                    Nombre Completo <span style={{ color: '#f43f5e' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Carlos Mendoza"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                    Nombre que el bot utilizará para saludar y personalizar los pedidos.
                  </span>
                </div>

                {/* Teléfono */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                    Teléfono Principal (WhatsApp) <span style={{ color: '#f43f5e' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.9rem'
                    }}>+</span>
                    <input
                      type="text"
                      placeholder="573135363218"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      style={{ paddingLeft: '28px', fontFamily: 'var(--font-mono)' }}
                      required
                    />
                  </div>
                  {isEditing && formData.phone.replace(/\D/g, '') !== editingId && (
                    <span style={{ fontSize: '0.74rem', color: '#fbbf24', marginTop: '4px', display: 'block' }}>
                      ⚠️ Al cambiar el número, el registro se migrará a la nueva línea en Firestore.
                    </span>
                  )}
                </div>

                {/* Usuario Adicional */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                    Usuario Adicional o Teléfono Alternativo
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. @carlos_cad o 3105551234"
                    value={formData.contactUser}
                    onChange={(e) => setFormData({ ...formData, contactUser: e.target.value })}
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                    Identificador secundario solicitado por el bot cuando el número original está enmascarado.
                  </span>
                </div>

                {/* Notas / Observaciones */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                    Notas / Observaciones del Taller
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Ej. Cliente frecuente de planos. Solicita papel opalina. Facturación a Constructora SAS."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    style={{ resize: 'vertical', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              {/* Botones de acción modal */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '12px',
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-subtle)'
              }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn btn-secondary"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ gap: '6px' }}
                >
                  {saving && <RefreshCw size={15} className="spin" style={{ animation: 'spin 1s linear infinite' }} />}
                  <span>{saving ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Registrar Cliente')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL DE CONFIRMACIÓN DE ELIMINACIÓN ── */}
      {deleteConfirmContact && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '20px'
        }}>
          <div className="glass-panel fade-in" style={{
            width: '100%',
            maxWidth: '440px',
            background: 'var(--bg-sidebar)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(244, 63, 94, 0.15)',
              color: '#f43f5e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <AlertTriangle size={24} />
            </div>

            <h3 style={{ fontSize: '1.2rem', color: '#fff', fontWeight: 700, marginBottom: '8px' }}>
              ¿Eliminar este cliente?
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
              Estás a punto de eliminar a <strong style={{ color: '#fff' }}>{deleteConfirmContact.name || deleteConfirmContact.id}</strong> (+{deleteConfirmContact.phone || deleteConfirmContact.id}) de la base de datos de Firestore. Esta acción no se puede deshacer.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmContact(null)}
                className="btn btn-secondary"
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteContact}
                className="btn btn-danger"
                disabled={deleting}
                style={{ gap: '6px' }}
              >
                {deleting && <RefreshCw size={15} className="spin" style={{ animation: 'spin 1s linear infinite' }} />}
                <span>{deleting ? 'Eliminando...' : 'Sí, Eliminar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
