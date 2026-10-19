import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api';
import { SesionService } from '../../core/sesion';

/** Una escena del fondo: su luz (clase CSS) y, si existe, una foto propia en public/panel/fondos/. */
interface Escena {
  clase: string;
  titulo: string;
  texto: string;
  foto?: string;
}

@Component({
  selector: 'app-login',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  protected readonly escenas: Escena[] = [
    {
      clase: 'escena--atardecer',
      titulo: 'Convenios de pago, en un solo lugar',
      texto: 'Prepara, envía y da seguimiento a los convenios de los estudiantes.',
    },
    {
      clase: 'escena--noche',
      titulo: 'Cada contrato, con su historial',
      texto: 'Cada cambio queda registrado: quién lo hizo y cuándo.',
    },
    {
      clase: 'escena--dia',
      titulo: 'Firma desde cualquier dispositivo',
      texto: 'El estudiante recibe un enlace por correo y firma en su teléfono.',
    },
    {
      clase: 'escena--brasa',
      titulo: 'Claridad desde la solicitud hasta la firma',
      texto: 'Un solo convenio, con cuotas, fechas y montos siempre a la vista.',
    },
  ];

  protected correo = '';
  protected clave = '';
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly actual = signal(0);
  protected readonly pausado = signal(false);

  private temporizador: ReturnType<typeof setInterval> | undefined;
  private readonly intervaloMs = 9000;

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
