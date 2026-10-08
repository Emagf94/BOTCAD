import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  GitBranch, Play, MessageSquare, ArrowRight, CornerDownRight, 
  Sparkles, CheckCircle2, Save, RefreshCw, ZoomIn, ZoomOut, 
  Plus, Trash2, Edit3, User, Phone, DollarSign, Printer, Bot, HelpCircle
} from 'lucide-react';

export default function FlowDiagram() {
  const [messages, setMessages] = useState(null);
  const [customNodes, setCustomNodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState('welcome');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);

  // New Node Form State
  const [newNodeTitle, setNewNodeTitle] = useState('');
  const [newNodeLevel, setNewNodeLevel] = useState(3);
  const [newNodeBadge, setNewNodeBadge] = useState('Custom Intent');
  const [newNodeTriggers, setNewNodeTriggers] = useState('');
  const [newNodeResponse, setNewNodeResponse] = useState('');

  const textareaRef = useRef(null);

  // Variable Chips definition
  const variableChips = [
    { label: 'Nombre Cliente', code: '{name}', icon: User, color: '#60a5fa' },
    { label: 'Teléfono Cliente', code: '{phone}', icon: Phone, color: '#34d399' },
    { label: 'Total Pagar', code: '{totalPrice}', icon: DollarSign, color: '#f59e0b' },
    { label: 'Servicio', code: '{itemName}', icon: Printer, color: '#a78bfa' },
    { label: 'Nombre Bot', code: '{botName}', icon: Bot, color: '#38bdf8' },
    { label: 'Teléfono Soporte', code: '{adminPhone}', icon: HelpCircle, color: '#f472b6' }
  ];

  const fetchFlows = async () => {
    setLoading(true);
    try {
      const snapFlows = await getDoc(doc(db, 'config', 'bot_flows'));
      if (snapFlows.exists()) setMessages(snapFlows.data());

      const snapCustom = await getDoc(doc(db, 'config', 'custom_nodes'));
      if (snapCustom.exists()) setCustomNodes(snapCustom.data());
    } catch (e) {
      console.error('Error cargando diagramas:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlows();
  }, []);

  // System predefined nodes
  const defaultNodes = [
    {
      id: 'welcome',
      title: 'Intent: Default Welcome',
      badge: 'Trigger / Entrada',
      badgeColor: '#10b981',
      triggers: ['hola', 'buenos días', 'inicio', 'menu', '0'],
      key: 'bienvenidaRegistrado',
      keyAlt: 'bienvenidaNuevo',
      description: 'Nodo inicial cuando el cliente escribe por primera vez o reinicia la interacción.',
      level: 1,
      isSystem: true
    },
    {
      id: 'main_menu',
      title: 'Decisión: Menú Principal',
      badge: 'Router / Opciones',
      badgeColor: '#3b82f6',
      triggers: ['Opciones 1 al 9'],
      description: 'Despliega los 9 servicios y rutas disponibles en CAD Impresiones.',
      branches: [
        { label: '1. Carteleras', target: 'carteleras' },
        { label: '2. Planos CAD', target: 'planos' },
        { label: '3. Documentos & Fotos', target: 'documentos' },
        { label: '4. Gran Formato', target: 'gran_formato' },
        { label: '7. Métodos Pago', target: 'pago_transferencia' },
        { label: '8. FAQ Ubicación/Horarios', target: 'faq_ubicacion' },
        { label: '9. Asesor Humano', target: 'asesor' }
      ],
      level: 2,
      isSystem: true
    },
    {
      id: 'faq_ubicacion',
      title: 'Intent: FAQ Ubicación & Horarios',
      badge: 'Informativo',
      badgeColor: '#8b5cf6',
      triggers: ['donde estan', 'ubicacion', 'horario', 'abren'],
      key: 'ubicacion',
      key2: 'horarios',
      description: 'Envía información de local físico y horarios sin interrumpir el flujo.',
      level: 3,
      isSystem: true
    },
    {
      id: 'asesor',
      title: 'Fulfillment: Asesor Humano',
      badge: 'Escalamiento',
      badgeColor: '#f59e0b',
      triggers: ['asesor', 'humano', 'persona', 'opción 9'],
      key: 'soporteAsesor',
      description: 'Pausa el bot, encola la solicitud y notifica al WhatsApp del asesor con !atender.',
      level: 3,
      isSystem: true
    },
    {
      id: 'recepcion_archivos',
      title: 'Step: Recepción de Archivos',
      badge: 'Captura Media',
      badgeColor: '#06b6d4',
      triggers: ['PDF', 'JPG', 'PNG', 'Corel (.cdr)', 'AI'],
      description: 'Guarda archivos en disco, detecta conteo de páginas de PDF y pide copias.',
      level: 3,
      isSystem: true
    },
    {
      id: 'pago_transferencia',
      title: 'Checkout: Transferencia',
      badge: 'Pasarela',
      badgeColor: '#ec4899',
      triggers: ['Bancolombia', 'Nequi', 'Daviplata', 'Opción 1 en checkout'],
      key: 'pagoTransferencia',
      description: 'Envía QR de pago y solicita comprobante antes de mandar a producción.',
      level: 4,
      isSystem: true
    },
    {
      id: 'pago_efectivo',
      title: 'Checkout: Efectivo en Caja',
      badge: 'Pasarela',
      badgeColor: '#ec4899',
      triggers: ['Efectivo', 'Opción 2 en checkout'],
      key: 'pagoEfectivo',
      description: 'Notifica que el pedido inicia al acercarse a pagar en el local físico.',
      level: 4,
      isSystem: true
    },
    {
      id: 'pedido_exitoso',
      title: 'End Session: Pedido Confirmado',
      badge: 'Finalización',
      badgeColor: '#10b981',
      triggers: ['Validación comprobante'],
      key: 'pedidoExitoso',
      description: 'Envía sticker de agradecimiento, cierra el pedido y notifica al admin.',
      level: 5,
      isSystem: true
    }
  ];

  // Merge default nodes + custom nodes from Firestore
  const allCustomNodeList = Object.entries(customNodes).map(([id, data]) => ({
    id,
    title: data.title || id,
    badge: data.badge || 'Personalizado',
    badgeColor: '#8b5cf6',
    triggers: data.triggers || [],
    description: data.description || 'Nodo creado por el usuario en Flow Graph',
    response: data.response || '',
    level: data.level || 3,
    isSystem: false
  }));

  const allNodes = [...defaultNodes, ...allCustomNodeList];
  const selectedNode = allNodes.find(n => n.id === selectedNodeId) || allNodes[0];

  // Insert variable chip into active textarea
  const insertVariable = (varCode) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;

    const newVal = val.substring(0, start) + varCode + val.substring(end);

    if (selectedNode.isSystem) {
      if (selectedNode.key) {
        setMessages(prev => ({ ...prev, [selectedNode.key]: newVal }));
      }
    } else {
      setCustomNodes(prev => ({
        ...prev,
        [selectedNode.id]: {
          ...prev[selectedNode.id],
          response: newVal
        }
      }));
    }

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + varCode.length, start + varCode.length);
    }, 50);
  };

  const handleSystemTextChange = (key, text) => {
    setMessages(prev => ({ ...prev, [key]: text }));
  };

  const handleCustomNodeChange = (field, val) => {
    setCustomNodes(prev => ({
      ...prev,
      [selectedNode.id]: {
        ...prev[selectedNode.id],
        [field]: val
      }
    }));
  };

  const handleCreateNode = (e) => {
    e.preventDefault();
    if (!newNodeTitle.trim()) return;

    const id = 'custom_' + Date.now();
    const triggersArray = newNodeTriggers.split(',').map(s => s.trim()).filter(Boolean);

    const newObj = {
      title: newNodeTitle.trim(),
      badge: newNodeBadge.trim() || 'Intent Personalizado',
      level: parseInt(newNodeLevel, 10) || 3,
      triggers: triggersArray,
      response: newNodeResponse.trim(),
      description: `Responde automáticamente a: ${triggersArray.join(', ')}`
    };

    setCustomNodes(prev => ({ ...prev, [id]: newObj }));
    setSelectedNodeId(id);
    setShowAddModal(false);

    setNewNodeTitle('');
    setNewNodeTriggers('');
    setNewNodeResponse('');
  };

  const handleDeleteCustomNode = (nodeId) => {
    if (confirm('¿Deseas eliminar este nodo del diagrama y del bot?')) {
      const updated = { ...customNodes };
      delete updated[nodeId];
      setCustomNodes(updated);
      setSelectedNodeId('welcome');
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      if (messages) {
        await setDoc(doc(db, 'config', 'bot_flows'), messages);
      }
      await setDoc(doc(db, 'config', 'custom_nodes'), customNodes);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (e) {
      alert('Error guardando flujos: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <RefreshCw size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '12px' }}>Cargando canvas del diagrama interactivo...</p>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ height: 'calc(100vh - 52px)', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar of Canvas */}
      <div style={{
        padding: '10px 24px',
        background: 'var(--bg-topbar)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(59, 130, 246, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#60a5fa'
          }}>
            <GitBranch size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', color: '#fff' }}>Flow Graph Canvas &bull; Editor Interactivo</h2>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Crea nuevos intents, visualiza la arquitectura y usa botones de variables con 1 clic
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
            style={{ padding: '8px 14px', fontSize: '0.85rem' }}
          >
            <Plus size={16} /> Crear Nodo / Intent
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '6px',
            padding: '2px',
            border: '1px solid var(--border-subtle)'
          }}>
            <button
              onClick={() => setZoomLevel(prev => Math.max(0.7, prev - 0.1))}
              className="btn btn-secondary"
              style={{ padding: '5px 7px' }}
              title="Alejar"
            >
              <ZoomOut size={15} />
            </button>
            <span style={{ fontSize: '0.75rem', padding: '0 8px', color: 'var(--text-dim)' }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel(prev => Math.min(1.3, prev + 0.1))}
              className="btn btn-secondary"
              style={{ padding: '5px 7px' }}
              title="Acercar"
            >
              <ZoomIn size={15} />
            </button>
          </div>

          {saveSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#34d399', fontSize: '0.82rem', fontWeight: 600 }}>
              <CheckCircle2 size={16} /> ¡Sincronizado!
            </div>
          )}

          <button onClick={handleSaveAll} disabled={saving} className="btn btn-emerald" style={{ padding: '8px 18px' }}>
            <Save size={16} />
            {saving ? 'Guardando...' : 'Guardar Todo'}
          </button>
        </div>
      </div>

      {/* Main Workspace (Canvas + Inspector) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', flex: 1, overflow: 'hidden' }}>
        {/* Canvas Viewport */}
        <div className="canvas-grid" style={{ overflow: 'auto', padding: '36px', position: 'relative' }}>
          <div style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top left',
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
            minWidth: '950px',
            transition: 'transform 0.12s ease'
          }}>
            {/* Level 1 */}
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.06em' }}>
                Nivel 1 &bull; Punto de Entrada
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {allNodes.filter(n => n.level === 1).map(n => (
                  <div
                    key={n.id}
                    onClick={() => setSelectedNodeId(n.id)}
                    className={`flow-node ${selectedNodeId === n.id ? 'active-node' : ''}`}
                    style={{ width: '380px', padding: '16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.92rem' }}>{n.title}</span>
                      <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                        {n.badge}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>{n.description}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {n.triggers?.map(t => (
                        <span key={t} style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: '#94a3b8' }}>
                          "{t}"
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Level 2 */}
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.06em' }}>
                Nivel 2 &bull; Enrutador Principal
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {allNodes.filter(n => n.level === 2).map(n => (
                  <div
                    key={n.id}
                    onClick={() => setSelectedNodeId(n.id)}
                    className={`flow-node ${selectedNodeId === n.id ? 'active-node' : ''}`}
                    style={{ width: '420px', padding: '16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.92rem' }}>{n.title}</span>
                      <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                        {n.badge}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>{n.description}</p>
                    {n.branches && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {n.branches.map(b => (
                          <div key={b.label} style={{ fontSize: '0.74rem', color: '#cbd5e1', background: 'rgba(255,255,255,0.04)', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <CornerDownRight size={12} color="#3b82f6" /> {b.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Level 3 */}
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.06em' }}>
                Nivel 3 &bull; Flujos de Ejecución, Soporte & Nodos Personalizados ({allNodes.filter(n => n.level === 3).length})
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {allNodes.filter(n => n.level === 3).map(n => (
                  <div
                    key={n.id}
                    onClick={() => setSelectedNodeId(n.id)}
                    className={`flow-node ${selectedNodeId === n.id ? 'active-node' : ''}`}
                    style={{ width: '310px', padding: '16px', borderColor: !n.isSystem ? 'rgba(139, 92, 246, 0.4)' : undefined }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{n.title}</span>
                      <span className="badge" style={{ background: !n.isSystem ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.08)', color: !n.isSystem ? '#c084fc' : n.badgeColor }}>
                        {n.badge}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '10px' }}>{n.description}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {n.triggers?.map(t => (
                        <span key={t} style={{ fontSize: '0.68rem', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: '#94a3b8' }}>
                          "{t}"
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Level 4 */}
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.06em' }}>
                Nivel 4 &bull; Pasarelas de Pago
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {allNodes.filter(n => n.level === 4).map(n => (
                  <div
                    key={n.id}
                    onClick={() => setSelectedNodeId(n.id)}
                    className={`flow-node ${selectedNodeId === n.id ? 'active-node' : ''}`}
                    style={{ width: '310px', padding: '16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{n.title}</span>
                      <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>
                        {n.badge}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{n.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Level 5 */}
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.06em' }}>
                Nivel 5 &bull; Cierre & Finalización
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {allNodes.filter(n => n.level === 5).map(n => (
                  <div
                    key={n.id}
                    onClick={() => setSelectedNodeId(n.id)}
                    className={`flow-node ${selectedNodeId === n.id ? 'active-node' : ''}`}
                    style={{ width: '340px', padding: '16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{n.title}</span>
                      <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                        {n.badge}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{n.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Inspector Panel */}
        <div style={{
          background: 'var(--bg-sidebar)',
          borderLeft: '1px solid var(--border-subtle)',
          padding: '22px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          {/* Header of Inspector */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span className="badge" style={{ background: !selectedNode.isSystem ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: !selectedNode.isSystem ? '#c084fc' : '#60a5fa' }}>
                {!selectedNode.isSystem ? 'Nodo Personalizado' : 'Nodo del Sistema'}
              </span>

              {!selectedNode.isSystem && (
                <button
                  onClick={() => handleDeleteCustomNode(selectedNode.id)}
                  className="btn btn-danger"
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                  title="Eliminar este nodo"
                >
                  <Trash2 size={13} /> Eliminar
                </button>
              )}
            </div>

            <h3 style={{ fontSize: '1.2rem', color: '#fff' }}>{selectedNode.title}</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {selectedNode.description}
            </p>
          </div>

          {/* Training Phrases / Keywords */}
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#93c5fd', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} /> Training Phrases (Palabras Clave)
            </div>
            
            {!selectedNode.isSystem ? (
              <div>
                <input
                  type="text"
                  value={(selectedNode.triggers || []).join(', ')}
                  onChange={(e) => handleCustomNodeChange('triggers', e.target.value.split(',').map(s => s.trim()))}
                  placeholder="ej. promocion, descuento, ofertas"
                  style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                  Separadas por comas. El bot responderá cuando el cliente escriba cualquiera de estas palabras.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {selectedNode.triggers?.map(t => (
                  <span key={t} style={{ fontSize: '0.72rem', background: 'rgba(59, 130, 246, 0.15)', padding: '3px 7px', borderRadius: '4px', color: '#bfdbfe' }}>
                    "{t}"
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Interactive Variable Insertion Buttons (Chips) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>
                Insertar Variable con 1 Clic:
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              {variableChips.map((chip) => {
                const Icon = chip.icon;
                return (
                  <button
                    key={chip.code}
                    type="button"
                    onClick={() => insertVariable(chip.code)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 9px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      color: chip.color,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title={`Insertar ${chip.code} en el texto`}
                  >
                    <Icon size={12} />
                    <span>{chip.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Response Textarea for System or Custom node */}
            {selectedNode.isSystem && selectedNode.key && (
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Respuesta del Bot en WhatsApp ({selectedNode.key})
                </label>
                <textarea
                  ref={textareaRef}
                  rows={7}
                  value={messages ? (messages[selectedNode.key] || '') : ''}
                  onChange={(e) => handleSystemTextChange(selectedNode.key, e.target.value)}
                  style={{ fontSize: '0.88rem', lineHeight: '1.4' }}
                />
              </div>
            )}

            {!selectedNode.isSystem && (
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Respuesta del Bot en WhatsApp
                </label>
                <textarea
                  ref={textareaRef}
                  rows={7}
                  value={selectedNode.response || ''}
                  onChange={(e) => handleCustomNodeChange('response', e.target.value)}
                  style={{ fontSize: '0.88rem', lineHeight: '1.4' }}
                />
              </div>
            )}

            {selectedNode.keyAlt && (
              <div style={{ marginTop: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Respuesta Variante ({selectedNode.keyAlt})
                </label>
                <textarea
                  rows={4}
                  value={messages ? (messages[selectedNode.keyAlt] || '') : ''}
                  onChange={(e) => handleSystemTextChange(selectedNode.keyAlt, e.target.value)}
                  style={{ fontSize: '0.88rem', lineHeight: '1.4' }}
                />
              </div>
            )}
          </div>

          {/* Bottom Save */}
          <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <button onClick={handleSaveAll} disabled={saving} className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>
              <Save size={16} /> {saving ? 'Guardando...' : 'Aplicar en Vivo al Bot'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Create New Node */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '500px', padding: '28px', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '6px' }}>
              ✨ Crear Nuevo Nodo / Intent en el Flow Graph
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Añade una intención con sus palabras clave y respuesta automática para el bot.
            </p>

            <form onSubmit={handleCreateNode} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Título del Nodo / Intención
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Promociones del Mes, Datos Bancarios"
                  value={newNodeTitle}
                  onChange={(e) => setNewNodeTitle(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Nivel en el Diagrama
                </label>
                <select value={newNodeLevel} onChange={(e) => setNewNodeLevel(e.target.value)}>
                  <option value={1}>Nivel 1 (Punto de Entrada / Saludo)</option>
                  <option value={2}>Nivel 2 (Router / Menú Principal)</option>
                  <option value={3}>Nivel 3 (Fulfillment / Respuesta a Consulta)</option>
                  <option value={4}>Nivel 4 (Checkout / Pasarela)</option>
                  <option value={5}>Nivel 5 (Cierre / Finalización)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Palabras Clave Disparadoras (Triggers)
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. promocion, descuento, rebaja, 2x1 (separadas por comas)"
                  value={newNodeTriggers}
                  onChange={(e) => setNewNodeTriggers(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Texto de Respuesta del Bot
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Hola {name}, nuestras promociones vigentes son..."
                  value={newNodeResponse}
                  onChange={(e) => setNewNodeResponse(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Crear Nodo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
