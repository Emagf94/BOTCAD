import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Users, Search, RefreshCw, MessageCircle, Phone, Calendar } from 'lucide-react';

export default function ContactsTab() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), orderBy('updatedAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setContacts(data);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const filteredContacts = contacts.filter(contact => {
    const search = searchTerm.toLowerCase();
    return (
      (contact.name && contact.name.toLowerCase().includes(search)) ||
      (contact.phone && String(contact.phone).toLowerCase().includes(search)) ||
      (contact.contactUser && contact.contactUser.toLowerCase().includes(search))
    );
  });

  return (
    <div className="fade-in" style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 20px 40px 20px' }}>
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
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              Base de Datos
            </span>
          </div>
          <h2 style={{ fontSize: '1.5rem', color: '#fff', marginTop: '4px' }}>Contactos & Clientes</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Lista de todas las personas que han interactuado con el bot.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Buscar contacto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '36px', width: '220px', fontSize: '0.88rem' }}
            />
          </div>
          <button onClick={fetchContacts} className="btn btn-secondary" style={{ padding: '9px' }} title="Recargar">
            <RefreshCw size={17} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            <RefreshCw size={28} className="spin" style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            <p style={{ marginTop: '12px' }}>Cargando contactos...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            <Users size={32} style={{ margin: '0 auto', opacity: 0.5 }} />
            <p style={{ marginTop: '12px' }}>No se encontraron contactos.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '14px 20px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Nombre</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Teléfono</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Usuario Adicional</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Última Interacción</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s' }} className="hover-row">
                    <td style={{ padding: '16px 20px', color: '#fff', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700 }}>
                          {contact.name ? contact.name.charAt(0).toUpperCase() : '?'}
                        </div>
                        {contact.name || 'Desconocido'}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Phone size={14} color="var(--text-dim)" />
                        +{contact.phone || contact.id}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                      {contact.contactUser || '-'}
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} />
                        {contact.updatedAt ? new Date(contact.updatedAt.seconds * 1000).toLocaleString() : '-'}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <a 
                        href={`https://wa.me/${contact.phone || contact.id}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex' }}
                      >
                        <MessageCircle size={14} /> Chatear
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
