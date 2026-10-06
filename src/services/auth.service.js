import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { Op, fn, col, where } from 'sequelize';
import { env } from '../config/env.js';
import { Empleada, UsuarioAdmin } from '../models/index.js';
import { conflict, forbidden, unauthorized } from '../utils/errors.js';

const ROUNDS = 10;

/** Usuario normalizado: minúsculas y sin espacios extremos. */
export function normalizarUsuario(usuario) {
  return String(usuario ?? '')
    .trim()
    .toLowerCase();
}

export async function hashPassword(password) {
  return bcrypt.hash(String(password), ROUNDS);
}

export async function verificarPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(password), hash);
}

export function firmarToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verificarToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    throw unauthorized('Sesión no válida o caducada');
  }
}

export async function asegurarAdmin() {
  const n = await UsuarioAdmin.count();
  if (n > 0) return;
  await UsuarioAdmin.create({
    id: randomUUID(),
    usuario: normalizarUsuario(env.adminUser),
    passwordHash: await hashPassword(env.adminPassword),
  });
}

export async function usuarioDisponible(usuario, { exceptEmpleadaId } = {}) {
  const u = normalizarUsuario(usuario);
  if (!u) return;
  const admin = await UsuarioAdmin.findOne({ where: where(fn('lower', col('usuario')), u) });
  if (admin) throw conflict('Ese usuario ya está en uso');
  const empleada = await Empleada.findOne({
    where: {
      [Op.and]: [where(fn('lower', col('usuario')), u), ...(exceptEmpleadaId ? [{ id: { [Op.ne]: exceptEmpleadaId } }] : [])],
    },
  });
  if (empleada) throw conflict('Ese usuario ya está en uso');
}

function perfilAdmin(admin) {
  return { id: admin.id, usuario: admin.usuario, nombre: 'Encargado', rol: 'admin' };
}

function perfilEmpleada(e) {
  return {
    id: e.id,
    usuario: e.usuario,
    nombre: e.nombre,
    rol: 'empleada',
    color: e.color,
  };
}

export async function login({ usuario, password }) {
  const nombre = normalizarUsuario(usuario);
  const clave = String(password ?? '');

  const admin = await UsuarioAdmin.findOne({ where: where(fn('lower', col('usuario')), nombre) });
  if (admin && (await verificarPassword(clave, admin.passwordHash))) {
    const token = firmarToken({ rol: 'admin', sub: admin.id });
    return { token, rol: 'admin', perfil: perfilAdmin(admin) };
  }

  const empleada = await Empleada.findOne({
    where: {
      [Op.and]: [where(fn('lower', col('usuario')), nombre), { eliminadaEn: null }],
    },
  });
  if (empleada && empleada.passwordHash && (await verificarPassword(clave, empleada.passwordHash))) {
    if (!empleada.activa) throw forbidden('Tu cuenta está inactiva. Habla con el encargado.');
    const token = firmarToken({ rol: 'empleada', sub: empleada.id });
    return { token, rol: 'empleada', perfil: perfilEmpleada(empleada) };
  }

  throw unauthorized('Usuario o contraseña incorrectos');
}

export async function perfilDesdePayload(payload) {
  if (payload.rol === 'admin') {
    const admin = await UsuarioAdmin.findByPk(payload.sub);
    if (!admin) throw unauthorized('Sesión no válida');
    return perfilAdmin(admin);
  }
  if (payload.rol === 'empleada') {
    const empleada = await Empleada.findByPk(payload.sub);
    if (!empleada || empleada.eliminadaEn) throw unauthorized('Sesión no válida');
    return perfilEmpleada(empleada);
  }
  throw unauthorized('Sesión no válida');
}
