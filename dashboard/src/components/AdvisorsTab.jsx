import React, { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ShieldCheck, ShieldAlert, UserPlus, Search, Phone, Shield,
  CheckCircle2, AlertTriangle, Trash2, Edit3, X,
  Save, RefreshCw, UserCheck, MessageSquare,
  ShoppingBag, Terminal, Power, Clock, Calendar, Send,
  Zap, Sun, Moon, Copy, Plus, Sparkles
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

const DEFAULT_SCHEDULE = {
  mode: 'auto', // 'auto' | 'always_open' | 'always_closed'
  timezone: 'America/Bogota',
  days: {
    1: { name: 'Lunes', enabled: true, slots: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
    2: { name: 'Martes', enabled: true, slots: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
    3: { name: 'Miércoles', enabled: true, slots: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
    4: { name: 'Jueves', enabled: true, slots: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
    5: { name: 'Viernes', enabled: true, slots: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
    6: { name: 'Sábado', enabled: false, slots: [{ start: '09:00', end: '13:00' }] },
    0: { name: 'Domingo', enabled: false, slots: [] }
  },
  outOfHoursMessage: '🌙 *Fuera de horario*\n\nActualmente nuestros asesores no están disponibles.\nNuestro horario de atención es:\n{schedule_summary}\n\nEscribe *0* para volver al menú principal.',
  testMode: {
    enabled: false,
    bypassSchedule: true,
    testPhones: ['573184849332'],
    notifyOnlyTestAdvisors: false
  }
};

export default function AdvisorsTab() {
  // Navigation Sub-tab
  const [activeSubTab, setActiveSubTab] = useState('team'); // 'team' | 'schedule' | 'test_mode'

  // Advisors State
  const [advisors, setAdvisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAdvisor, setEditingAdvisor] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Schedule State
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Form State (Advisor Modal)
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

  // Simulator & Test Mode State
  const [simUseRealtime, setSimUseRealtime] = useState(true);
  const [simDay, setSimDay] = useState(1);
  const [simTime, setSimTime] = useState('10:00');
  const [simTestPhone, setSimTestPhone] = useState('');
  const [newTestPhoneInput, setNewTestPhoneInput] = useState('');
  const [liveTestTarget, setLiveTestTarget] = useState('all');
  const [liveTestSubject, setLiveTestSubject] = useState('Prueba de alerta de asesor desde el panel');
  const [liveTestSending, setLiveTestSending] = useState(false);
  const [liveTestResult, setLiveTestResult] = useState(null);

  // Current Colombia Time Clock
  const [currentTimeBogota, setCurrentTimeBogota] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeBogota(now.toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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
        }
        if (data.schedule) {
          setSchedule({
            ...DEFAULT_SCHEDULE,
            ...data.schedule,
            days: { ...DEFAULT_SCHEDULE.days, ...(data.schedule.days || {}) },
            testMode: { ...DEFAULT_SCHEDULE.testMode, ...(data.schedule.testMode || {}) }
          });
        }
        setLoading(false);
        return;
      }

      // Si aún no existe el documento, inicializarlo
      try {
        setAdvisors(INITIAL_ADVISORS);
        setSchedule(DEFAULT_SCHEDULE);
        await setDoc(docRef, {
          advisors: INITIAL_ADVISORS,
          list: INITIAL_ADVISORS,
          schedule: DEFAULT_SCHEDULE,
          updatedAt: new Date().toISOString()
        }, { merge: true });
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

  // 2. Escucha en tiempo real de resultados de prueba (config/advisor_test)
  useEffect(() => {
    const testDocRef = doc(db, 'config', 'advisor_test');
    const unsub = onSnapshot(testDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.lastResult) {
          setLiveTestResult(data.lastResult);
        }
      }
    }, (err) => {
      console.warn('Error escuchando advisor_test:', err);
    });
    return () => unsub();
  }, []);

  // Helper para persistir asesores y configuración derivada
  const persistAdvisors = async (updatedList, updatedSchedule = schedule) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'advisors'), {
        advisors: updatedList,
        list: updatedList,
        schedule: updatedSchedule,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Calcular variables derivadas para config/general
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

  // Guardar Horarios y Configuración de Prueba
  const handleSaveSchedule = async (newSchedule = schedule) => {
    setScheduleSaving(true);
    try {
      await setDoc(doc(db, 'config', 'advisors'), {
        schedule: newSchedule,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setScheduleSuccess(true);
      setTimeout(() => setScheduleSuccess(false), 3000);
    } catch (err) {
      alert('Error guardando horarios: ' + err.message);
    } finally {
      setScheduleSaving(false);
    }
  };

  // Modificar días en el horario
  const handleDayToggle = (dayKey) => {
    const updatedDays = {
      ...schedule.days,
      [dayKey]: {
        ...schedule.days[dayKey],
        enabled: !schedule.days[dayKey].enabled
      }
    };
    const updated = { ...schedule, days: updatedDays };
    setSchedule(updated);
  };

  const handleAddSlot = (dayKey) => {
    const currentSlots = schedule.days[dayKey].slots || [];
    const newSlots = [...currentSlots, { start: '14:00', end: '18:00' }];
    const updatedDays = {
      ...schedule.days,
      [dayKey]: {
        ...schedule.days[dayKey],
        slots: newSlots
      }
    };
    setSchedule({ ...schedule, days: updatedDays });
  };

  const handleRemoveSlot = (dayKey, slotIndex) => {
    const currentSlots = schedule.days[dayKey].slots || [];
    const newSlots = currentSlots.filter((_, idx) => idx !== slotIndex);
    const updatedDays = {
      ...schedule.days,
      [dayKey]: {
        ...schedule.days[dayKey],
        slots: newSlots
      }
    };
    setSchedule({ ...schedule, days: updatedDays });
  };

  const handleSlotChange = (dayKey, slotIndex, field, value) => {
    const currentSlots = [...(schedule.days[dayKey].slots || [])];
    currentSlots[slotIndex] = {
      ...currentSlots[slotIndex],
      [field]: value
    };
    const updatedDays = {
      ...schedule.days,
      [dayKey]: {
        ...schedule.days[dayKey],
        slots: currentSlots
      }
    };
    setSchedule({ ...schedule, days: updatedDays });
  };

  // Copiar horario de lunes a viernes
  const handleCopyMondayToWeek = () => {
    const mondayConfig = schedule.days[1];
    if (!mondayConfig) return;
    const updatedDays = { ...schedule.days };
    [2, 3, 4, 5].forEach(d => {
      updatedDays[d] = {
        ...updatedDays[d],
        enabled: mondayConfig.enabled,
        slots: JSON.parse(JSON.stringify(mondayConfig.slots || []))
      };
    });
    setSchedule({ ...schedule, days: updatedDays });
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  // Gestión de Teléfonos de Prueba
  const handleAddTestPhone = () => {
    if (!newTestPhoneInput.trim()) return;
    let clean = newTestPhoneInput.replace(/\D/g, '');
    if (clean.length === 10) clean = '57' + clean;
    if (clean.length < 10) {
      alert('Ingresa un teléfono válido de al menos 10 dígitos.');
      return;
    }
    const currentList = schedule.testMode?.testPhones || [];
    if (!currentList.includes(clean)) {
      const updated = {
        ...schedule,
        testMode: {
          ...schedule.testMode,
          testPhones: [...currentList, clean]
        }
      };
      setSchedule(updated);
      handleSaveSchedule(updated);
    }
    setNewTestPhoneInput('');
  };

  const handleRemoveTestPhone = (phoneToRemove) => {
    const currentList = schedule.testMode?.testPhones || [];
    const updated = {
      ...schedule,
      testMode: {
        ...schedule.testMode,
        testPhones: currentList.filter(p => p !== phoneToRemove)
      }
    };
    setSchedule(updated);
    handleSaveSchedule(updated);
  };

  // Disparar Alerta de Prueba a WhatsApp
  const handleTriggerLiveTestAlert = async () => {
    setLiveTestSending(true);
    try {
      await setDoc(doc(db, 'config', 'advisor_test'), {
        action: 'SEND_TEST_ALERT',
        actionTimestamp: Date.now(),
        targetAdvisorPhone: liveTestTarget,
        mockClientName: 'Cliente Simulado (Panel CAD)',
        mockClientPhone: '573001234567',
        mockSubject: liveTestSubject.trim() || 'Verificación de alertas y comando !atender'
      }, { merge: true });
    } catch (e) {
      alert('Error solicitando alerta de prueba: ' + e.message);
    } finally {
      setTimeout(() => setLiveTestSending(false), 1500);
    }
  };

  // Formateador de resumen de horario en español
  const formatScheduleSummaryText = (sched = schedule) => {
    if (sched.mode === 'always_open') return 'Atención 24 horas al día, 7 días a la semana.';
    if (sched.mode === 'always_closed') return 'Actualmente cerrado por descanso o mantenimiento.';

    const days = sched.days || DEFAULT_SCHEDULE.days;
    const formatTime12h = (t) => {
      if (!t) return '';
      const [hStr, mStr] = t.split(':');
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr || '0', 10);
      const ampm = h >= 12 ? 'pm' : 'am';
      const h12 = h % 12 || 12;
      return m === 0 ? `${h12}:00${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
    };

    const formatDaySlots = (slots) => {
      if (!slots || slots.length === 0) return 'Cerrado';
      return slots.map(s => `${formatTime12h(s.start)} a ${formatTime12h(s.end)}`).join(' y de ');
    };

    const monFriSlots = JSON.stringify(days[1]?.slots || []);
    const isMonFriSame = [2, 3, 4, 5].every(d => days[d]?.enabled === days[1]?.enabled && JSON.stringify(days[d]?.slots || []) === monFriSlots);

    const parts = [];
    if (days[1]?.enabled && isMonFriSame) {
      parts.push(`Lunes a viernes de ${formatDaySlots(days[1].slots)}.`);
    } else {
      [1, 2, 3, 4, 5].forEach(k => {
        const d = days[k];
        if (d?.enabled && d.slots?.length > 0) {
          parts.push(`${d.name}: de ${formatDaySlots(d.slots)}.`);
        }
      });
    }

    if (days[6]?.enabled && days[6].slots?.length > 0) {
      parts.push(`Sábados de ${formatDaySlots(days[6].slots)}.`);
    }
    if (days[0]?.enabled && days[0].slots?.length > 0) {
      parts.push(`Domingos de ${formatDaySlots(days[0].slots)}.`);
    }

    if (parts.length === 0) return 'Sin horarios de atención activos.';
    return parts.join('\n');
  };

  // Motor de Evaluación de Disponibilidad para el Simulador
  const evaluateScheduleAvailability = (evalDate, testPhone = '') => {
    // 1. Evaluar bypass de modo de prueba
    if (schedule.testMode?.enabled && testPhone) {
      const clean = String(testPhone).replace(/\D/g, '');
      const testList = schedule.testMode.testPhones || [];
      const isTest = testList.some(tp => {
        const ctp = String(tp).replace(/\D/g, '');
        return ctp && (clean === ctp || clean.endsWith(ctp) || ctp.endsWith(clean));
      });
      if (isTest && schedule.testMode.bypassSchedule !== false) {
        return {
          isAvailable: true,
          reason: 'TEST_MODE_BYPASS',
          label: 'Bypass Activo por Modo de Prueba',
          color: '#34d399',
          slotInfo: 'Acceso prioritario concedido al número de prueba.'
        };
      }
    }

    // 2. Modos Forzados
    if (schedule.mode === 'always_open') {
      return {
        isAvailable: true,
        reason: 'ALWAYS_OPEN',
        label: 'Disponible 24/7 (Modo Forzado)',
        color: '#34d399',
        slotInfo: 'El bot está configurado para atender en todo momento.'
      };
    }
    if (schedule.mode === 'always_closed') {
      return {
        isAvailable: false,
        reason: 'ALWAYS_CLOSED',
        label: 'Fuera de Horario (Modo Forzado)',
        color: '#f43f5e',
        slotInfo: 'Atención desactivada manualmente (vacaciones / feriado).'
      };
    }

    // 3. Evaluación de día y franjas
    const tz = schedule.timezone || 'America/Bogota';
    const nowInTz = new Date(evalDate.toLocaleString("en-US", { timeZone: tz }));
    const day = nowInTz.getDay();
    const currentMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();

    const dayConfig = schedule.days?.[day] || { enabled: false, name: 'Cerrado', slots: [] };
    if (!dayConfig.enabled) {
      return {
        isAvailable: false,
        reason: 'DAY_DISABLED',
        label: `Cerrado los ${dayConfig.name}`,
        color: '#f43f5e',
        slotInfo: `${dayConfig.name} no está habilitado para atención de asesores.`
      };
    }

    const slots = dayConfig.slots || [];
    for (const slot of slots) {
      if (!slot.start || !slot.end) continue;
      const [sh, sm] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      const startMin = sh * 60 + (sm || 0);
      const endMin = eh * 60 + (em || 0);

      if (currentMinutes >= startMin && currentMinutes < endMin) {
        return {
          isAvailable: true,
          reason: 'WITHIN_SLOT',
          label: `En Horario Hábil (${slot.start} - ${slot.end})`,
          color: '#34d399',
          slotInfo: `Dentro del turno laboral de los ${dayConfig.name}.`
        };
      }
    }

    return {
      isAvailable: false,
      reason: 'OUTSIDE_SLOTS',
      label: 'Fuera de Franjas de Atención',
      color: '#fbbf24',
      slotInfo: `La hora actual no coincide con ninguno de los turnos de atención del día ${dayConfig.name}.`
    };
  };

  // Cálculo del estado actual del bot en tiempo real
  const currentBotStatus = evaluateScheduleAvailability(new Date(), '');

  // Cálculo de la simulación
  const getSimulationDate = () => {
    if (simUseRealtime) return new Date();
    // Simular un día de la semana y hora específica
    const now = new Date();
    const currentDay = now.getDay();
    const diff = simDay - currentDay;
    const target = new Date(now);
    target.setDate(now.getDate() + diff);
    const [h, m] = (simTime || '10:00').split(':').map(Number);
    target.setHours(h || 0, m || 0, 0, 0);
    return target;
  };

  const simEvaluation = evaluateScheduleAvailability(getSimulationDate(), simTestPhone);

  // Generar mensaje de WhatsApp simulado
  const getSimulatedBotReply = (evalResult) => {
    if (evalResult.isAvailable) {
      return '👨‍💻 *Contacto con un Asesor*\n\nPor favor, escribe brevemente el *motivo o asunto* de tu consulta para que podamos asignarte al asesor indicado y darte una respuesta más rápida:\n\n_(O escribe *0* si deseas cancelar y volver al menú principal)_';
    }
    let msg = schedule.outOfHoursMessage || DEFAULT_SCHEDULE.outOfHoursMessage;
    const summary = formatScheduleSummaryText();
    msg = msg.replaceAll('{schedule_summary}', summary);
    msg = msg.replaceAll('{botName}', 'Cadi');
    msg = msg.replaceAll('{adminPhone}', '573184849332');
    return msg;
  };

  // Modal Asesores Handlers
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
    if (finalPhone.length === 10) finalPhone = '57' + finalPhone;

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
        alert(`Ya existe un asesor con el número ${finalPhone} (${existingAdv.name}).`);
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

  const handleToggleActive = async (advId) => {
    const updated = advisors.map(a => {
      if (a.id === advId) return { ...a, active: !a.active };
      return a;
    });
    setAdvisors(updated);
    await persistAdvisors(updated);
  };

  const handleDeleteAdvisor = async (advId) => {
    const updated = advisors.filter(a => a.id !== advId);
    setAdvisors(updated);
    setDeleteConfirmId(null);
    await persistAdvisors(updated);
  };

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
    <div className="fade-in" style={{ maxWidth: '1120px', margin: '0 auto', padding: '24px 20px 48px 20px' }}>
      {/* Top Banner / Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px'
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
            <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c4b5fd' }}>
              🕒 Hora Colombia: {currentTimeBogota || 'Cargando...'}
            </span>
          </div>
          <h2 style={{ fontSize: '1.6rem', color: '#fff', marginTop: '6px', letterSpacing: '-0.02em' }}>
            Gestión de Asesores & Disponibilidad
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Administra el equipo humano, define las horas en las que hay asesor disponible y prueba la experiencia en el simulador.
          </p>
        </div>

        {/* Action Button for Team tab */}
        {activeSubTab === 'team' && (
          <button
            onClick={() => handleOpenModal()}
            className="btn btn-primary"
            style={{ padding: '10px 18px', fontSize: '0.92rem', boxShadow: '0 0 20px rgba(37,99,235,0.4)' }}
          >
            <UserPlus size={18} />
            <span>Agregar Asesor</span>
          </button>
        )}

        {/* Save Button for Schedule tab */}
        {activeSubTab === 'schedule' && (
          <button
            onClick={() => handleSaveSchedule()}
            disabled={scheduleSaving}
            className="btn btn-emerald"
            style={{ padding: '10px 20px', fontSize: '0.92rem', boxShadow: '0 0 20px rgba(16,185,129,0.3)' }}
          >
            {scheduleSaving ? (
              <>
                <RefreshCw size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>Guardar Horarios</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Modern Sub-Tab Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--bg-canvas)',
        padding: '6px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        marginBottom: '24px',
        overflowX: 'auto'
      }}>
        <button
          onClick={() => setActiveSubTab('team')}
          style={{
            flex: 1,
            minWidth: '200px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: activeSubTab === 'team' ? 'var(--primary)' : 'transparent',
            color: activeSubTab === 'team' ? '#fff' : 'var(--text-muted)',
            fontWeight: activeSubTab === 'team' ? 700 : 500,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: activeSubTab === 'team' ? '0 4px 14px rgba(37,99,235,0.35)' : 'none'
          }}
        >
          <UserCheck size={18} />
          <span>Equipo de Asesores</span>
          <span style={{
            fontSize: '0.75rem',
            background: activeSubTab === 'team' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            {advisors.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('schedule')}
          style={{
            flex: 1,
            minWidth: '210px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: activeSubTab === 'schedule' ? 'var(--primary)' : 'transparent',
            color: activeSubTab === 'schedule' ? '#fff' : 'var(--text-muted)',
            fontWeight: activeSubTab === 'schedule' ? 700 : 500,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: activeSubTab === 'schedule' ? '0 4px 14px rgba(37,99,235,0.35)' : 'none'
          }}
        >
          <Clock size={18} />
          <span>Horarios de Atención</span>
          <span style={{
            fontSize: '0.75rem',
            background: currentBotStatus.isAvailable ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)',
            color: currentBotStatus.isAvailable ? '#34d399' : '#fda4af',
            padding: '2px 8px',
            borderRadius: '12px',
            fontWeight: 700
          }}>
            {currentBotStatus.isAvailable ? 'Abierto' : 'Cerrado'}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('test_mode')}
          style={{
            flex: 1,
            minWidth: '230px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: activeSubTab === 'test_mode' ? 'var(--primary)' : 'transparent',
            color: activeSubTab === 'test_mode' ? '#fff' : 'var(--text-muted)',
            fontWeight: activeSubTab === 'test_mode' ? 700 : 500,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: activeSubTab === 'test_mode' ? '0 4px 14px rgba(37,99,235,0.35)' : 'none'
          }}
        >
          <Sparkles size={18} color={activeSubTab === 'test_mode' ? '#fde047' : '#94a3b8'} />
          <span>Modo de Prueba & Simulador</span>
          {schedule.testMode?.enabled && (
            <span style={{
              fontSize: '0.72rem',
              background: 'rgba(245,158,11,0.25)',
              color: '#fbbf24',
              padding: '2px 8px',
              borderRadius: '12px',
              fontWeight: 700
            }}>
              Test Activo
            </span>
          )}
        </button>
      </div>

      {/* Success Notification Alert */}
      {(saveSuccess || scheduleSuccess) && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#34d399',
          fontSize: '0.9rem',
          fontWeight: 600
        }}>
          <CheckCircle2 size={18} />
          <span>¡Configuración sincronizada exitosamente en tiempo real con el Bot de WhatsApp!</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: EQUIPO DE ASESORES */}
      {/* ========================================================= */}
      {activeSubTab === 'team' && (
        <div>
          {/* Metric Cards Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
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
                Reciben archivos y comprobantes
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Permiso Comandos
                </span>
                <Terminal size={20} color="#a78bfa" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginTop: '6px' }}>
                {advisors.filter(a => a.active && a.canExecuteCommands !== false).length}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Autorizados para !atender, !cola, !fin
              </div>
            </div>
          </div>

          {/* Search Bar */}
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
          </div>

          {/* Advisors Grid */}
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
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: HORARIOS DE ATENCIÓN */}
      {/* ========================================================= */}
      {activeSubTab === 'schedule' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Current Live Status Card */}
          <div className="glass-panel" style={{
            padding: '20px 24px',
            border: `1px solid ${currentBotStatus.color}40`,
            background: `linear-gradient(135deg, ${currentBotStatus.color}0d 0%, rgba(17, 24, 39, 0.95) 100%)`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: `${currentBotStatus.color}25`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: currentBotStatus.color,
                  flexShrink: 0
                }}>
                  {currentBotStatus.isAvailable ? <Sun size={24} /> : <Moon size={24} />}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.15rem', color: currentBotStatus.color }}>
                      {currentBotStatus.isAvailable ? 'ASESORES DISPONIBLES AHORA' : 'FUERA DE HORARIO ACTUALMENTE'}
                    </span>
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.75rem' }}>
                      {currentBotStatus.label}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
                    {currentBotStatus.slotInfo} &bull; Hora oficial del servidor: <strong style={{ color: '#fff' }}>{currentTimeBogota}</strong>
                  </p>
                </div>
              </div>

              {/* Mode indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>Modo activo:</span>
                <span className="badge" style={{
                  background: schedule.mode === 'auto' ? 'rgba(59, 130, 246, 0.2)' : (schedule.mode === 'always_open' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'),
                  color: schedule.mode === 'auto' ? '#93c5fd' : (schedule.mode === 'always_open' ? '#34d399' : '#fda4af'),
                  padding: '4px 10px',
                  fontWeight: 700
                }}>
                  {schedule.mode === 'auto' ? '⚙️ Automático Semanal' : (schedule.mode === 'always_open' ? '🟢 Forzado 24/7' : '🔴 Forzado Cerrado')}
                </span>
              </div>
            </div>
          </div>

          {/* Master Mode Selector */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <h3 style={{ fontSize: '1.05rem', color: '#fff', fontWeight: 700, marginBottom: '6px' }}>
              Modo de Operación del Bot
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Elige si deseas que el bot siga la programación horaria semanal o forzar un estado manual de disponibilidad.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              {/* Option 1: Auto */}
              <div
                onClick={() => setSchedule({ ...schedule, mode: 'auto' })}
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  border: schedule.mode === 'auto' ? '2px solid var(--primary)' : '1px solid var(--border-subtle)',
                  background: schedule.mode === 'auto' ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-canvas)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#fff' }}>
                    <Calendar size={18} color="#60a5fa" />
                    <span>Automático Semanal</span>
                  </div>
                  <input
                    type="radio"
                    name="scheduleMode"
                    checked={schedule.mode === 'auto'}
                    onChange={() => setSchedule({ ...schedule, mode: 'auto' })}
                  />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Abre y cierra la atención de asesores automáticamente según el cronograma de días y franjas establecido abajo.
                </p>
              </div>

              {/* Option 2: Always Open */}
              <div
                onClick={() => setSchedule({ ...schedule, mode: 'always_open' })}
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  border: schedule.mode === 'always_open' ? '2px solid #10b981' : '1px solid var(--border-subtle)',
                  background: schedule.mode === 'always_open' ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-canvas)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#fff' }}>
                    <Zap size={18} color="#34d399" />
                    <span>Forzar Disponible (24/7)</span>
                  </div>
                  <input
                    type="radio"
                    name="scheduleMode"
                    checked={schedule.mode === 'always_open'}
                    onChange={() => setSchedule({ ...schedule, mode: 'always_open' })}
                  />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Los asesores se consideran siempre disponibles día y noche, ignorando las horas de cierre (ideal para campañas).
                </p>
              </div>

              {/* Option 3: Always Closed */}
              <div
                onClick={() => setSchedule({ ...schedule, mode: 'always_closed' })}
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  border: schedule.mode === 'always_closed' ? '2px solid #f43f5e' : '1px solid var(--border-subtle)',
                  background: schedule.mode === 'always_closed' ? 'rgba(244, 63, 94, 0.12)' : 'var(--bg-canvas)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#fff' }}>
                    <Moon size={18} color="#f43f5e" />
                    <span>Forzar No Disponible</span>
                  </div>
                  <input
                    type="radio"
                    name="scheduleMode"
                    checked={schedule.mode === 'always_closed'}
                    onChange={() => setSchedule({ ...schedule, mode: 'always_closed' })}
                  />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  El bot responderá inmediatamente con el mensaje de fuera de servicio (vacaciones, descanso o festivos).
                </p>
              </div>
            </div>
          </div>

          {/* Weekly Schedule Days Editor */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', color: '#fff', fontWeight: 700 }}>
                  Cronograma Semanal (Días & Franjas Horarias)
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Define los turnos de atención para cada día. Puedes agregar múltiples turnos (ej. mañana y tarde).
                </p>
              </div>

              <button
                onClick={handleCopyMondayToWeek}
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', padding: '7px 14px', gap: '6px' }}
                title="Copia los turnos del lunes a martes, miércoles, jueves y viernes"
              >
                <Copy size={15} />
                <span>{copySuccess ? '¡Copiado a Lu-Vi!' : 'Copiar Lunes a toda la semana'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[1, 2, 3, 4, 5, 6, 0].map(dayKey => {
                const dayConfig = schedule.days?.[dayKey] || { name: 'Día', enabled: false, slots: [] };
                return (
                  <div
                    key={dayKey}
                    style={{
                      background: dayConfig.enabled ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)',
                      border: dayConfig.enabled ? '1px solid rgba(255,255,255,0.08)' : '1px dashed rgba(255,255,255,0.04)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '14px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '150px' }}>
                        <button
                          type="button"
                          onClick={() => handleDayToggle(dayKey)}
                          style={{
                            background: dayConfig.enabled ? '#10b981' : 'rgba(255,255,255,0.1)',
                            border: 'none',
                            color: '#fff',
                            width: '36px',
                            height: '22px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <span style={{
                            width: '16px',
                            height: '16px',
                            background: '#fff',
                            borderRadius: '50%',
                            position: 'absolute',
                            top: '3px',
                            left: dayConfig.enabled ? '17px' : '3px',
                            transition: 'left 0.2s ease'
                          }} />
                        </button>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          color: dayConfig.enabled ? '#fff' : 'var(--text-dim)'
                        }}>
                          {dayConfig.name}
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          color: dayConfig.enabled ? '#34d399' : 'var(--text-dim)'
                        }}>
                          {dayConfig.enabled ? 'Atención activa' : 'Cerrado'}
                        </span>
                      </div>

                      {/* Slots */}
                      {dayConfig.enabled && (
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flex: 1, justifyContent: 'flex-end' }}>
                          {(dayConfig.slots || []).map((slot, sIdx) => (
                            <div
                              key={sIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'var(--bg-input)',
                                padding: '4px 10px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-subtle)'
                              }}
                            >
                              <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>Turno {sIdx + 1}:</span>
                              <input
                                type="time"
                                value={slot.start}
                                onChange={(e) => handleSlotChange(dayKey, sIdx, 'start', e.target.value)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#fff',
                                  fontSize: '0.85rem',
                                  padding: '2px 4px',
                                  outline: 'none'
                                }}
                              />
                              <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>a</span>
                              <input
                                type="time"
                                value={slot.end}
                                onChange={(e) => handleSlotChange(dayKey, sIdx, 'end', e.target.value)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#fff',
                                  fontSize: '0.85rem',
                                  padding: '2px 4px',
                                  outline: 'none'
                                }}
                              />
                              {(dayConfig.slots.length > 1) && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSlot(dayKey, sIdx)}
                                  style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '2px' }}
                                  title="Eliminar este turno"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => handleAddSlot(dayKey)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.78rem', gap: '4px' }}
                          >
                            <Plus size={13} />
                            <span>Agregar Turno</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Out of Hours Message Editor */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <h3 style={{ fontSize: '1.05rem', color: '#fff', fontWeight: 700, marginBottom: '4px' }}>
              Mensaje Automático de Fuera de Horario
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Este es el texto que enviará el bot cuando un cliente escriba <em>"10"</em> o <em>"humano"</em> fuera del horario configurado.
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', alignSelf: 'center' }}>Variables disponibles:</span>
              <button
                type="button"
                onClick={() => setSchedule({ ...schedule, outOfHoursMessage: schedule.outOfHoursMessage + ' {schedule_summary}' })}
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#93c5fd',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                + {'{schedule_summary}'} (Resumen de Horario)
              </button>
              <button
                type="button"
                onClick={() => setSchedule({ ...schedule, outOfHoursMessage: schedule.outOfHoursMessage + ' {botName}' })}
                style={{
                  background: 'rgba(139, 92, 246, 0.15)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  color: '#c4b5fd',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                + {'{botName}'} (Nombre del Bot)
              </button>
              <button
                type="button"
                onClick={() => setSchedule({ ...schedule, outOfHoursMessage: schedule.outOfHoursMessage + ' {adminPhone}' })}
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                + {'{adminPhone}'} (Teléfono Soporte)
              </button>
            </div>

            <textarea
              rows={5}
              value={schedule.outOfHoursMessage || ''}
              onChange={(e) => setSchedule({ ...schedule, outOfHoursMessage: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                borderRadius: 'var(--radius-sm)'
              }}
            />

            {/* Live Preview of formatted message */}
            <div style={{ marginTop: '14px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                Vista Previa del Mensaje para el Cliente:
              </span>
              <div style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 16px',
                marginTop: '6px',
                fontSize: '0.85rem',
                whiteSpace: 'pre-line',
                color: '#e2e8f0',
                lineHeight: 1.5
              }}>
                {getSimulatedBotReply({ isAvailable: false })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: MODO DE PRUEBA & SIMULADOR */}
      {/* ========================================================= */}
      {activeSubTab === 'test_mode' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Header Banner */}
          <div className="glass-panel" style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={20} color="#fbbf24" />
                  <h3 style={{ fontSize: '1.2rem', color: '#fff', fontWeight: 700 }}>
                    Entorno de Prueba & Simulador de Asesor
                  </h3>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '4px' }}>
                  Prueba cualquier día y hora en el simulador sin afectar a los usuarios, o habilita el modo de prueba para tu número de WhatsApp.
                </p>
              </div>

              {/* Master Test Mode Switch */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(0,0,0,0.3)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                    Modo Prueba en WhatsApp
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    Bypass para números autorizados
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const updated = {
                      ...schedule,
                      testMode: {
                        ...schedule.testMode,
                        enabled: !schedule.testMode?.enabled
                      }
                    };
                    setSchedule(updated);
                    handleSaveSchedule(updated);
                  }}
                  style={{
                    background: schedule.testMode?.enabled ? '#f59e0b' : 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#fff',
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{
                    width: '18px',
                    height: '18px',
                    background: '#fff',
                    borderRadius: '50%',
                    position: 'absolute',
                    top: '3px',
                    left: schedule.testMode?.enabled ? '21px' : '3px',
                    transition: 'left 0.2s ease'
                  }} />
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 1: Interactive Time Machine Simulator */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 700, marginBottom: '6px' }}>
              Simulador Interactivo de Respuestas (Time Machine)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Elige si deseas evaluar la hora actual en tiempo real o simular un día y hora específicos para ver exactamente qué responderá el bot.
            </p>

            {/* Controls Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              background: 'var(--bg-canvas)',
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '20px'
            }}>
              {/* Toggle Realtime vs Custom */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setSimUseRealtime(true)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: simUseRealtime ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  🕒 Hora Actual ({currentTimeBogota})
                </button>
                <button
                  onClick={() => setSimUseRealtime(false)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: !simUseRealtime ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  📅 Simular Fecha / Hora
                </button>
              </div>

              {/* Day & Time Selectors (only if not realtime) */}
              {!simUseRealtime && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <select
                    value={simDay}
                    onChange={(e) => setSimDay(parseInt(e.target.value, 10))}
                    style={{ height: '36px', fontSize: '0.85rem', padding: '0 10px' }}
                  >
                    <option value={1}>Lunes</option>
                    <option value={2}>Martes</option>
                    <option value={3}>Miércoles</option>
                    <option value={4}>Jueves</option>
                    <option value={5}>Viernes</option>
                    <option value={6}>Sábado</option>
                    <option value={0}>Domingo</option>
                  </select>

                  <input
                    type="time"
                    value={simTime}
                    onChange={(e) => setSimTime(e.target.value)}
                    style={{ height: '36px', fontSize: '0.85rem', padding: '0 10px' }}
                  />
                </div>
              )}

              {/* Test Phone Input for Bypass check */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Simular Teléfono Cliente:</span>
                <input
                  type="text"
                  placeholder="ej. 573184849332"
                  value={simTestPhone}
                  onChange={(e) => setSimTestPhone(e.target.value)}
                  style={{ width: '150px', height: '36px', fontSize: '0.82rem' }}
                />
              </div>
            </div>

            {/* Verdict Banner */}
            <div style={{
              padding: '16px 20px',
              borderRadius: 'var(--radius-sm)',
              background: `${simEvaluation.color}15`,
              border: `1px solid ${simEvaluation.color}45`,
              marginBottom: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: simEvaluation.color
                  }} />
                  <strong style={{ color: simEvaluation.color, fontSize: '1rem', textTransform: 'uppercase' }}>
                    {simEvaluation.isAvailable ? '✅ RESULTADO: ASESOR DISPONIBLE' : '🌙 RESULTADO: FUERA DE HORARIO'}
                  </strong>
                  <span className="badge" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.74rem' }}>
                    {simEvaluation.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {simEvaluation.slotInfo}
                </div>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                {simUseRealtime ? 'Evaluando hora real de Colombia' : `Simulando ${['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][simDay]} a las ${simTime}`}
              </div>
            </div>

            {/* WhatsApp Realistic Chat Mockup */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* Client Perspective */}
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
                  1. Lo que ve el cliente en WhatsApp:
                </span>
                <div style={{
                  background: '#0b141a',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '16px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  minHeight: '260px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  {/* WhatsApp Chat Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    paddingBottom: '10px',
                    marginBottom: '14px'
                  }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.85rem'
                    }}>
                      C
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>Cadi &bull; CAD Impresiones</div>
                      <div style={{ fontSize: '0.72rem', color: '#34d399' }}>en línea</div>
                    </div>
                  </div>

                  {/* Messages Bubble */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Client Bubble */}
                    <div style={{
                      alignSelf: 'flex-end',
                      background: '#005c4b',
                      color: '#e9edef',
                      padding: '8px 12px',
                      borderRadius: '8px 8px 0 8px',
                      fontSize: '0.84rem',
                      maxWidth: '80%'
                    }}>
                      10
                      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', textAlign: 'right', marginTop: '2px' }}>
                        {simUseRealtime ? 'Ahora' : simTime}
                      </div>
                    </div>

                    {/* Bot Reply Bubble */}
                    <div style={{
                      alignSelf: 'flex-start',
                      background: '#202c33',
                      color: '#e9edef',
                      padding: '10px 14px',
                      borderRadius: '8px 8px 8px 0',
                      fontSize: '0.84rem',
                      maxWidth: '85%',
                      whiteSpace: 'pre-line',
                      lineHeight: 1.45,
                      borderLeft: simEvaluation.isAvailable ? '3px solid #34d399' : '3px solid #f43f5e'
                    }}>
                      {getSimulatedBotReply(simEvaluation)}
                      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', textAlign: 'right', marginTop: '4px' }}>
                        {simUseRealtime ? 'Ahora' : simTime}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '14px' }}>
                    Simulación en tiempo real &bull; Motor Dialogflow
                  </div>
                </div>
              </div>

              {/* Advisor Perspective */}
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
                  2. Lo que recibirían los Asesores en WhatsApp:
                </span>
                <div style={{
                  background: '#0b141a',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '16px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  minHeight: '260px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  {/* Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    paddingBottom: '10px',
                    marginBottom: '14px'
                  }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>
                      Alerta al Equipo ({supportCount} receptores)
                    </span>
                    <span className="badge" style={{
                      background: simEvaluation.isAvailable ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)',
                      color: simEvaluation.isAvailable ? '#34d399' : '#fda4af',
                      fontSize: '0.72rem'
                    }}>
                      {simEvaluation.isAvailable ? 'Alerta Emitida' : 'Sin Alerta (Bloqueado)'}
                    </span>
                  </div>

                  {simEvaluation.isAvailable ? (
                    <div style={{
                      background: '#202c33',
                      color: '#e9edef',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      whiteSpace: 'pre-line',
                      lineHeight: 1.45,
                      borderLeft: '3px solid #f59e0b'
                    }}>
                      {`🚨 *Solicitud de Soporte*\n\n👤 *Cliente:* Juan Pérez (Simulación)\n📱 *Teléfono:* +57 300 123 4567\n📝 *Asunto:* Cotización de planos urgentes\n\nPara atender este chat, envía:\n*!atender*`}
                    </div>
                  ) : (
                    <div style={{
                      padding: '24px 16px',
                      textAlign: 'center',
                      color: 'var(--text-dim)',
                      fontSize: '0.85rem'
                    }}>
                      🌙 Al estar fuera de horario, ningún asesor recibe alertas sonoras en su celular. El bot retiene la consulta con el mensaje nocturno.
                    </div>
                  )}

                  <div style={{ marginTop: '12px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                      Asesores configurados para recibir alertas:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {advisors.filter(a => a.active && a.receiveSupport !== false).map(a => (
                        <span key={a.id} className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: '#93c5fd', fontSize: '0.7rem' }}>
                          {a.name} (+{a.phone})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Test Mode WhatsApp Settings */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', color: '#fff', fontWeight: 700, marginBottom: '6px' }}>
              Configuración de Números de Prueba (Whitelist VIP)
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Los números agregados aquí pueden solicitar asesor a cualquier hora aunque el bot esté fuera de horario, ideal para técnicos y administradores.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              {/* Option 1: Bypass Schedule */}
              <label style={{
                background: 'var(--bg-canvas)',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}>
                <div>
                  <span style={{ fontSize: '0.88rem', color: '#fff', display: 'block', fontWeight: 600 }}>
                    Permitir Bypass de Horario
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                    Ignora el fuera de horario para los teléfonos de prueba
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={schedule.testMode?.bypassSchedule !== false}
                  onChange={(e) => {
                    const updated = {
                      ...schedule,
                      testMode: {
                        ...schedule.testMode,
                        bypassSchedule: e.target.checked
                      }
                    };
                    setSchedule(updated);
                    handleSaveSchedule(updated);
                  }}
                  style={{ width: '18px', height: '18px' }}
                />
              </label>

              {/* Option 2: Isolate Test Alerts */}
              <label style={{
                background: 'var(--bg-canvas)',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}>
                <div>
                  <span style={{ fontSize: '0.88rem', color: '#fff', display: 'block', fontWeight: 600 }}>
                    Aislar Alertas de Prueba
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                    Notifica únicamente a los teléfonos de prueba (no alerta a todo el equipo)
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={!!schedule.testMode?.notifyOnlyTestAdvisors}
                  onChange={(e) => {
                    const updated = {
                      ...schedule,
                      testMode: {
                        ...schedule.testMode,
                        notifyOnlyTestAdvisors: e.target.checked
                      }
                    };
                    setSchedule(updated);
                    handleSaveSchedule(updated);
                  }}
                  style={{ width: '18px', height: '18px' }}
                />
              </label>
            </div>

            {/* Test Phone Numbers Manager */}
            <div>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                Teléfonos de Prueba Autorizados:
              </span>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', maxWidth: '420px' }}>
                <input
                  type="text"
                  placeholder="ej. 573184849332 o 3184849332"
                  value={newTestPhoneInput}
                  onChange={(e) => setNewTestPhoneInput(e.target.value)}
                  style={{ height: '38px', fontSize: '0.85rem' }}
                />
                <button
                  type="button"
                  onClick={handleAddTestPhone}
                  className="btn btn-secondary"
                  style={{ padding: '0 16px', fontSize: '0.84rem' }}
                >
                  Agregar
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {(schedule.testMode?.testPhones || []).map(phone => (
                  <div
                    key={phone}
                    style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      color: '#fbbf24',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>+{phone}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTestPhone(phone)}
                      style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '0' }}
                      title="Quitar teléfono de prueba"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {(schedule.testMode?.testPhones || []).length === 0 && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    No hay teléfonos de prueba registrados.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: Live WhatsApp Test Trigger */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Send size={18} color="#34d399" />
                  <h3 style={{ fontSize: '1.05rem', color: '#fff', fontWeight: 700 }}>
                    Disparador de Alerta de Prueba a WhatsApp Real
                  </h3>
                </div>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Envía una notificación de prueba real a los celulares de los asesores con el comando <em>!atender</em> para confirmar que WhatsApp recibe alertas.
                </p>
              </div>

              <button
                type="button"
                onClick={handleTriggerLiveTestAlert}
                disabled={liveTestSending}
                className="btn btn-emerald"
                style={{ padding: '9px 18px', fontSize: '0.88rem', gap: '8px' }}
              >
                {liveTestSending ? (
                  <>
                    <RefreshCw size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Disparando...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>Disparar Alerta a WhatsApp</span>
                  </>
                )}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginTop: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  Destinatario de la Prueba:
                </label>
                <select
                  value={liveTestTarget}
                  onChange={(e) => setLiveTestTarget(e.target.value)}
                  style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
                >
                  <option value="all">📢 Todos los asesores de soporte ({supportCount})</option>
                  {advisors.map(a => (
                    <option key={a.id} value={a.phone}>
                      👤 {a.name} (+{a.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  Asunto del Ticket Simulado:
                </label>
                <input
                  type="text"
                  value={liveTestSubject}
                  onChange={(e) => setLiveTestSubject(e.target.value)}
                  placeholder="ej. Prueba de notificación técnica"
                  style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Last Execution Feedback */}
            {liveTestResult && (
              <div style={{
                marginTop: '16px',
                background: liveTestResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                border: `1px solid ${liveTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '12px 16px',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {liveTestResult.success ? <CheckCircle2 size={16} color="#34d399" /> : <AlertTriangle size={16} color="#f43f5e" />}
                  <span style={{ color: liveTestResult.success ? '#34d399' : '#fda4af', fontWeight: 600 }}>
                    {liveTestResult.success
                      ? `¡Última alerta enviada con éxito a ${liveTestResult.count} asesor(es)!`
                      : `Error enviando alerta: ${liveTestResult.error}`}
                  </span>
                </div>
                <div style={{ color: 'var(--text-dim)' }}>
                  Hora de envío: {liveTestResult.timeStr || new Date(liveTestResult.timestamp).toLocaleTimeString('es-CO')}
                </div>
              </div>
            )}
          </div>
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
                    Se normalizará a formato internacional.
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
                    ID en WhatsApp Web / PC.
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
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>Recibe la alerta cuando un cliente pide asesor (!atender)</span>
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
