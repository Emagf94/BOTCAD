import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ShieldCheck, UserPlus, Search, Phone, Shield,
  CheckCircle2, AlertCircle, Trash2, Edit3, X,
  Save, RefreshCw, HelpCircle, UserCheck, MessageSquare,
  ShoppingBag, Terminal, Power
} from 'lucide-react';

const INITIAL_ADVISORS = [
  {
    id: 'adv_3135363218',
    name: 'CAD Principal',
    phone: '573135363218',
    lid: '235780886794250',
    role: 'admin',
    active: true,
    receiveSupport: true,
    receiveOrders: true,
    canExecuteCommands: true
  },
  {
    id: 'adv_3184849332',
    name: 'Manuel Asesor',
    phone: '573184849332',
    lid: '',
    role: 'advisor',
    active: true,
    receiveSupport: true,
    receiveOrders: false,
    canExecuteCommands: true
  },
  {
    id: 'adv_3136303477',
    name: 'Asesor 3136303477',
    phone: '573136303477',
    lid: '',
    role: 'advisor',
    active: true,
    receiveSupport: true,
    receiveOrders: false,
    canExecuteCommands: true
  }
];

export default function AdvisorsTab() {
  const [advisors, setAdvisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAdvisor, setEditingAdvisor] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [showLidHelp, setShowLidHelp] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    lid: '',
    role: 'advisor',
    active: true,
    receiveSupport: true,
    receiveOrders: false,
    canExecuteCommands: true
  });

  // 1. Escucha en tiempo real de Firestore (config/advisors)
  useEffect(() => {
    setLoading(true);
    const docRef = doc(db, 'config', 'advisors');

    const unsubscribe = onSnapshot(docRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const incoming = Array.isArray(data.advisors) ? data.advisors : (Array.isArray(data.list) ? data.list : null);
        if (incoming) {
          setAdvisors(incoming);
          setLoading(false);
          return;
        }
      }

      // Si aún no existe el documento, intentar recuperar de config/general o iniciales
      try {
        const genSnap = await getDoc(doc(db, 'config', 'general'));
        let initList = INITIAL_ADVISORS;
        if (genSnap.exists()) {
          const genData = genSnap.data();
          const escapes = genData.adminEscapes || [];
          if (Array.isArray(escapes) && escapes.length > 0) {
            // Mantener lista inicial bien formateada
            initList = INITIAL_ADVISORS;
          }
        }
        setAdvisors(initList);
        await setDoc(docRef, { advisors: initList, list: initList, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.error('Error inicializando advisors:', err);
        setAdvisors(INITIAL_ADVISORS);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error('Error onSnapshot advisors:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Guardar y sincronizar con Firestore (config/advisors y config/general)
  const persistAdvisors = async (updatedList) => {
    setSaving(true);
    try {
      // 1. Guardar en config/advisors con compatibilidad total (advisors y list)
      await setDoc(doc(db, 'config', 'advisors'), {
        advisors: updatedList,
        list: updatedList,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. Calcular variables derivadas para config/general
      const activeSupport = updatedList
        .filter(a => a.active && a.receiveSupport !== false)
        .map(a => {
          let p = String(a.phone).replace(/\D/g, '');
          if (p.length === 10) p = '57' + p;
          return `${p}@c.us`;
        });

      const activeOrders = updatedList
        .filter(a => a.active && a.receiveOrders !== false)
        .map(a => {
          let p = String(a.phone).replace(/\D/g, '');
          if (p.length === 10) p = '57' + p;
          return `${p}@c.us`;
        });

      const escapesSet = new Set();
      updatedList.forEach(a => {
        if (a.active && a.canExecuteCommands !== false) {
          const cleanP = String(a.phone || '').replace(/\D/g, '');
          const cleanL = String(a.lid || '').replace(/\D/g, '');
          if (cleanP) {
            escapesSet.add(cleanP);
            if (cleanP.length === 10) escapesSet.add('57' + cleanP);
            if (cleanP.length === 12 && cleanP.startsWith('57')) escapesSet.add(cleanP.substring(2));
          }
          if (cleanL) escapesSet.add(cleanL);
        }
      });

      // Asegurar escapes de emergencia
      escapesSet.add('573184849332');
      escapesSet.add('235780886794250');
      escapesSet.add('573135363218');
      escapesSet.add('573136303477');
      escapesSet.add('3136303477');

      await setDoc(doc(db, 'config', 'general'), {
        adminSupportPhone: activeSupport.join(', ') || '573184849332@c.us, 573135363218@c.us, 573136303477@c.us',
        adminOrdersPhone: activeOrders.join(', ') || '573135363218@c.us',
        adminEscapes: Array.from(escapesSet)
      }, { merge: true });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('Error guardando asesores: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Abrir Modal para crear o editar
  const handleOpenModal = (adv = null) => {
    if (adv) {
      setEditingAdvisor(adv);
      setFormData({
        name: adv.name || '',
        phone: adv.phone || '',
        lid: adv.lid || '',
        role: adv.role || 'advisor',
        active: adv.active !== false,
        receiveSupport: adv.receiveSupport !== false,
        receiveOrders: !!adv.receiveOrders,
        canExecuteCommands: adv.canExecuteCommands !== false
      });
    } else {
      setEditingAdvisor(null);
      setFormData({
        name: '',
        phone: '',
        lid: '',
        role: 'advisor',
        active: true,
        receiveSupport: true,
        receiveOrders: false,
        canExecuteCommands: true
      });
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingAdvisor(null);
  };

  // Guardar formulario modal
  const handleSaveModal = async (e) => {
    e.preventDefault();
    const cleanPhone = String(formData.phone).trim().replace(/\D/g, '');
    const cleanLid = String(formData.lid).trim().replace(/\D/g, '');

    if (!formData.name.trim()) {
      alert('El nombre del asesor es obligatorio.');
      return;
    }
    if (!cleanPhone || cleanPhone.length < 10) {
      alert('Por favor ingresa un número de teléfono válido (mínimo 10 dígitos).');
      return;
    }

    let finalPhone = cleanPhone;
    if (finalPhone.length === 10) {
      finalPhone = '57' + finalPhone;
    }

    let updatedList = [];
    if (editingAdvisor) {
      updatedList = advisors.map(a => {
        if (a.id === editingAdvisor.id) {
          return {
            ...a,
            name: formData.name.trim(),
            phone: finalPhone,
            lid: cleanLid,
            role: formData.role,
            active: formData.active,
            receiveSupport: formData.receiveSupport,
            receiveOrders: formData.receiveOrders,
            canExecuteCommands: formData.canExecuteCommands
          };
        }
        return a;
      });
    } else {
      const existingAdv = advisors.find(a => {
        const p = String(a.phone || '').replace(/\D/g, '');
        return p === finalPhone || (finalPhone.length === 12 && p === finalPhone.substring(2)) || (p.length === 12 && finalPhone === p.substring(2));
      });
      if (existingAdv) {
        alert(`Ya existe un asesor registrado con el número ${finalPhone} (${existingAdv.name}). Puedes editarlo directamente en la lista.`);
        return;
      }

      const newAdv = {
        id: `adv_${Date.now()}`,
        name: formData.name.trim(),
        phone: finalPhone,
        lid: cleanLid,
        role: formData.role,
        active: formData.active,
        receiveSupport: formData.receiveSupport,
        receiveOrders: formData.receiveOrders,
        canExecuteCommands: formData.canExecuteCommands
      };
      updatedList = [...advisors, newAdv];
    }

    setAdvisors(updatedList);
    handleCloseModal();
    await persistAdvisors(updatedList);
  };

  // Alternar estado activo / inactivo rápidamente
  const handleToggleActive = async (advId) => {
    const updated = advisors.map(a => {
      if (a.id === advId) {
        return { ...a, active: !a.active };
      }
      return a;
    });
    setAdvisors(updated);
    await persistAdvisors(updated);
  };

  // Eliminar asesor
  const handleDeleteAdvisor = async (advId) => {
    const updated = advisors.filter(a => a.id !== advId);
    setAdvisors(updated);
    setDeleteConfirmId(null);
    await persistAdvisors(updated);
  };

  // Filtro de búsqueda
  const filteredAdvisors = advisors.filter(adv => {
    const term = searchTerm.toLowerCase();
    return (
      (adv.name && adv.name.toLowerCase().includes(term)) ||
      (adv.phone && String(adv.phone).includes(term)) ||
      (adv.lid && String(adv.lid).includes(term)) ||
      (adv.role && adv.role.toLowerCase().includes(term))
    );
  });

  const activeCount = advisors.filter(a => a.active).length;
  const supportCount = advisors.filter(a => a.active && a.receiveSupport !== false).length;
  const ordersCount = advisors.filter(a => a.active && a.receiveOrders).length;

  return (
    <div className="fade-in" style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px 48px 20px' }}>
      {/* Top Banner / Header */}
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
            <span className="badge badge-live">
              <span className="pulse-dot"></span>
              Sincronizado en Tiempo Real
            </span>
            <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
              Firebase &bull; Firestore
            </span>
          </div>
          <h2 style={{ fontSize: '1.6rem', color: '#fff', marginTop: '6px', letterSpacing: '-0.02em' }}>
            Gestión de Asesores & Permisos
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Agrega o retira asesores, asigna números de WhatsApp, y gestiona quién atiende soporte y ejecuta comandos del bot.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => handleOpenModal()}
            className="btn btn-primary"
            style={{ padding: '10px 18px', fontSize: '0.92rem', boxShadow: '0 0 20px rgba(37,99,235,0.4)' }}
          >
            <UserPlus size={18} />
            <span>Agregar Asesor</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div className="glass-panel" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Total Asesores
            </span>
            <UserCheck size={20} color="#60a5fa" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginTop: '6px' }}>
            {advisors.length}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#34d399', marginTop: '4px' }}>
            {activeCount} activo(s) en servicio
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Atención de Soporte
            </span>
            <MessageSquare size={20} color="#34d399" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginTop: '6px' }}>
            {supportCount}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Reciben alertas de clientes (!atender)
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Enrutamiento Pedidos
            </span>
            <ShoppingBag size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginTop: '6px' }}>
            {ordersCount}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Reciben archivos y pagos confirmados
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Permiso de Comandos
            </span>
            <Terminal size={20} color="#a78bfa" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginTop: '6px' }}>
            {advisors.filter(a => a.active && a.canExecuteCommands !== false).length}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Autorizados en WhatsApp (!cola, !fin)
          </div>
        </div>
      </div>

      {/* Information Callout: LID WhatsApp */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px'
      }}>
        <HelpCircle size={22} color="#60a5fa" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#bfdbfe' }}>
              Identificación Precisa de Asesores (Nombre Real vs Números de WhatsApp)
            </span>
            <button
              onClick={() => setShowLidHelp(!showLidHelp)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#60a5fa',
                fontSize: '0.78rem',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              {showLidHelp ? 'Ocultar explicación' : '¿Cómo funciona el LID de WhatsApp?'}
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.45 }}>
            Cuando un cliente pide soporte y un asesor escribe <strong style={{ color: '#fff' }}>!atender</strong>,
            el bot consulta esta lista para mostrar su nombre real (ej. <em style={{ color: '#34d399' }}>Manuel Delgado</em>)
            en el aviso de inicio y evitar números sin formato o LIDs extraños.
          </p>
          {showLidHelp && (
            <div style={{
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px dashed rgba(255,255,255,0.1)',
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              lineHeight: 1.5
            }}>
              💡 <strong>¿Qué es el WhatsApp LID?</strong> En WhatsApp Multi-Device (cuando el asesor usa WhatsApp Web o Escritorio),
              WhatsApp le asigna un número de 15 dígitos (LID, ej. <code>235780886794250</code>). Si lo conoces, puedes colocarlo en la casilla LID
              para garantizar que el bot reconozca su nombre incluso si escribe desde la PC. Si no lo sabes, el bot buscará automáticamente por su teléfono celular normal.
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        marginBottom: '20px'
      }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono o LID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '38px', height: '40px', fontSize: '0.88rem' }}
          />
        </div>

        {saveSuccess && (
          <div className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '6px 12px', gap: '6px' }}>
            <CheckCircle2 size={15} />
            ¡Cambios sincronizados en el Bot!
          </div>
        )}
      </div>

      {/* Advisors Grid / List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <RefreshCw size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '12px', fontSize: '0.9rem' }}>Cargando equipo de asesores...</p>
        </div>
      ) : filteredAdvisors.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '50px 20px' }}>
          <ShieldAlert size={36} color="var(--text-dim)" style={{ margin: '0 auto 12px auto' }} />
          <h4 style={{ color: '#fff', fontSize: '1.1rem' }}>No se encontraron asesores</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '4px' }}>
            {searchTerm ? 'No hay resultados que coincidan con la búsqueda.' : 'Aún no has registrado asesores.'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '18px'
        }}>
          {filteredAdvisors.map((adv) => {
            const isDeleting = deleteConfirmId === adv.id;
            return (
              <div
                key={adv.id}
                className="glass-panel"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  border: adv.active ? '1px solid rgba(255,255,255,0.08)' : '1px dashed rgba(255,255,255,0.05)',
                  opacity: adv.active ? 1 : 0.65,
                  position: 'relative'
                }}
              >
                {/* Header: Name, Role and Active status */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: adv.role === 'admin'
                          ? 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)'
                          : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '1.05rem',
                        color: '#fff',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                        flexShrink: 0
                      }}>
                        {adv.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff', letterSpacing: '-0.01em' }}>
                          {adv.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span className="badge" style={{
                            background: adv.role === 'admin' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                            color: adv.role === 'admin' ? '#c4b5fd' : '#93c5fd',
                            fontSize: '0.72rem',
                            padding: '2px 8px'
                          }}>
                            {adv.role === 'admin' ? 'Administrador' : 'Asesor'}
                          </span>
                          <span style={{
                            fontSize: '0.72rem',
                            color: adv.active ? '#34d399' : 'var(--text-dim)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <span style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: adv.active ? '#10b981' : '#64748b'
                            }} />
                            {adv.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Active Toggle Button */}
                    <button
                      onClick={() => handleToggleActive(adv.id)}
                      style={{
                        background: adv.active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid ' + (adv.active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)'),
                        color: adv.active ? '#34d399' : 'var(--text-dim)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}
                      title={adv.active ? 'Desactivar asesor' : 'Activar asesor'}
                    >
                      <Power size={14} />
                      {adv.active ? 'On' : 'Off'}
                    </button>
                  </div>

                  {/* Phone & LID info */}
                  <div style={{
                    marginTop: '16px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px',
                    fontSize: '0.84rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Phone size={14} />
                        Teléfono:
                      </span>
                      <strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>
                        +{adv.phone}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Shield size={14} />
                        WhatsApp LID:
                      </span>
                      <span style={{
                        color: adv.lid ? '#93c5fd' : 'var(--text-dim)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.78rem'
                      }}>
                        {adv.lid ? adv.lid : 'No asignado (opcional)'}
                      </span>
                    </div>
                  </div>

                  {/* Permissions Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: adv.receiveSupport !== false ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)',
                      color: adv.receiveSupport !== false ? '#34d399' : 'var(--text-dim)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <MessageSquare size={12} />
                      Soporte
                    </span>

                    <span style={{
                      fontSize: '0.72rem',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: adv.receiveOrders ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.04)',
                      color: adv.receiveOrders ? '#fbbf24' : 'var(--text-dim)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <ShoppingBag size={12} />
                      Pedidos
                    </span>

                    <span style={{
                      fontSize: '0.72rem',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: adv.canExecuteCommands !== false ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.04)',
                      color: adv.canExecuteCommands !== false ? '#c4b5fd' : 'var(--text-dim)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Terminal size={12} />
                      Comandos
                    </span>
                  </div>
                </div>

                {/* Footer Actions */}
                <div style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}>
                  {isDeleting ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <span style={{ fontSize: '0.78rem', color: '#f43f5e', flex: 1 }}>
                        ¿Eliminar a {adv.name}?
                      </span>
                      <button
                        onClick={() => handleDeleteAdvisor(adv.id)}
                        className="btn btn-danger"
                        style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleOpenModal(adv)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}
                      >
                        <Edit3 size={14} />
                        Editar
                      </button>

                      <button
                        onClick={() => setDeleteConfirmId(adv.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f43f5e',
                          cursor: 'pointer',
                          padding: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '4px'
                        }}
                        title="Eliminar Asesor"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Crear / Editar Asesor */}
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
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '520px',
            background: 'var(--bg-sidebar)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff'
                }}>
                  <ShieldCheck size={18} />
                </div>
                <h3 style={{ fontSize: '1.15rem', color: '#fff', fontWeight: 700 }}>
                  {editingAdvisor ? 'Editar Asesor' : 'Nuevo Asesor'}
                </h3>
              </div>
              <button
                onClick={handleCloseModal}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveModal} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Nombre Completo del Asesor *
                </label>
                <input
                  type="text"
                  placeholder="ej. Manuel Delgado"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-dim)', marginBottom: '6px' }}>
                    Teléfono Celular *
                  </label>
                  <input
                    type="text"
                    placeholder="ej. 573184849332 o 3184849332"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                    Si escribes 10 dígitos, se añadirá el 57 automáticamente.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-dim)', marginBottom: '6px' }}>
                    WhatsApp LID (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. 235780886794250"
                    value={formData.lid}
                    onChange={(e) => setFormData({ ...formData, lid: e.target.value })}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                    ID de 15 dígitos en WhatsApp Web/PC.
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Rol en el Sistema
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="advisor">Asesor de Ventas & Soporte</option>
                  <option value="admin">Administrador General</option>
                </select>
              </div>

              {/* Switches / Permissions */}
              <div style={{
                background: 'var(--bg-canvas)',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Permisos & Enrutamiento
                </span>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <span style={{ fontSize: '0.88rem', color: '#fff', display: 'block' }}>Asesor Activo</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>Habilita al asesor para operar en el bot</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <span style={{ fontSize: '0.88rem', color: '#fff', display: 'block' }}>Recibir Alertas de Soporte</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>Recibe la alerta cuando un cliente pide asesor</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.receiveSupport}
                    onChange={(e) => setFormData({ ...formData, receiveSupport: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <span style={{ fontSize: '0.88rem', color: '#fff', display: 'block' }}>Recibir Alertas de Pedidos</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>Recibe los pedidos confirmados y comprobantes</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.receiveOrders}
                    onChange={(e) => setFormData({ ...formData, receiveOrders: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <span style={{ fontSize: '0.88rem', color: '#fff', display: 'block' }}>Ejecutar Comandos en WhatsApp</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>Autorizado para usar !atender, !chatear, !fin y !cola</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.canExecuteCommands}
                    onChange={(e) => setFormData({ ...formData, canExecuteCommands: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                </label>
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="btn btn-secondary"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <RefreshCw size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      {editingAdvisor ? 'Guardar Cambios' : 'Crear Asesor'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
