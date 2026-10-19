import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService, Cargo, CambiosCalculo, ContratoDetalle, DatosCliente, EnvioResultado } from '../../core/api';
import { dinero, etiquetaEstado, fecha } from '../../core/formato';
import { MESES } from '../../core/meses';
import { SesionService } from '../../core/sesion';

function esInscripcion(cargo: Cargo): boolean {
  return /inscrip/i.test(cargo.concepto);
}

@Component({
  selector: 'app-detalle-contrato',
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './detalle.html',
  styleUrl: './detalle.scss',
})
export class DetalleContrato implements OnInit {
  private readonly api = inject(ApiService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly sesion = inject(SesionService);

  protected readonly uid = this.ruta.snapshot.paramMap.get('uid') ?? '';
  protected readonly puedeActuar = computed(() => this.sesion.usuario()?.rol !== 'VISOR');
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly contrato = signal<ContratoDetalle | null>(null);

  protected readonly ocupado = signal(false);
  protected readonly accionError = signal('');
  protected readonly envio = signal<EnvioResultado | null>(null);
  protected readonly confirmarRevocar = signal(false);
  protected readonly copiado = signal(false);

  protected readonly editando = signal(false);
  protected readonly editarError = signal('');
  protected readonly anios = [new Date().getFullYear(), new Date().getFullYear() + 1];
  protected readonly meses = MESES;
  protected cambios: CambiosCalculo = { cuota: '', meses: 12, anio: this.anios[0], mes: 1, cuotas_por_mes: 1, cargos: [], descuento: '0' };
  protected inscripcion = '';
  protected readonly editandoCliente = signal(false);
  protected datosCliente: DatosCliente = { nombre: '', cedula: '', telefono: '', correo: '' };

  protected readonly pdfTipo = signal<'enviado' | 'firmado'>('enviado');
  protected readonly pdfHref = computed<string | null>(() => {
    const c = this.contrato();
    const tipo = this.pdfTipo();
    return c && c.pdfs[tipo] ? this.api.urlPdf(this.uid, tipo) : null;
  });

  protected readonly pdfUrl = computed<SafeResourceUrl | null>(() => {
    const c = this.contrato();
    if (!c) {
      return null;
    }
    const tipo = this.pdfTipo();
    if (!c.pdfs[tipo]) {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.api.urlPdf(this.uid, tipo));
  });

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
        this.pdfTipo.set(c.estado === 'FIRMADO' ? 'firmado' : 'enviado');
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.cargando.set(false);
      },
    });
  }

  protected abrirEdicion(): void {
    const c = this.contrato();
    if (c) {
      this.cambios = {
        ...this.cambios,
        cuota: c.calculo.cuotas[0]?.monto ?? '',
        meses: c.calculo.cuotas.length,
        descuento: c.descuento,
      };
      this.inscripcion = c.calculo.cargos.find((g) => esInscripcion(g))?.monto ?? '0';
    }
    this.editarError.set('');
    this.editando.set(true);
  }

  protected guardarEdicion(): void {
    this.editarError.set('');
    const c = this.contrato();
    const otros = (c?.calculo.cargos ?? []).filter((g) => !esInscripcion(g));
    const cargos: Cargo[] = [{ concepto: 'Inscripción', monto: this.inscripcion.trim() || '0' }, ...otros];
    this.accion(
      () => this.api.editar(this.uid, { ...this.cambios, cuota: this.cambios.cuota.trim(), cargos, descuento: String(this.cambios.descuento).trim() }),
      () => this.editando.set(false),
    );
  }

  protected abrirEdicionCliente(): void {
    const c = this.contrato();
    if (c) {
      this.datosCliente = { nombre: c.cliente.nombre, cedula: c.cliente.cedula, telefono: c.cliente.telefono, correo: c.cliente.correo };
    }
    this.editarError.set('');
    this.editandoCliente.set(true);
  }

  protected guardarCliente(): void {
    this.editarError.set('');
    this.accion(() => this.api.actualizarCliente(this.uid, this.datosCliente), () => this.editandoCliente.set(false));
  }

  protected enviar(): void {
    this.accion(() => this.api.enviar(this.uid), (resultado) => {
      this.envio.set(resultado as EnvioResultado);
      this.copiado.set(false);
      this.verPrevia.set(false);
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

  protected async copiarEnlace(enlace: string): Promise<void> {
    await navigator.clipboard.writeText(enlace);
    this.copiado.set(true);
  }

  protected readonly verPrevia = signal(false);
  protected readonly previaUrl = computed<SafeResourceUrl | null>(() => {
    if (!this.verPrevia()) {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.api.urlPrevia(this.uid));
  });

  private accion<T>(ejecutar: () => Observable<T>, alTerminar?: (resultado: T) => void): void {
    this.ocupado.set(true);
    this.accionError.set('');
    ejecutar().subscribe({
      next: (resultado) => {
        alTerminar?.(resultado);
        this.ocupado.set(false);
        this.cargar();
      },
      error: (e: Error) => {
        if (this.editando()) {
          this.editarError.set(e.message);
        } else {
          this.accionError.set(e.message);
        }
        this.ocupado.set(false);
      },
    });
  }
}
