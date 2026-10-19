import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';

export interface Usuario {
  id: number;
  correo: string;
  nombre: string;
  rol: 'ADMIN' | 'REMITENTE' | 'VISOR';
}

export type Estado = 'BORRADOR' | 'ENVIADO' | 'FIRMADO' | 'REVOCADA';

export interface ContratoResumen {
  uid: string;
  cliente: string;
  correo: string;
  version: number;
  estado: Estado;
  creado_en: string;
}

export interface Cuota {
  numero: number;
  vencimiento: string;
  monto: string;
  mes: number;
}

export interface Cargo {
  concepto: string;
  monto: string;
}

export interface ContratoDetalle {
  uid: string;
  estado: Estado;
  version: number;
  cliente: { nombre: string; correo: string };
  pdfs: { enviado: boolean; firmado: boolean };
  calculo: {
    precio_curso: string;
    cargos: Cargo[];
    total_cargos: string;
    total_a_pagar: string;
    cuotas: Cuota[];
  };
}

export interface CambiosCalculo {
  cuota: string;
  meses: number;
  anio: number;
  mes: number;
  cuotas_por_mes: number;
}

export interface ContactoGhl {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  cedula: string;
}

export interface NuevoContrato {
  cliente: { contact_id: string; nombre: string; cedula: string; telefono: string; correo: string };
  curso: { cuota_mensual: string; meses: number; mes_inicio: string; cuotas_por_mes: number; cargos: Cargo[] };
  responsable: { nombre: string; correo: string };
}

export interface EnvioResultado {
  version: number;
  enlace: string;
  vence: string;
}

/** Cliente de la API. Las cookies de sesión van solas (mismo dominio). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  yo(): Observable<{ usuario: Usuario }> {
    return this.http.get<{ usuario: Usuario }>('/api/yo').pipe(catchError(mensajeDeError));
  }

  login(correo: string, clave: string): Observable<{ usuario: Usuario }> {
    return this.http.post<{ usuario: Usuario }>('/api/login', { correo, clave }).pipe(catchError(mensajeDeError));
  }

  logout(): Observable<unknown> {
    return this.http.post('/api/logout', {}).pipe(catchError(mensajeDeError));
  }

  contratos(): Observable<{ contratos: ContratoResumen[] }> {
    return this.http.get<{ contratos: ContratoResumen[] }>('/api/contratos').pipe(catchError(mensajeDeError));
  }

  contrato(uid: string): Observable<ContratoDetalle> {
    return this.http.get<ContratoDetalle>(`/api/contratos/${uid}`).pipe(catchError(mensajeDeError));
  }

  enviar(uid: string): Observable<EnvioResultado> {
    return this.http.post<EnvioResultado>(`/api/contratos/${uid}/enviar`, {}).pipe(catchError(mensajeDeError));
  }

  /** Busca contactos en AGORA (los que se agregan allí aparecen aquí). */
  buscarContactos(consulta: string): Observable<{ contactos: ContactoGhl[] }> {
    return this.http
      .post<{ contactos: ContactoGhl[] }>('/api/ghl/contactos/buscar', { consulta })
      .pipe(catchError(mensajeDeError));
  }

  crear(datos: NuevoContrato): Observable<{ uid: string }> {
    return this.http.post<{ uid: string }>('/api/contratos', datos).pipe(catchError(mensajeDeError));
  }

  editar(uid: string, cambios: CambiosCalculo): Observable<{ version: number }> {
    return this.http.post<{ version: number }>(`/api/contratos/${uid}/editar`, cambios).pipe(catchError(mensajeDeError));
  }

  /** Ruta relativa del PDF (mismo dominio, la sesión viaja con la cookie). */
  urlPdf(uid: string, tipo: 'enviado' | 'firmado'): string {
    return `/api/contratos/${uid}/pdf/${tipo}`;
  }

  revocar(uid: string): Observable<unknown> {
    return this.http.post(`/api/contratos/${uid}/revocar`, {}).pipe(catchError(mensajeDeError));
  }
}

/** Convierte la respuesta de error de la API en un mensaje legible en español. */
export function mensajeDeError(error: HttpErrorResponse): Observable<never> {
  const mensaje = typeof error.error?.error === 'string' ? error.error.error : 'No se pudo completar la acción. Intenta de nuevo.';
  return throwError(() => new Error(mensaje));
}
