import { doc, setDoc } from 'firebase/firestore';
import { db, getAllUsers } from '../src/firebase.js';
import { resolveClientRealPhone } from '../src/utils/helpers.js';

async function migrate() {
    console.log('🚀 Iniciando escaneo y sincronización de teléfonos reales en Firestore (colección "users")...');
    
    const allUsers = await getAllUsers();
    console.log(`📊 Total de usuarios encontrados en Firestore: ${allUsers.length}`);

    let updatedCount = 0;
    let alreadyCorrectCount = 0;
    let skippedCount = 0;
    const skippedUsers = [];

    for (const user of allUsers) {
        const resolved = resolveClientRealPhone(user);

        if (resolved.isValid && resolved.formattedPhone) {
            if (user.realPhone === resolved.formattedPhone) {
                alreadyCorrectCount++;
            } else {
                try {
                    await setDoc(doc(db, 'users', user.id), {
                        realPhone: resolved.formattedPhone
                    }, { merge: true });
                    updatedCount++;
                } catch (e) {
                    console.error(`❌ Error actualizando usuario ${user.name} (${user.id}):`, e.message);
                }
            }
        } else {
            skippedCount++;
            skippedUsers.push({
                name: user.name || 'Sin nombre',
                id: user.id,
                contactUser: user.contactUser || 'Vacío',
                reason: resolved.reason
            });
        }
    }

    console.log('\n══════════════════════════════════════════════════════');
    console.log('✅ REPORTE FINAL DE SINCRONIZACIÓN:');
    console.log(`• Total usuarios analizados: ${allUsers.length}`);
    console.log(`• Nuevos usuarios actualizados con realPhone: ${updatedCount}`);
    console.log(`• Usuarios que ya tenían realPhone correcto: ${alreadyCorrectCount}`);
    console.log(`• Usuarios omitidos (sin número de celular válido): ${skippedCount}`);
    console.log('══════════════════════════════════════════════════════\n');

    if (skippedUsers.length > 0) {
        console.log('📋 Lista de contactos omitidos (solo tienen @usuario o no registran número móvil):');
        skippedUsers.forEach((u, i) => {
            console.log(`  ${i + 1}. ${u.name} (ID: ${u.id}) -> Contacto: "${u.contactUser}" [${u.reason}]`);
        });
    }

    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Error fatal en migración:', err);
    process.exit(1);
});
