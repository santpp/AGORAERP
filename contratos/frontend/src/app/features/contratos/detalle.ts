import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, ContratoDetalle, EnvioResultado } from '../../core/api';
import { dinero, etiquetaEstado, fecha } from '../../core/formato';

@Component({
  selector: 'app-detalle-contrato',
  imports: [RouterLink, MatButtonModule],
  templateUrl: './detalle.html',
  styleUrl: './detalle.scss',
})
export class DetalleContrato implements OnInit {
  private readonly api = inject(ApiService);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly uid = this.ruta.snapshot.paramMap.get('uid') ?? '';
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly contrato = signal<ContratoDetalle | null>(null);

  protected readonly ocupado = signal(false);
  protected readonly accionError = signal('');
  protected readonly envio = signal<EnvioResultado | null>(null);
  protected readonly confirmarRevocar = signal(false);
  protected readonly copiado = signal(false);

  protected readonly etiqueta = etiquetaEstado;
  protected readonly dinero = dinero;
  protected readonly fecha = fecha;

  ngOnInit(): void {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set('');
    this.api.contrato(this.uid).subscribe({
      next: (c) => {
        this.contrato.set(c);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.cargando.set(false);
      },
    });
  }

  protected enviar(): void {
    this.accion(() => this.api.enviar(this.uid), (resultado) => {
      this.envio.set(resultado as EnvioResultado);
      this.copiado.set(false);
    });
  }

  protected revocar(): void {
    if (!this.confirmarRevocar()) {
      this.confirmarRevocar.set(true);
      return;
    }
    this.confirmarRevocar.set(false);
    this.envio.set(null);
    this.accion(() => this.api.revocar(this.uid));
  }

  protected async copiarEnlace(): Promise<void> {
    const enlace = this.envio()?.enlace;
    if (!enlace) {
      return;
    }
    await navigator.clipboard.writeText(enlace);
    this.copiado.set(true);
  }

  private accion<T>(ejecutar: () => import('rxjs').Observable<T>, alTerminar?: (resultado: T) => void): void {
    this.ocupado.set(true);
    this.accionError.set('');
    ejecutar().subscribe({
      next: (resultado) => {
        alTerminar?.(resultado);
        this.ocupado.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        this.accionError.set(e.message);
        this.ocupado.set(false);
      },
    });
  }
}
