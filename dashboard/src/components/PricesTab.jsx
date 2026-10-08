import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  FolderPlus, Plus, Trash2, Save, CheckCircle2, RefreshCw, 
  Layers, ChevronRight, Tag, HelpCircle 
} from 'lucide-react';

export default function PricesTab() {
  const [prices, setPrices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('carteleras');
  
  // States for adding items
  const [newItemKey, setNewItemKey] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  
  // States for adding completely new category
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatId, setNewCatId] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('simple'); // 'simple' or 'nested'
  const [newSubcatName, setNewSubcatName] = useState('');

  const fetchPrices = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'config', 'prices'));
      if (snap.exists()) {
        const data = snap.data();
        setPrices(data);
        const keys = Object.keys(data);
        if (keys.length > 0 && !keys.includes(selectedCategory)) {
          setSelectedCategory(keys[0]);
        }
      }
    } catch (err) {
      console.error('Error cargando catálogo:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
  }, []);

  const handlePriceChange = (category, key, value, subcategory = null) => {
    const numVal = parseInt(value, 10);
    const updated = { ...prices };
    if (subcategory) {
      if (!updated[category][subcategory]) updated[category][subcategory] = {};
      updated[category][subcategory][key] = isNaN(numVal) ? 0 : numVal;
    } else {
      updated[category][key] = isNaN(numVal) ? 0 : numVal;
    }
    setPrices(updated);
  };

  const handleAddItem = (category, subcategory = null) => {
    if (!newItemKey.trim()) return;
    const priceNum = parseInt(newItemPrice, 10) || 0;
    const updated = { ...prices };

    if (subcategory) {
      if (!updated[category][subcategory]) updated[category][subcategory] = {};
      updated[category][subcategory][newItemKey.trim()] = priceNum;
    } else {
      if (!updated[category]) updated[category] = {};
      updated[category][newItemKey.trim()] = priceNum;
    }

    setPrices(updated);
    setNewItemKey('');
    setNewItemPrice('');
  };

  const handleDeleteItem = (category, key, subcategory = null) => {
    const updated = { ...prices };
    if (subcategory) {
      delete updated[category][subcategory][key];
    } else {
      delete updated[category][key];
    }
    setPrices(updated);
  };

  // Create brand new category
  const handleCreateCategory = (e) => {
    e.preventDefault();
    if (!newCatId.trim()) return;
    
    const catKey = newCatId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const updated = { ...prices };

    if (newCatType === 'simple') {
      updated[catKey] = {
        'Estándar': 10000
      };
    } else {
      const sub = newSubcatName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'general';
      updated[catKey] = {
        [sub]: {
          'Estándar': 15000
        }
      };
    }

    setPrices(updated);
    setSelectedCategory(catKey);
    setShowNewCatModal(false);
    setNewCatId('');
    setNewCatName('');
    setNewSubcatName('');
  };

  // Delete entire category
  const handleDeleteCategory = (catKey) => {
    if (confirm(`¿Estás seguro de eliminar completamente la categoría "${catKey}" del catálogo del bot?`)) {
      const updated = { ...prices };
      delete updated[catKey];
      setPrices(updated);
      const remainingKeys = Object.keys(updated);
      if (remainingKeys.length > 0) setSelectedCategory(remainingKeys[0]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await setDoc(doc(db, 'config', 'prices'), prices);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      alert('Error guardando en Firestore: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <RefreshCw size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '12px' }}>Cargando catálogo dinámico de servicios...</p>
      </div>
    );
  }

  if (!prices) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#fca5a5' }}>
        <p>No se encontraron datos en Firestore.</p>
        <button onClick={fetchPrices} className="btn btn-secondary" style={{ marginTop: '12px' }}>Reintentar</button>
      </div>
    );
  }

  const currentCategoryData = prices[selectedCategory] || {};
  const isNested = typeof Object.values(currentCategoryData)[0] === 'object' && Object.values(currentCategoryData)[0] !== null;

  return (
    <div className="fade-in" style={{ maxWidth: '1360px', margin: '0 auto', padding: '24px 20px 40px 20px' }}>
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
            <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
              Catálogo & Tarifas
            </span>
          </div>
          <h2 style={{ fontSize: '1.5rem', color: '#fff', marginTop: '4px' }}>Gestor Integral de Categorías y Precios</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Crea nuevas categorías de productos, gestiona opciones de tamaño y actualiza tarifas al instante.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setShowNewCatModal(true)}
            className="btn btn-primary"
            style={{ padding: '9px 18px' }}
          >
            <FolderPlus size={17} /> Nueva Categoría
          </button>

          {saveSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '0.88rem', fontWeight: 600 }}>
              <CheckCircle2 size={18} /> ¡Sincronizado con el Bot!
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-emerald"
            style={{ padding: '9px 20px' }}
          >
            <Save size={17} />
            {saving ? 'Guardando...' : 'Guardar Catálogo'}
          </button>
        </div>
      </div>

      {/* Main Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '22px', alignItems: 'start' }}>
        {/* Sidebar of Categories */}
        <div className="glass-panel" style={{ padding: '14px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', padding: '0 6px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Categorías ({Object.keys(prices).length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {Object.keys(prices).map((catKey) => {
              const active = selectedCategory === catKey;
              return (
                <div
                  key={catKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: active ? 'rgba(59, 130, 246, 0.16)' : 'transparent',
                    border: active ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => { setSelectedCategory(catKey); setNewItemKey(''); setNewItemPrice(''); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <Tag size={15} color={active ? '#60a5fa' : 'var(--text-dim)'} />
                    <span style={{
                      fontSize: '0.88rem',
                      fontWeight: active ? 600 : 400,
                      color: active ? '#93c5fd' : 'var(--text-main)',
                      textTransform: 'capitalize',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden'
                    }}>
                      {catKey.replaceAll('_', ' ')}
                    </span>
                  </div>
                  {active && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCategory(catKey); }}
                      style={{ background: 'none', border: 'none', color: '#fda4af', cursor: 'pointer', padding: '2px' }}
                      title="Eliminar categoría"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Category Details & Pricing Table */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '1.3rem', color: '#fff', textTransform: 'capitalize' }}>
                📁 {selectedCategory.replaceAll('_', ' ')}
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {isNested ? 'Estructura multinivel (con subgrupos)' : 'Estructura simple de tamaño y tarifa'}
              </p>
            </div>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }}>
              ID: {selectedCategory}
            </span>
          </div>

          {!isNested ? (
            /* Flat category items */
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                {Object.entries(currentCategoryData).map(([key, val]) => (
                  <div
                    key={key}
                    style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                        {key}
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>$</span>
                        <input
                          type="number"
                          value={val}
                          onChange={(e) => handlePriceChange(selectedCategory, key, e.target.value)}
                          style={{ fontWeight: 600, color: '#34d399', fontSize: '1.05rem', fontFamily: 'var(--font-mono)' }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteItem(selectedCategory, key)}
                      className="btn btn-danger"
                      title="Eliminar este ítem"
                      style={{ padding: '8px', borderRadius: '6px' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Item */}
              <div style={{
                marginTop: '20px',
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px dashed rgba(59, 130, 246, 0.3)'
              }}>
                <h4 style={{ fontSize: '0.85rem', color: '#60a5fa', marginBottom: '10px' }}>➕ Añadir nuevo tamaño u opción a {selectedCategory}</h4>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Nombre/Tamaño (ej. Extra Grande, 120x80cm)"
                    value={newItemKey}
                    onChange={(e) => setNewItemKey(e.target.value)}
                    style={{ flex: 2, minWidth: '180px' }}
                  />
                  <input
                    type="number"
                    placeholder="Precio en COP"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    style={{ flex: 1, minWidth: '120px' }}
                  />
                  <button
                    onClick={() => handleAddItem(selectedCategory)}
                    className="btn btn-primary"
                  >
                    <Plus size={16} /> Añadir
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Nested subcategories */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {Object.entries(currentCategoryData).map(([subcat, subcatItems]) => (
                <div key={subcat} style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <h4 style={{ fontSize: '0.95rem', color: '#93c5fd', textTransform: 'capitalize', marginBottom: '12px' }}>
                    📁 Subcategoría: {subcat.replaceAll('_', ' ')}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                    {Object.entries(subcatItems || {}).map(([key, val]) => (
                      <div
                        key={key}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          padding: '12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                            {key}
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>$</span>
                            <input
                              type="number"
                              value={val}
                              onChange={(e) => handlePriceChange(selectedCategory, key, e.target.value, subcat)}
                              style={{ fontWeight: 600, color: '#34d399', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteItem(selectedCategory, key, subcat)}
                          className="btn btn-danger"
                          title="Eliminar opción"
                          style={{ padding: '6px', borderRadius: '6px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Category */}
      {showNewCatModal && (
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
          <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '460px', padding: '28px', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '6px' }}>✨ Crear Nueva Categoría de Servicio</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Agrega una nueva línea de productos que tu bot podrá cotizar.
            </p>

            <form onSubmit={handleCreateCategory} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Nombre de la Categoría
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Tarjetas Personales o Vinilos"
                  value={newCatId}
                  onChange={(e) => setNewCatId(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Tipo de Categoría
                </label>
                <select value={newCatType} onChange={(e) => setNewCatType(e.target.value)}>
                  <option value="simple">Simple (Lista directa de productos/tamaños y precios)</option>
                  <option value="nested">Compuesta (Con subcategorías, ej. materiales o tipos)</option>
                </select>
              </div>

              {newCatType === 'nested' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                    Primera Subcategoría inicial
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Mate, Brillante, Premium"
                    value={newSubcatName}
                    onChange={(e) => setNewSubcatName(e.target.value)}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewCatModal(false)}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Crear Categoría
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
