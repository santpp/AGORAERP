import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { ApiService, ContactoGhl } from '../../core/api';
import { MESES, mesInicio } from '../../core/meses';
import { SesionService } from '../../core/sesion';

@Component({
  selector: 'app-nuevo-contrato',
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './nuevo.html',
  styleUrl: './nuevo.scss',
})
export class NuevoContrato {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly sesion = inject(SesionService);

  protected readonly meses = MESES;
  protected readonly anios = [new Date().getFullYear(), new Date().getFullYear() + 1];

  // Paso 1: buscar el contacto en GHL
  protected consulta = '';
  protected readonly buscando = signal(false);
  protected readonly busquedaHecha = signal(false);
  protected readonly busquedaError = signal('');
  protected readonly resultados = signal<ContactoGhl[]>([]);
  protected readonly elegido = signal<ContactoGhl | null>(null);

  // Paso 2: datos del convenio para ese contacto
  protected cedula = '';
  protected nombre = '';
  protected readonly aviso = signal('');
  protected curso = { cuota: '', meses: 12, anio: this.anios[0], mes: 1, cuotasPorMes: 1 };
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  protected readonly listoParaCrear = computed(() => this.elegido() !== null);

  protected buscar(): void {
    const texto = this.consulta.trim();
    if (texto.length < 2 || this.buscando()) {
      return;
    }
    this.buscando.set(true);
    this.busquedaError.set('');
    this.api.buscarContactos(texto).subscribe({
      next: ({ contactos, aviso }) => {
        this.aviso.set(aviso ?? '');
        this.resultados.set(contactos);
        this.busquedaHecha.set(true);
        this.buscando.set(false);
      },
      error: (e: Error) => {
        this.busquedaError.set(e.message);
        this.buscando.set(false);
      },
    });
  }

  protected elegir(contacto: ContactoGhl): void {
    this.elegido.set(contacto);
    this.nombre = contacto.nombre;
    this.cedula = contacto.cedula;
    this.error.set('');
  }

  protected cambiarContacto(): void {
    this.elegido.set(null);
  }

  protected crear(): void {
    const contacto = this.elegido();
    if (!contacto || this.guardando()) {
      return;
    }
    this.guardando.set(true);
    this.error.set('');
    const responsable = this.sesion.usuario();
    this.api
      .crear({
        cliente: {
          contact_id: contacto.id,
          nombre: this.nombre.trim(),
          cedula: this.cedula.trim(),
          telefono: contacto.telefono,
          correo: contacto.correo,
        },
        curso: {
          cuota_mensual: this.curso.cuota.trim(),
          meses: Number(this.curso.meses),
          mes_inicio: mesInicio(Number(this.curso.anio), Number(this.curso.mes)),
          cuotas_por_mes: Number(this.curso.cuotasPorMes),
          cargos: [],
        },
        // Quien crea el convenio recibe el aviso cuando el cliente firma.
        responsable: { nombre: responsable?.nombre ?? '', correo: responsable?.correo ?? '' },
      })
      .subscribe({
        next: ({ uid }) => this.router.navigateByUrl(`/contratos/${uid}`),
        error: (e: Error) => {
          this.error.set(e.message);
          this.guardando.set(false);
        },
      });
  }
}
