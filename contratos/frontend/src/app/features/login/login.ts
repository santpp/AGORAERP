import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api';
import { SesionService } from '../../core/sesion';

/** Una escena: su atmósfera (clase CSS) y el texto editorial que la acompaña. */
interface Escena {
  clase: string;
  primera: string;
  segunda: string;
  texto: string;
}

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  protected readonly escenas: Escena[] = [
    {
      clase: 'escena--crepusculo',
      primera: 'Convenios de pago',
      segunda: 'con toda la claridad',
      texto: 'Cada contrato, desde la solicitud hasta la firma.',
    },
    {
      clase: 'escena--noche',
      primera: 'Cada acción',
      segunda: 'queda registrada',
      texto: 'Un historial completo de cada convenio, a la vista.',
    },
    {
      clase: 'escena--bruma',
      primera: 'Firma',
      segunda: 'desde cualquier lugar',
      texto: 'El estudiante firma desde su teléfono, con el enlace que recibe por correo.',
    },
    {
      clase: 'escena--brasa',
      primera: 'Un solo convenio',
      segunda: 'siempre a la vista',
      texto: 'Cuotas, fechas y montos en un mismo documento.',
    },
  ];

  protected correo = '';
  protected clave = '';
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly actual = signal(0);
  protected readonly pausado = signal(false);

  private temporizador: ReturnType<typeof setInterval> | undefined;
  private readonly intervaloMs = 10000;

  ngOnInit(): void {
    const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducirMovimiento) {
      this.temporizador = setInterval(() => {
        if (!this.pausado()) {
          this.actual.update((i) => (i + 1) % this.escenas.length);
        }
      }, this.intervaloMs);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.temporizador);
  }

  protected ir(indice: number): void {
    this.actual.set(indice);
  }

  protected alternarPausa(): void {
    this.pausado.update((v) => !v);
  }

  protected entrar(): void {
    if (this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.error.set('');
    this.api.login(this.correo.trim(), this.clave).subscribe({
      next: ({ usuario }) => {
        this.sesion.usuario.set(usuario);
        this.router.navigateByUrl('/contratos');
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.enviando.set(false);
      },
    });
  }
}
