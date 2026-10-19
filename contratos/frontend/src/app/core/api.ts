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
  calculo: {
    precio_curso: string;
    cargos: Cargo[];
    total_cargos: string;
    total_a_pagar: string;
    cuotas: Cuota[];
  };
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

  revocar(uid: string): Observable<unknown> {
    return this.http.post(`/api/contratos/${uid}/revocar`, {}).pipe(catchError(mensajeDeError));
  }
}

/** Convierte la respuesta de error de la API en un mensaje legible en español. */
export function mensajeDeError(error: HttpErrorResponse): Observable<never> {
  const mensaje = typeof error.error?.error === 'string' ? error.error.error : 'No se pudo completar la acción. Intenta de nuevo.';
  return throwError(() => new Error(mensaje));
}
