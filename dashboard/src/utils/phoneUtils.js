/**
 * Utilidades para resolución y formateo de números telefónicos en el Dashboard.
 * Permite distinguir entre números de teléfono celulares reales y LIDs de WhatsApp (14-16 dígitos)
 * o identificadores de solo usuario (@usuario).
 */

export const resolveClientPhone = (contact) => {
  if (!contact) {
    return {
      isValid: false,
      rawDigits: '',
      formattedPhone: '',
      displayPhone: 'Sin contacto',
      isOnlyHandle: false,
      handleText: '',
      reason: 'Dato vacío'
    };
  }

  const realPhoneCandidate = String(contact.realPhone || '').trim();
  const contactUserCandidate = String(contact.contactUser || '').trim();
  const phoneCandidate = String(contact.phone || '').trim();
  const idCandidate = String(contact.id || '').trim();

  const evaluateDigits = (candidateStr) => {
    if (!candidateStr) return null;
    if (candidateStr.startsWith('@')) {
      const digits = candidateStr.replace(/\D/g, '');
      if (digits.length < 10) return null;
    }

    const digits = candidateStr.replace(/\D/g, '');
    // Teléfonos móviles colombianos (10 dígitos ej. 300xxxxxxx) o con código 57 (12 dígitos ej. 57300xxxxxxx)
    // Fijos o internacionales entre 7 y 13 dígitos
    // Los LIDs de WhatsApp tienen 14 o más dígitos
    if (digits.length >= 10 && digits.length <= 13) {
      let normalized = digits;
      if (digits.length === 10) {
        normalized = '57' + digits;
      }
      return {
        rawDigits: digits,
        normalized: normalized
      };
    } else if (digits.length >= 7 && digits.length <= 9) {
      return {
        rawDigits: digits,
        normalized: '57' + digits
      };
    }
    return null;
  };

  let match = evaluateDigits(realPhoneCandidate);
  if (!match) {
    match = evaluateDigits(contactUserCandidate);
  }
  if (!match && phoneCandidate.replace(/\D/g, '').length <= 13) {
    match = evaluateDigits(phoneCandidate);
  }
  if (!match && idCandidate.replace(/\D/g, '').length <= 13) {
    match = evaluateDigits(idCandidate);
  }

  if (match) {
    let display = `+${match.normalized}`;
    if (match.normalized.startsWith('57') && match.normalized.length === 12) {
      const p = match.normalized;
      display = `+57 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8)}`;
    }
    return {
      isValid: true,
      rawDigits: match.rawDigits,
      formattedPhone: match.normalized,
      displayPhone: display,
      isOnlyHandle: false,
      handleText: contactUserCandidate.startsWith('@') ? contactUserCandidate : '',
      reason: ''
    };
  }

  const isOnlyHandle = contactUserCandidate.startsWith('@');
  return {
    isValid: false,
    rawDigits: '',
    formattedPhone: '',
    displayPhone: isOnlyHandle ? contactUserCandidate : 'Sin teléfono móvil',
    isOnlyHandle: isOnlyHandle,
    handleText: isOnlyHandle ? contactUserCandidate : '',
    reason: isOnlyHandle ? 'Sin número celular registrado (solo @usuario)' : 'Sin número celular válido'
  };
};
