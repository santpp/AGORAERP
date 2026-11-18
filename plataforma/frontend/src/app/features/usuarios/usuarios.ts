import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { ApiService, PersonaAdmin, Rol } from '../../core/api';
import { SesionService } from '../../core/sesion';

export const ROLES: { valor: Rol; etiqueta: string; ayuda: string }[] = [
  { valor: 'ADMIN', etiqueta: 'Administrador', ayuda: 'Todo, incluido personas' },
  { valor: 'REMITENTE', etiqueta: 'Puede enviar', ayuda: 'Crea, edita y envía convenios' },
  { valor: 'VISOR', etiqueta: 'Solo ver', ayuda: 'Consulta contratos y PDFs' },
];

@Component({
  selector: 'app-usuarios',
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class UsuariosPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly sesion = inject(SesionService);

  protected readonly roles = ROLES;
  protected readonly personas = signal<PersonaAdmin[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly aviso = signal('');
  protected readonly ocupado = signal(false);

  protected nueva = { correo: '', nombre: '', clave: '', rol: 'REMITENTE' as Rol };
  protected readonly editandoClave = signal<number | null>(null);
  protected clave = '';
  protected rolEditado: Record<number, Rol> = {};

  ngOnInit(): void {
    this.cargar();
  }

  protected etiquetaRol(rol: Rol): string {
    return ROLES.find((r) => r.valor === rol)?.etiqueta ?? rol;
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.usuarios().subscribe({
      next: ({ usuarios }) => {
        this.personas.set(usuarios);
        this.rolEditado = Object.fromEntries(usuarios.map((u) => [u.id, u.rol]));
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.cargando.set(false);
      },
    });
  }

  protected crear(formulario: NgForm): void {
    this.accion(() => this.api.crearUsuario({ ...this.nueva, correo: this.nueva.correo.trim(), nombre: this.nueva.nombre.trim() }), 'Persona agregada. Compártele la clave temporal por un medio seguro.', () => {
      formulario.resetForm({ rol: 'REMITENTE' });
    });
  }

  protected guardarRol(p: PersonaAdmin): void {
    const rol = this.rolEditado[p.id];
    if (rol === p.rol) {
      return;
    }
    this.accion(() => this.api.cambiarRol(p.id, rol), 'Rol actualizado. Sus sesiones abiertas se cerraron.');
  }

  protected cambiarActivo(p: PersonaAdmin): void {
    const operacion = p.activo ? this.api.desactivarUsuario(p.id) : this.api.activarUsuario(p.id);
    this.accion(() => operacion, p.activo ? 'Cuenta desactivada.' : 'Cuenta activada.');
  }

  protected guardarClave(p: PersonaAdmin): void {
    this.accion(() => this.api.restablecerClave(p.id, this.clave), 'Clave cambiada. Sus sesiones abiertas se cerraron.', () => {
      this.editandoClave.set(null);
      this.clave = '';
    });
  }

  private accion(ejecutar: () => import('rxjs').Observable<unknown>, mensaje: string, alTerminar?: () => void): void {
    this.ocupado.set(true);
    this.error.set('');
    this.aviso.set('');
    ejecutar().subscribe({
      next: () => {
        this.aviso.set(mensaje);
        alTerminar?.();
        this.ocupado.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.ocupado.set(false);
      },
    });
  }
}
