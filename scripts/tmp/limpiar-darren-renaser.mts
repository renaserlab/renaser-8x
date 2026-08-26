/**
 * Orden de Kelin: nada de vincular — Darren entra con cuenta nueva en limpio y crea RENASER él mismo.
 * 1) Deshace la vinculación de Darren al Renaser viejo (membresía + participante).
 * 2) Elimina la empresa "Renaser" de las pruebas de kelinmerma (59732f45).
 * 3) Deja a Darren en limpio: elimina su empresa de prueba "Casa de cambio" y su cuenta,
 *    para que pueda registrarse de nuevo con el mismo correo, desde cero.
 */
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DARREN = "7ea018ec-96e1-44c1-902c-e349eb620428";
const RENASER_VIEJO = "59732f45-bd8c-493b-87ae-6851e6080a2d";
const CASA_CAMBIO = "3efc2b97-6e05-4712-bb50-51bdf23ce607";

// 1) deshacer vinculación
await sb.from("participants").delete().eq("company_id", RENASER_VIEJO).eq("user_id", DARREN);
await sb.from("memberships").delete().eq("company_id", RENASER_VIEJO).eq("user_id", DARREN);
console.log("vinculación de Darren al Renaser viejo: deshecha");

// 2) eliminar el Renaser de prueba de kelinmerma
const { error: e1 } = await sb.from("companies").delete().eq("id", RENASER_VIEJO);
console.log(e1 ? `ERROR al borrar Renaser viejo: ${e1.message}` : "empresa 'Renaser' (prueba de kelinmerma) eliminada");

// 3) Darren en limpio: fuera su empresa de prueba y su cuenta
const { error: e2 } = await sb.from("companies").delete().eq("id", CASA_CAMBIO);
console.log(e2 ? `ERROR al borrar Casa de cambio: ${e2.message}` : "empresa 'Casa de cambio' (prueba de Darren) eliminada");
await sb.from("memberships").delete().eq("user_id", DARREN);
await sb.from("users").delete().eq("id", DARREN);
const { error: e3 } = await sb.auth.admin.deleteUser(DARREN);
console.log(e3 ? `ERROR al borrar cuenta: ${e3.message}` : "cuenta darrensupaoficial@gmail.com eliminada — puede registrarse de nuevo, en limpio");
