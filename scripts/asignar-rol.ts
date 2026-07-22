/**
 * Asigna un rol a un usuario ya creado en Supabase Auth.
 *
 *   npx tsx scripts/asignar-rol.ts correo@ejemplo.com Administrador
 *   npx tsx scripts/asignar-rol.ts               (lista usuarios y roles)
 *
 * El usuario se crea desde el panel de Supabase (Authentication -> Users), no
 * desde aqui: las contrasenas las maneja el duenno de la cuenta, no un script.
 * El trigger tr_auth_user_creado le asigna el rol 'Consulta' al registrarse;
 * este script lo promueve.
 */

import { consultar, lit } from './api-supabase';

async function main() {
  const [email, rol] = process.argv.slice(2);

  if (!email || !rol) {
    const usuarios = await consultar(`
      select u.email, coalesce(r.nombre, '(sin perfil)') as rol, u.activo
        from usuario u left join rol r on r.id = u.rol_id
       order by u.email;
    `);
    const huerfanos = await consultar(`
      select a.email from auth.users a
       left join usuario u on u.id = a.id
       where u.id is null;
    `);
    const roles = await consultar('select nombre from rol order by nombre;');

    console.log('\nUsuarios con perfil:');
    if (usuarios.length === 0) console.log('  (ninguno)');
    for (const u of usuarios) {
      console.log(
        `  ${String(u['email']).padEnd(34)} ${u['rol']}${u['activo'] ? '' : '  [inactivo]'}`,
      );
    }

    if (huerfanos.length > 0) {
      console.log('\nEn Auth pero SIN perfil en la tabla usuario:');
      for (const u of huerfanos) console.log(`  ${u['email']}`);
      console.log('  (se crean solos al registrarse; si aparecen aqui, avisar)');
    }

    console.log(`\nRoles disponibles: ${roles.map((r) => r['nombre']).join(', ')}`);
    console.log('\nUso: npx tsx scripts/asignar-rol.ts <correo> <rol>\n');
    return;
  }

  const filas = await consultar(`
    update usuario u
       set rol_id = r.id
      from rol r
     where r.nombre = ${lit(rol)}
       and u.email = ${lit(email)}
    returning u.email, r.nombre as rol;
  `);

  if (filas.length === 0) {
    console.error(
      `\nNo se actualizo nada. Revisar que exista el usuario ${email} y el rol ${rol}.`,
    );
    console.error('Ejecutar sin argumentos para ver la lista.\n');
    process.exit(1);
  }

  console.log(`\n${filas[0]!['email']} → rol ${filas[0]!['rol']}\n`);
}

main().catch((e: unknown) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
